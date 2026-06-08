-- LinguaMCP — SQLite schema
-- Adapted from PostgreSQL migration for local self-hosted use
-- No RLS needed (single-user local file)

CREATE TABLE IF NOT EXISTS skill_books (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  skill_book_id TEXT NOT NULL REFERENCES skill_books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(skill_book_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  lesson_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  lesson_type TEXT NOT NULL DEFAULT 'concept' CHECK (lesson_type IN ('tip', 'exercise', 'concept', 'dialogue')),
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chapter_id, lesson_number)
);

CREATE TABLE IF NOT EXISTS user_progress (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL DEFAULT 'leo',
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'practiced', 'mastered', 'skipped')),
  response TEXT DEFAULT '',
  score INTEGER CHECK (score IS NULL OR (score >= 1 AND score <= 5)),
  practiced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS daily_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL DEFAULT 'leo',
  session_date TEXT NOT NULL,
  lesson_ids TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, session_date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_lesson ON user_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_daily_sessions_user_date ON daily_sessions(user_id, session_date);
