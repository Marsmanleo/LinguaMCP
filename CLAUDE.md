# CLAUDE.md

## Project
LinguaMCP — MCP server for daily language practice. Serves structured curriculum through the Model Context Protocol so any AI tool can become a language tutor.

## Architecture

```
server.mjs          ← MCP entry point (JSON-RPC handler, HTTP server, tool definitions)
storage/
  interface.mjs     ← Storage contract (getNextLesson, getUserProgress, logResponse)
  supabase.mjs      ← PostgREST adapter (existing production backend)
  sqlite.mjs        ← SQLite adapter (zero-config self-hosted)
schema/
  sqlite.sql         ← SQLite table definitions
scripts/
  ingest-english-tips.ts  ← Supabase content ingestion
  init-sqlite.mjs         ← SQLite DB init + content ingestion
src/
  index.ts           ← TypeScript type definitions
supabase/migrations/ ← PostgreSQL schema migration
```

## Rules
- Follow existing code style (ESM, `.mjs` for runtime, `.ts` for scripts/types)
- Test both Supabase and SQLite modes when touching storage
- Never commit `.env` files or credentials
- All curriculum content must be MIT or CC-BY compatible
- `server.mjs` should remain the single entry point — no splitting into multiple servers
- Storage adapters must implement the exact same interface and return shapes
- No TypeScript in runtime files (server.mjs, storage/*.mjs) — keep them plain JS

## MCP Tools
- `get_today_lesson` — Returns next unmastered lesson for the user
- `get_user_progress` — Returns mastery/practiced/remaining counts
- `log_response` — Records a practice response, auto-marks mastered if score >= 4

## Development
```bash
npm start          # Start MCP server (auto-detects Supabase or SQLite)
npm run dev        # Start with --watch
npm run init       # Initialize SQLite DB + ingest curriculum
npm run typecheck  # TypeScript check
```
