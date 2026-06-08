// LinguaMCP — SQLite storage adapter
// Zero-config self-hosted backend using better-sqlite3
// No SQL helper functions — all logic is in JS

import BetterSqlite3 from "better-sqlite3"
import { readFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_DB_PATH = join(homedir(), ".lingua-mcp", "lingua.db")

/**
 * Create a SQLite storage adapter.
 * @param {object} [config]
 * @param {string} [config.dbPath] - Path to SQLite file (default: ~/.lingua-mcp/lingua.db)
 * @returns {import('./interface.mjs').LinguaStorage}
 */
export function createSqliteStorage(config = {}) {
  const dbPath = config.dbPath || DEFAULT_DB_PATH

  // Ensure directory exists
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new BetterSqlite3(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  // Run schema if tables don't exist yet
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='lessons'"
  ).get()

  if (!tableCheck) {
    const schemaSql = readFileSync(join(__dirname, "..", "schema", "sqlite.sql"), "utf-8")
    db.exec(schemaSql)
    console.log(`[LinguaMCP] SQLite schema initialized at ${dbPath}`)
  }

  // ── Prepared statements ───────────────────────────────────

  const stmt = {
    nextLesson: db.prepare(`
      SELECT l.id
      FROM lessons l
      LEFT JOIN user_progress up ON up.lesson_id = l.id AND up.user_id = ?
      WHERE up.id IS NULL
      ORDER BY l.chapter_id, l.lesson_number
      LIMIT 1
    `),

    lessonWithContent: db.prepare(`
      SELECT l.*, c.id as chapter_id, c.chapter_number, c.title as chapter_title,
             sb.id as skill_book_id, sb.slug as skill_book_slug, sb.title as skill_book_title
      FROM lessons l
      JOIN chapters c ON c.id = l.chapter_id
      JOIN skill_books sb ON sb.id = c.skill_book_id
      WHERE l.id = ?
    `),

    todaySession: db.prepare(`
      SELECT * FROM daily_sessions WHERE user_id = ? AND session_date = ?
    `),

    updateSession: db.prepare(`
      UPDATE daily_sessions SET lesson_ids = ? WHERE id = ?
    `),

    insertSession: db.prepare(`
      INSERT INTO daily_sessions (user_id, session_date, lesson_ids) VALUES (?, ?, ?)
    `),

    findProgress: db.prepare(`
      SELECT id, status FROM user_progress WHERE user_id = ? AND lesson_id = ?
    `),

    insertProgress: db.prepare(`
      INSERT INTO user_progress (user_id, lesson_id, status, response, score)
      VALUES (?, ?, ?, ?, ?)
    `),

    updateProgress: db.prepare(`
      UPDATE user_progress
      SET status = ?, response = ?, score = ?, practiced_at = ?
      WHERE user_id = ? AND lesson_id = ?
    `),

    allProgressByUser: db.prepare(`
      SELECT status FROM user_progress WHERE user_id = ?
    `),

    dailyStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM lessons) as total_lessons,
        (SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND status = 'practiced') as practiced,
        (SELECT COUNT(*) FROM user_progress WHERE user_id = ? AND status = 'mastered') as mastered
    `),

    todaySessionExists: db.prepare(`
      SELECT id, session_date FROM daily_sessions WHERE user_id = ? AND session_date = ?
    `),

    insertProgressNoScore: db.prepare(`
      INSERT INTO user_progress (user_id, lesson_id, status, response)
      VALUES (?, ?, ?, ?)
    `),

    updateProgressNoScore: db.prepare(`
      UPDATE user_progress
      SET status = ?, response = ?, practiced_at = ?
      WHERE user_id = ? AND lesson_id = ?
    `),
  }

  // ── Storage interface ──────────────────────────────────────

  return {
    get name() { return "sqlite" },

    async getNextLessonId(userId) {
      const row = stmt.nextLesson.get(userId)
      return row ? row.id : null
    },

    async getLessonWithContent(lessonId) {
      const row = stmt.lessonWithContent.get(lessonId)
      if (!row) return null

      return {
        id: row.id,
        title: row.title,
        content: row.content,
        lesson_type: row.lesson_type,
        difficulty: row.difficulty,
        tags: JSON.parse(row.tags || "[]"),
        lesson_number: row.lesson_number,
        chapter: {
          id: row.chapter_id,
          chapter_number: row.chapter_number,
          title: row.chapter_title,
        },
        skill_book: {
          id: row.skill_book_id,
          slug: row.skill_book_slug,
          title: row.skill_book_title,
        },
      }
    },

    async ensureDailySession(userId, lessonId) {
      const today = new Date().toISOString().split("T")[0]
      const session = stmt.todaySession.get(userId, today)

      if (session) {
        const existingIds = JSON.parse(session.lesson_ids || "[]")
        if (!existingIds.includes(lessonId)) {
          stmt.updateSession.run(JSON.stringify([...existingIds, lessonId]), session.id)
        }
      } else {
        stmt.insertSession.run(userId, today, JSON.stringify([lessonId]))
      }
    },

    async markLessonSeen(userId, lessonId) {
      const existing = stmt.findProgress.get(userId, lessonId)
      if (!existing) {
        stmt.insertProgress.run(userId, lessonId, "seen", "", null)
      }
    },

    async getProgressStats(userId) {
      const rows = stmt.allProgressByUser.all(userId)
      const stats = { total: 0, new: 0, seen: 0, practiced: 0, mastered: 0, skipped: 0 }

      for (const row of rows) {
        stats.total++
        if (stats[row.status] !== undefined) {
          stats[row.status]++
        }
      }

      return stats
    },

    async getDailyProgress(userId) {
      const today = new Date().toISOString().split("T")[0]
      const session = stmt.todaySessionExists.get(userId, today)
      if (!session) return null

      const row = stmt.dailyStats.get(userId, userId)
      return {
        session_id: session.id,
        session_date: today,
        total_lessons: row.total_lessons,
        practiced: row.practiced,
        mastered: row.mastered,
        remaining: row.total_lessons - row.practiced - row.mastered,
      }
    },

    async upsertProgress(userId, lessonId, status, response, score) {
      const existing = stmt.findProgress.get(userId, lessonId)
      const now = new Date().toISOString()

      if (existing) {
        if (score !== undefined && score !== null) {
          stmt.updateProgress.run(status, response, score, now, userId, lessonId)
        } else {
          stmt.updateProgressNoScore.run(status, response, now, userId, lessonId)
        }
      } else {
        if (score !== undefined && score !== null) {
          stmt.insertProgress.run(userId, lessonId, status, response, score)
        } else {
          stmt.insertProgressNoScore.run(userId, lessonId, status, response)
        }
      }
    },
  }
}
