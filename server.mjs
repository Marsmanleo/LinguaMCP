#!/usr/bin/env node
// LinguaMCP — Open curriculum protocol for AI language tutors
// MARS-280: One Soul, Every Language, Any AI
// MARS-282: SQLite storage adapter for true self-hosted

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createSupabaseStorage } from "./storage/supabase.mjs";
import { createSqliteStorage } from "./storage/sqlite.mjs";

// ============================================================
// .env loader (inline, no dependency)
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      // Don't overwrite env vars that were explicitly set before this script
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
  console.log("[LinguaMCP] Loaded .env from", envPath);
}

// ============================================================
// Configuration
// ============================================================

const PORT = parseInt(process.env.LINGUA_MCP_PORT || "18800", 10);
const SUPABASE_BASE_URL = process.env.SUPABASE_BASE_URL || "";
const LINGUA_BACKEND = process.env.LINGUA_BACKEND || ""; // explicit: "sqlite" or "supabase"
const MCP_PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "@lingua/mcp";
const SERVER_VERSION = "0.1.0";

// ============================================================
// Storage backend detection
// LINGUA_BACKEND=sqlite → force SQLite
// LINGUA_BACKEND=supabase → force Supabase
// Otherwise: SUPABASE_BASE_URL set → Supabase, else SQLite
// ============================================================

const storage = (LINGUA_BACKEND === "sqlite" || !SUPABASE_BASE_URL)
  ? createSqliteStorage({
      dbPath: process.env.LINGUA_SQLITE_PATH || undefined,
    })
  : createSupabaseStorage({
      baseUrl: SUPABASE_BASE_URL.replace(/\/$/, ""),
      anonKey: process.env.SUPABASE_ANON_KEY || "",
      serviceKey:
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        "",
    });

// ============================================================
// Tool: get_today_lesson
// ============================================================

async function handleGetTodayLesson(args) {
  const userId = (args.user_id || "leo").trim();

  const lessonId = await storage.getNextLessonId(userId);

  if (!lessonId) {
    return {
      ok: true,
      message: "All lessons completed! Time to review or add new content.",
      lesson: null,
    };
  }

  const lesson = await storage.getLessonWithContent(lessonId);

  if (!lesson) {
    return { ok: false, error: `Lesson ${lessonId} not found` };
  }

  await storage.ensureDailySession(userId, lessonId);
  await storage.markLessonSeen(userId, lessonId);

  return {
    ok: true,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      type: lesson.lesson_type,
      difficulty: lesson.difficulty,
      tags: lesson.tags,
    },
    context: {
      skill_book: lesson.skill_book
        ? { slug: lesson.skill_book.slug, title: lesson.skill_book.title }
        : null,
      chapter: lesson.chapter
        ? { number: lesson.chapter.chapter_number, title: lesson.chapter.title }
        : null,
      lesson_number: lesson.lesson_number,
    },
  };
}

// ============================================================
// Tool: get_user_progress
// ============================================================

async function handleGetUserProgress(args) {
  const userId = (args.user_id || "leo").trim();

  const [stats, daily] = await Promise.all([
    storage.getProgressStats(userId),
    storage.getDailyProgress(userId),
  ]);

  return {
    ok: true,
    user_id: userId,
    overall: stats,
    today: daily,
  };
}

// ============================================================
// Tool: log_response
// ============================================================

async function handleLogResponse(args) {
  const userId = (args.user_id || "leo").trim();
  const lessonId = args.lesson_id;
  const response = args.response || "";
  const score = args.score;

  if (!lessonId) {
    return { ok: false, error: "lesson_id is required" };
  }
  if (score !== undefined && (score < 1 || score > 5)) {
    return { ok: false, error: "score must be between 1 and 5" };
  }

  const status = score && score >= 4 ? "mastered" : "practiced";

  await storage.upsertProgress(userId, lessonId, status, response, score);

  return {
    ok: true,
    lesson_id: lessonId,
    status,
    scored: score || null,
  };
}

// ============================================================
// Tool definitions
// ============================================================

const TOOL_DEFINITIONS = [
  {
    name: "get_today_lesson",
    description:
      "Get the next unseen English lesson for daily practice. Returns lesson content, context, and auto-creates a daily session.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
      },
    },
  },
  {
    name: "get_user_progress",
    description:
      "Get progress stats for the user — overall and today's session. Shows mastered/practiced/remaining counts.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
      },
    },
  },
  {
    name: "log_response",
    description:
      "Log a practice response for a lesson. Automatically sets status to 'mastered' (score >= 4) or 'practiced'.",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "User identifier. Defaults to 'leo'.",
          default: "leo",
        },
        lesson_id: {
          type: "string",
          description: "UUID of the lesson to log response for.",
        },
        response: {
          type: "string",
          description: "User's practice response text.",
        },
        score: {
          type: "integer",
          description: "Score 1-5. >= 4 marks as mastered.",
          minimum: 1,
          maximum: 5,
        },
      },
      required: ["lesson_id"],
    },
  },
];

// ============================================================
// Tool dispatcher
// ============================================================

const TOOL_HANDLERS = {
  get_today_lesson: handleGetTodayLesson,
  get_user_progress: handleGetUserProgress,
  log_response: handleLogResponse,
};

async function callTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  return handler(args || {});
}

// ============================================================
// JSON-RPC 2.0 handler
// ============================================================

function isJsonRpcRequest(msg) {
  return (
    msg &&
    typeof msg === "object" &&
    msg.jsonrpc === "2.0" &&
    typeof msg.method === "string"
  );
}

function jsonrpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

async function handleJsonRpc(msg) {
  const { method, params, id } = msg;

  switch (method) {
    case "initialize":
      return jsonrpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "notifications/initialized":
      return null;

    case "tools/list":
      return jsonrpcResult(id, { tools: TOOL_DEFINITIONS });

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments;

      if (!toolName) {
        return jsonrpcError(id, -32602, "Missing tool name in params");
      }

      try {
        const result = await callTool(toolName, toolArgs);
        return jsonrpcResult(id, {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        });
      } catch (err) {
        return jsonrpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: err.message || "Internal tool error",
              }),
            },
          ],
          isError: true,
        });
      }
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ============================================================
// HTTP server
// ============================================================

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        backend: storage.name,
        tools: TOOL_DEFINITIONS.map((t) => t.name),
      })
    );
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);

      if (Array.isArray(body)) {
        const results = await Promise.all(
          body.map((msg) => (isJsonRpcRequest(msg) ? handleJsonRpc(msg) : null))
        );
        const filtered = results.filter(Boolean);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(filtered));
        return;
      }

      if (!isJsonRpcRequest(body)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(jsonrpcError(null, -32600, "Invalid JSON-RPC request"))
        );
        return;
      }

      if (body.id === undefined || body.id === null) {
        res.writeHead(202);
        res.end();
        return;
      }

      const result = await handleJsonRpc(body);
      if (result) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(202);
        res.end();
      }
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          jsonrpcError(null, -32603, `Internal error: ${err.message}`)
        )
      );
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

// ============================================================
// Start
// ============================================================

server.listen(PORT, () => {
  console.log(`[LinguaMCP] Listening on port ${PORT}`);
  console.log(`[LinguaMCP] Backend: ${storage.name}`);
  console.log(
    `[LinguaMCP] Tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}`
  );
});
