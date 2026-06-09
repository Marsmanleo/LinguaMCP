#!/usr/bin/env node
// LinguaMCP — Open curriculum protocol for AI language tutors
// MARS-280: One Soul, Every Language, Any AI
// MARS-282: SQLite storage adapter for true self-hosted

import { createServer } from "http";
import crypto from "node:crypto";
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
const SERVER_NAME = "lingua-mcp";
const SERVER_VERSION = "0.2.0";

// Bearer auth — follows coco-memory pattern
const BEARER_TOKEN = (process.env.LINGUA_BEARER_TOKEN || "").trim();
const BYPASS_BEARER_FOR_PRIVATE =
  process.env.LINGUA_BYPASS_PRIVATE !== "false";

// OAuth client_credentials — follows coco-memory pattern
const OAUTH_CLIENT_ID = (process.env.LINGUA_CLIENT_ID || "").trim();
const OAUTH_CLIENT_SECRET = (process.env.LINGUA_CLIENT_SECRET || "").trim();
const OAUTH_TOKEN_TTL_SECONDS = parseInt(
  process.env.LINGUA_OAUTH_TOKEN_TTL || "3600",
  10
);
const OAUTH_ENABLED = !!(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET);
const PUBLIC_HOST = (process.env.LINGUA_PUBLIC_HOST || "").trim();

// ============================================================
// Auth helpers (follows coco-memory pattern)
// ============================================================

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:192\.168\./,
];

const OAUTH_CLIENTS = new Map();
const OAUTH_CODES = new Map();
const OAUTH_TOKENS = new Map();
const OAUTH_CODE_TTL_MS = 300_000;

if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  OAUTH_CLIENTS.set(OAUTH_CLIENT_ID, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    redirect_uris: [],
    scope: "mcp",
    token_endpoint_auth_method: "client_secret_post",
    static: true,
  });
}

function isPrivateIp(ip) {
  const addr = (ip || "").trim();
  if (!addr || addr === "localhost") return true;
  return PRIVATE_IP_PATTERNS.some((re) => re.test(addr));
}

function extractBearerToken(req) {
  const auth = (req.headers["authorization"] || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function isOauthTokenValid(token) {
  const entry = OAUTH_TOKENS.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expires_at) {
    OAUTH_TOKENS.delete(token);
    return false;
  }
  return true;
}

function isAuthorized(req) {
  if (!BEARER_TOKEN && !OAUTH_ENABLED) return true;
  if (BYPASS_BEARER_FOR_PRIVATE && isPrivateIp(getClientIp(req))) return true;
  const token = extractBearerToken(req);
  if (!token) return false;
  if (BEARER_TOKEN && token === BEARER_TOKEN) return true;
  if (OAUTH_ENABLED && isOauthTokenValid(token)) return true;
  return false;
}

function sendUnauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

// ============================================================
// OAuth endpoints (authorization code + PKCE + client_credentials)
// ============================================================

function sha256Base64Url(input) {
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function lazyCleanup() {
  const now = Date.now();
  for (const [k, v] of OAUTH_CODES) {
    if (now > v.expires_at) OAUTH_CODES.delete(k);
  }
  for (const [k, v] of OAUTH_TOKENS) {
    if (now > v.expires_at) OAUTH_TOKENS.delete(k);
  }
}

async function handleOauthRegister(req, res) {
  const body = await readOauthBody(req);
  const clientId = `mcp_${crypto.randomBytes(12).toString("hex")}`;
  const clientSecret = crypto.randomBytes(32).toString("hex");
  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
    scope: "mcp",
    token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
    created_at: Math.floor(Date.now() / 1000),
  };
  OAUTH_CLIENTS.set(clientId, client);
  return jsonResponse(res, 201, client);
}

function handleOauthAuthorize(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";

  if (!clientId) {
    return jsonResponse(res, 400, { error: "invalid_request", error_description: "client_id is required" });
  }
  if (!OAUTH_CLIENTS.get(clientId)) {
    OAUTH_CLIENTS.set(clientId, {
      client_id: clientId, client_secret: "", redirect_uris: redirectUri ? [redirectUri] : [],
      scope: "mcp", token_endpoint_auth_method: "none", auto_registered: true,
      created_at: Math.floor(Date.now() / 1000),
    });
  }
  if (!redirectUri) {
    return jsonResponse(res, 400, { error: "invalid_request", error_description: "redirect_uri is required" });
  }

  const code = crypto.randomBytes(32).toString("hex");
  OAUTH_CODES.set(code, {
    client_id: clientId, redirect_uri: redirectUri,
    code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod,
    expires_at: Date.now() + OAUTH_CODE_TTL_MS,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);
  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}

async function handleOauthToken(req, res) {
  const body = await readOauthBody(req);
  const grantType = body.grant_type || "";

  if (grantType === "client_credentials") {
    const clientId = body.client_id || "";
    const clientSecret = body.client_secret || "";
    const client = OAUTH_CLIENTS.get(clientId);
    if (!client || (client.client_secret && client.client_secret !== clientSecret)) {
      return jsonResponse(res, 401, { error: "invalid_client" });
    }
    return issueAccessToken(clientId, res);
  }

  if (grantType === "authorization_code") {
    const code = body.code || "";
    const codeVerifier = body.code_verifier || "";
    const clientId = body.client_id || "";
    const redirectUri = body.redirect_uri || "";
    const stored = OAUTH_CODES.get(code);
    if (!stored) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "Invalid or expired code" });
    OAUTH_CODES.delete(code);
    if (Date.now() > stored.expires_at) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "Code expired" });
    if (clientId && stored.client_id !== clientId) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "client_id mismatch" });
    if (redirectUri && stored.redirect_uri !== redirectUri) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
    if (stored.code_challenge) {
      if (!codeVerifier) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "code_verifier required (PKCE)" });
      if (sha256Base64Url(codeVerifier) !== stored.code_challenge) return jsonResponse(res, 400, { error: "invalid_grant", error_description: "PKCE mismatch" });
    }
    return issueAccessToken(stored.client_id, res);
  }

  return jsonResponse(res, 400, { error: "unsupported_grant_type" });
}

function issueAccessToken(clientId, res) {
  const accessToken = crypto.randomBytes(32).toString("hex");
  OAUTH_TOKENS.set(accessToken, { client_id: clientId, expires_at: Date.now() + OAUTH_TOKEN_TTL_SECONDS * 1000 });
  lazyCleanup();
  return jsonResponse(res, 200, { access_token: accessToken, token_type: "bearer", expires_in: OAUTH_TOKEN_TTL_SECONDS, scope: "mcp" });
}

async function readOauthBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

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
// Tool: add_lesson
// ============================================================

async function handleAddLesson(args) {
  const chapterId = args.chapter_id;
  if (!chapterId) return { ok: false, error: "chapter_id is required" };
  if (!args.title) return { ok: false, error: "title is required" };
  if (!args.content) return { ok: false, error: "content is required" };

  const lesson = {
    title: args.title,
    content: args.content,
    lesson_type: args.type || "concept",
    difficulty: args.difficulty || "intermediate",
    tags: args.tags || [],
  };

  const id = await storage.addLesson(chapterId, lesson);
  return { ok: true, lesson_id: id, message: `Lesson "${args.title}" added` };
}

// ============================================================
// Tool: add_resource
// ============================================================

async function handleAddResource(args) {
  const lessonId = args.lesson_id;
  if (!lessonId) return { ok: false, error: "lesson_id is required" };
  if (!args.url) return { ok: false, error: "url is required" };
  if (!args.title) return { ok: false, error: "title is required" };

  const resource = {
    title: args.title,
    url: args.url,
    type: args.type || "article",
    level: args.level || "intermediate",
    tags: args.tags || [],
  };

  const id = await storage.addResource(lessonId, resource);
  return { ok: true, resource_id: id, message: `Resource "${args.title}" added` };
}

// ============================================================
// Tool: remove_lesson
// ============================================================

async function handleRemoveLesson(args) {
  const lessonId = args.lesson_id;
  if (!lessonId) return { ok: false, error: "lesson_id is required" };

  await storage.deprecateLesson(lessonId, args.reason || "No reason provided");
  return { ok: true, lesson_id: lessonId, status: "deprecated" };
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
  {
    name: "add_lesson",
    description:
      "Add a new lesson to a chapter. Returns the new lesson ID.",
    inputSchema: {
      type: "object",
      properties: {
        chapter_id: {
          type: "string",
          description: "UUID of the chapter to add the lesson to.",
        },
        title: {
          type: "string",
          description: "Lesson title.",
        },
        content: {
          type: "string",
          description: "Lesson content (markdown).",
        },
        type: {
          type: "string",
          description: "Lesson type: concept, tip, exercise, or dialogue.",
          enum: ["concept", "tip", "exercise", "dialogue"],
          default: "concept",
        },
        difficulty: {
          type: "string",
          description: "Difficulty level.",
          enum: ["beginner", "intermediate", "advanced"],
          default: "intermediate",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization.",
        },
      },
      required: ["chapter_id", "title", "content"],
    },
  },
  {
    name: "add_resource",
    description:
      "Add an external resource (YouTube, article, podcast) linked to a lesson.",
    inputSchema: {
      type: "object",
      properties: {
        lesson_id: {
          type: "string",
          description: "UUID of the lesson to link the resource to.",
        },
        title: {
          type: "string",
          description: "Resource title.",
        },
        url: {
          type: "string",
          description: "Resource URL.",
        },
        type: {
          type: "string",
          description: "Resource type.",
          enum: ["youtube", "article", "podcast", "other"],
          default: "article",
        },
        level: {
          type: "string",
          description: "Recommended difficulty level.",
          enum: ["beginner", "intermediate", "advanced"],
          default: "intermediate",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization.",
        },
      },
      required: ["lesson_id", "title", "url"],
    },
  },
  {
    name: "remove_lesson",
    description:
      "Soft-delete a lesson (mark as deprecated). The lesson will no longer be served to any user.",
    inputSchema: {
      type: "object",
      properties: {
        lesson_id: {
          type: "string",
          description: "UUID of the lesson to deprecate.",
        },
        reason: {
          type: "string",
          description: "Reason for deprecation.",
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
  add_lesson: handleAddLesson,
  add_resource: handleAddResource,
  remove_lesson: handleRemoveLesson,
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

  const urlPath = (req.url || "/").split("?")[0].replace(/\/+$/, "") || "/";

  // OAuth discovery
  if (req.method === "GET" && urlPath === "/.well-known/oauth-authorization-server") {
    const host = PUBLIC_HOST || req.headers["x-forwarded-host"] || req.headers["host"] || `localhost:${PORT}`;
    const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const issuer = PUBLIC_HOST ? `https://${PUBLIC_HOST}` : `${proto}://${host}`;
    jsonResponse(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["client_credentials"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      scopes_supported: ["mcp"],
    });
    return;
  }

  if (req.method === "GET" && urlPath === "/oauth/authorize") {
    try { handleOauthAuthorize(req, res); } catch (err) { jsonResponse(res, 500, { error: "server_error", error_description: err.message }); }
    return;
  }
  if (req.method === "POST" && urlPath === "/oauth/register") {
    try { await handleOauthRegister(req, res); } catch (err) { jsonResponse(res, 500, { error: "server_error", error_description: err.message }); }
    return;
  }
  if (req.method === "POST" && urlPath === "/oauth/token") {
    try { await handleOauthToken(req, res); } catch (err) { jsonResponse(res, 500, { error: "server_error", error_description: err.message }); }
    return;
  }

  if (req.method === "GET" && (urlPath === "" || urlPath === "/" || urlPath === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: "ok",
        backend: storage.name,
        oauth_enabled: OAUTH_ENABLED,
        tools: TOOL_DEFINITIONS.map((t) => t.name),
      })
    );
    return;
  }

  if (req.method === "POST" && (urlPath === "/mcp" || urlPath === "/" || urlPath === "")) {
    if (!isAuthorized(req)) {
      sendUnauthorized(res);
      return;
    }
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
  const authModes = [];
  if (BEARER_TOKEN) authModes.push("bearer");
  if (OAUTH_ENABLED) authModes.push("oauth(client_credentials)");
  if (authModes.length === 0) authModes.push("open");
  console.log(`[LinguaMCP] Auth: ${authModes.join(" + ")} (private bypass=${BYPASS_BEARER_FOR_PRIVATE})`);
  console.log(
    `[LinguaMCP] Tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}`
  );
});
