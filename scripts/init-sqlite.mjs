#!/usr/bin/env node
// LinguaMCP — SQLite init command
// Creates DB, runs schema, ingests English-level-up-tips from GitHub
// Usage: node scripts/init-sqlite.mjs [--db path/to/lingua.db]

import BetterSqlite3 from "better-sqlite3"
import { readFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const GITHUB_RAW = "https://raw.githubusercontent.com/byoungd/English-level-up-tips/master/docs"

// ── Curriculum (mirrors ingest-english-tips.ts exactly) ───────

const CURRICULUM = [
  {
    number: 1,
    title: "Core Skills",
    description: "7 fundamental areas: understanding, vocabulary, listening, reading, speaking, writing, and AI-assisted practice.",
    lessons: [
      { file: "threads/part-1/1-understanding.md", title: "Understanding — Mindset & Approach", type: "concept", difficulty: "beginner", tags: ["mindset", "methodology"] },
      { file: "threads/part-1/2-vocabulary.md", title: "Vocabulary — Building Your Word Bank", type: "tip", difficulty: "beginner", tags: ["vocabulary", "words"] },
      { file: "threads/part-1/3-listening.md", title: "Listening — Training Your Ear", type: "tip", difficulty: "intermediate", tags: ["listening", "comprehension"] },
      { file: "threads/part-1/4-reading.md", title: "Reading — Input Through Text", type: "tip", difficulty: "intermediate", tags: ["reading", "comprehension"] },
      { file: "threads/part-1/5-speaking.md", title: "Speaking — Output Practice", type: "exercise", difficulty: "intermediate", tags: ["speaking", "output"] },
      { file: "threads/part-1/6-writing.md", title: "Writing — From Thought to Text", type: "exercise", difficulty: "intermediate", tags: ["writing", "output"] },
      { file: "threads/part-1/7-ai.md", title: "AI-Assisted Learning (2026 Edition)", type: "concept", difficulty: "intermediate", tags: ["ai", "tools", "modern"] },
    ],
  },
  {
    number: 2,
    title: "Stories & Practice",
    description: "Real stories and weekly practice exercises for applied learning.",
    lessons: [
      { file: "threads/part-2/x-misc.md", title: "Miscellaneous Tips & Stories", type: "tip", difficulty: "intermediate", tags: ["stories", "tips"] },
      { file: "threads/part-2/my-story.md", title: "My English Learning Story", type: "concept", difficulty: "beginner", tags: ["story", "motivation"] },
      { file: "threads/part-4/week-1.md", title: "Week 1 Practice Plan", type: "exercise", difficulty: "beginner", tags: ["practice", "weekly"] },
    ],
  },
  {
    number: 3,
    title: "Word Lists by Domain",
    description: "Domain-specific vocabulary lists for IT professionals.",
    lessons: [
      { file: "threads/word-list/Common.md", title: "Common Words for IT", type: "tip", difficulty: "beginner", tags: ["vocabulary", "common", "it"] },
      { file: "threads/word-list/Go.md", title: "Go Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "go", "programming"] },
      { file: "threads/word-list/Java.md", title: "Java Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "java", "programming"] },
      { file: "threads/word-list/JavaScript.md", title: "JavaScript Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "javascript", "programming"] },
      { file: "threads/word-list/PHP.md", title: "PHP Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "php", "programming"] },
      { file: "threads/word-list/Prompt.md", title: "AI Prompt Vocabulary", type: "tip", difficulty: "advanced", tags: ["vocabulary", "ai", "prompt"] },
      { file: "threads/word-list/Python.md", title: "Python Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "python", "programming"] },
      { file: "threads/word-list/Swift.md", title: "Swift Vocabulary", type: "tip", difficulty: "intermediate", tags: ["vocabulary", "swift", "programming"] },
      { file: "threads/word-list/Rust.md", title: "Rust Vocabulary", type: "tip", difficulty: "advanced", tags: ["vocabulary", "rust", "programming"] },
      { file: "threads/word-list/VibeCoding.md", title: "Vibe Coding & Agent Vocabulary", type: "tip", difficulty: "advanced", tags: ["vocabulary", "ai", "agent", "modern"] },
    ],
  },
]

// ── Parse args ───────────────────────────────────────────────

const args = process.argv.slice(2)
const dbFlagIdx = args.indexOf("--db")
const dbPath = dbFlagIdx >= 0 && args[dbFlagIdx + 1]
  ? args[dbFlagIdx + 1]
  : process.env.LINGUA_SQLITE_PATH || join(homedir(), ".lingua-mcp", "lingua.db")

console.log(`[LinguaMCP] Initializing SQLite at ${dbPath}`)

// Ensure directory
const dir = dirname(dbPath)
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

const db = new BetterSqlite3(dbPath)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

// ── Step 1: Schema ───────────────────────────────────────────

const schemaSql = readFileSync(join(__dirname, "..", "schema", "sqlite.sql"), "utf-8")
db.exec(schemaSql)
console.log("[LinguaMCP] Schema initialized ✓")

// ── Step 2: Check existing ───────────────────────────────────

const existing = db.prepare("SELECT COUNT(*) as count FROM lessons").get()
if (existing.count > 0) {
  console.log(`[LinguaMCP] Already has ${existing.count} lessons — skipping ingest`)
  db.close()
  process.exit(0)
}

// ── Step 3: Fetch content from GitHub ────────────────────────

async function fetchContent(filePath) {
  try {
    const response = await fetch(`${GITHUB_RAW}/${filePath}`)
    if (response.ok) {
      return await response.text()
    }
  } catch {
    // Network error — fall back to summary
  }
  return null
}

// ── Step 4: Seed ─────────────────────────────────────────────

const insertSkillBook = db.prepare(`
  INSERT INTO skill_books (id, slug, title, description) VALUES (?, ?, ?, ?)
`)
const insertChapter = db.prepare(`
  INSERT INTO chapters (id, skill_book_id, chapter_number, title) VALUES (?, ?, ?, ?)
`)
const insertLesson = db.prepare(`
  INSERT INTO lessons (id, chapter_id, lesson_number, title, content, lesson_type, difficulty, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

console.log("[LinguaMCP] Fetching curriculum from GitHub...")

const bookId = "english-level-up-tips"
let fetchedCount = 0
let fallbackCount = 0

const seed = db.transaction(() => {
  insertSkillBook.run(bookId, "english-level-up-tips", "English Level Up Tips",
    "Comprehensive English learning guide from byoungd/English-level-up-tips")

  for (const ch of CURRICULUM) {
    const chId = `ch-${ch.number}`
    insertChapter.run(chId, bookId, ch.number, ch.title)

    for (let i = 0; i < ch.lessons.length; i++) {
      const l = ch.lessons[i]
      // Content will be filled in async step below; use placeholder for now
      insertLesson.run(
        `l-${ch.number}-${i + 1}`, chId, i + 1, l.title,
        "", l.type, l.difficulty, JSON.stringify(l.tags)
      )
    }
  }
})

// Insert structure first (in transaction), then fill content
seed()

// Now fetch real content and update each lesson
const updateContent = db.prepare(`
  UPDATE lessons SET content = ? WHERE id = ?
`)

for (const ch of CURRICULUM) {
  for (let i = 0; i < ch.lessons.length; i++) {
    const l = ch.lessons[i]
    const lessonId = `l-${ch.number}-${i + 1}`
    const content = await fetchContent(l.file)

    if (content) {
      updateContent.run(content, lessonId)
      fetchedCount++
    } else {
      // Fallback: meaningful summary based on lesson type
      const fallback = [
        `# ${l.title}`,
        "",
        `This is a **${l.type}** lesson at **${l.difficulty}** level.`,
        "",
        `Source: [English-level-up-tips/${l.file}](https://github.com/byoungd/English-level-up-tips/blob/main/${l.file})`,
        "",
        "Run `node scripts/ingest-english-tips.ts` with a Supabase backend for full content.",
      ].join("\n")
      updateContent.run(fallback, lessonId)
      fallbackCount++
    }
  }
}

const finalCount = db.prepare("SELECT COUNT(*) as count FROM lessons").get()
console.log(`[LinguaMCP] Ingested ${finalCount.count} lessons ✓ (fetched: ${fetchedCount}, fallback: ${fallbackCount})`)
console.log(`[LinguaMCP] Ready! Start the server with: node server.mjs`)

db.close()
