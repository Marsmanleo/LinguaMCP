-- LinguaMCP: Curriculum + Progress schema
-- MARS-280: One Soul, Every Language, Any AI
-- Decision: Supabase (MVP), English only v1

begin;

-- ============================================================
-- Schema: lingua
-- Purpose: Language learning curriculum structure + progress
-- Boundary: Structure lives here, memory stays in coco.memories
-- ============================================================

create schema if not exists lingua;

-- ============================================================
-- PostgREST exposure + grants (matches coco/toto pattern)
-- Without this, Accept-Profile: lingua requests fail on fresh install
-- ============================================================

-- Expose lingua schema to PostgREST
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, ck-pwa, coco, toto, lingua';

-- Grant access to service_role (used by MCP servers)
GRANT usage ON SCHEMA lingua TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA lingua TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA lingua TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA lingua TO service_role;

-- Grant access to anon (for read-only queries if needed)
GRANT usage ON SCHEMA lingua TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA lingua TO anon;

-- Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA lingua GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA lingua GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA lingua GRANT ALL ON FUNCTIONS TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Table: lingua.skill_books
-- Purpose: Top-level curriculum source (e.g., English-level-up-tips)
-- ============================================================

create table lingua.skill_books (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  source_url text,
  language text not null default 'en',
  total_chapters int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Table: lingua.chapters
-- Purpose: Chapter within a skill book
-- ============================================================

create table lingua.chapters (
  id uuid primary key default extensions.gen_random_uuid(),
  skill_book_id uuid not null references lingua.skill_books(id) on delete cascade,
  chapter_number int not null,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now(),

  unique(skill_book_id, chapter_number)
);

-- ============================================================
-- Table: lingua.lessons
-- Purpose: Individual lesson within a chapter
-- Each lesson = one atomic learning unit (tip / exercise / concept)
-- ============================================================

create table lingua.lessons (
  id uuid primary key default extensions.gen_random_uuid(),
  chapter_id uuid not null references lingua.chapters(id) on delete cascade,
  lesson_number int not null,
  title text not null,
  content text not null,
  lesson_type text not null default 'tip'
    check (lesson_type in ('tip', 'exercise', 'concept', 'dialogue')),
  difficulty text not null default 'intermediate'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),

  unique(chapter_id, lesson_number)
);

-- ============================================================
-- Table: lingua.user_progress
-- Purpose: Track Leo's progress through the curriculum
-- Boundary: This is progress data, NOT memory (memory = coco.memories)
-- ============================================================

create table lingua.user_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null default 'leo',
  lesson_id uuid not null references lingua.lessons(id) on delete cascade,
  status text not null default 'new'
    check (status in ('new', 'seen', 'practiced', 'mastered', 'skipped')),
  response text,
  score int check (score between 1 and 5),
  practiced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique(user_id, lesson_id)
);

-- ============================================================
-- Table: lingua.daily_sessions
-- Purpose: One session per day, tracks what was covered
-- ============================================================

create table lingua.daily_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id text not null default 'leo',
  session_date date not null default current_date,
  lesson_ids uuid[] not null default '{}',
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  unique(user_id, session_date)
);

-- ============================================================
-- Indexes for common queries
-- ============================================================

create index idx_user_progress_user_status
  on lingua.user_progress(user_id, status);

create index idx_user_progress_practiced
  on lingua.user_progress(user_id, practiced_at desc);

create index idx_lessons_chapter
  on lingua.lessons(chapter_id, lesson_number);

-- ============================================================
-- Helper: get_next_lesson function
-- Returns the next unseen lesson for a user
-- ============================================================

create or replace function lingua.get_next_lesson(p_user_id text default 'leo')
returns uuid as $$
declare
  next_id uuid;
begin
  select l.id into next_id
  from lingua.lessons l
  join lingua.chapters c on c.id = l.chapter_id
  join lingua.skill_books sb on sb.id = c.skill_book_id
  where not exists (
    select 1 from lingua.user_progress up
    where up.lesson_id = l.id
      and up.user_id = p_user_id
      and up.status in ('seen', 'practiced', 'mastered', 'skipped')
  )
  order by sb.slug, c.chapter_number, l.lesson_number
  limit 1;

  return next_id;
end;
$$ language plpgsql stable;

-- ============================================================
-- Helper: get_daily_progress function
-- Returns today's session if exists
-- ============================================================

create or replace function lingua.get_daily_progress(p_user_id text default 'leo')
returns table (
  session_id uuid,
  session_date date,
  total_lessons int,
  practiced int,
  mastered int,
  remaining int
) as $$
  select
    ds.id as session_id,
    ds.session_date,
    (select count(*) from lingua.lessons)::int as total_lessons,
    (select count(*) from lingua.user_progress
     where user_id = p_user_id and status = 'practiced')::int as practiced,
    (select count(*) from lingua.user_progress
     where user_id = p_user_id and status = 'mastered')::int as mastered,
    (select count(*) from lingua.lessons
     where not exists (
       select 1 from lingua.user_progress
       where lesson_id = lingua.lessons.id
         and user_id = p_user_id
         and status in ('practiced', 'mastered')
     ))::int as remaining
  from lingua.daily_sessions ds
  where ds.user_id = p_user_id
    and ds.session_date = current_date
  limit 1;
$$ language sql stable;

commit;
