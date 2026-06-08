# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-09

### Added
- MCP server with JSON-RPC handler and HTTP transport
- Three MCP tools: `get_today_lesson`, `get_user_progress`, `log_response`
- Storage abstraction layer with Supabase and SQLite adapters
- SQLite zero-config mode (auto-creates `~/.lingua-mcp/lingua.db`)
- Supabase mode with PostgREST integration
- English curriculum: 4 linking words skill book (4 chapters, 20 lessons)
- Supabase migration for PostgreSQL schema
- SQLite schema migration
- Content ingestion scripts (Supabase and SQLite)
- `lingua-mcp init` CLI command for zero-config setup
- Daily session tracking with mastery scoring (1-5 scale)
- Auto-advance through curriculum based on mastery

### Changed
- Graduated from MarsNMe-lab monorepo to standalone repository
- Package name changed from `@marsnme/lingua-mcp` to `@lingua/mcp`
