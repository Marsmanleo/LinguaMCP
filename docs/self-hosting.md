# Self-Hosting Guide

LinguaMCP supports two storage backends. Choose based on your needs.

## Option 1: SQLite (Zero Config)

The simplest option. No database setup, no cloud services.

```bash
npm install -g @lingua/mcp
lingua-mcp-init    # Creates ~/.lingua-mcp/lingua.db with curriculum
lingua-mcp         # Starts the MCP server
```

Your data lives in `~/.lingua-mcp/lingua.db` — a single SQLite file. Back it up by copying the file.

### Configuring Your AI Tool

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "lingua": {
      "command": "lingua-mcp"
    }
  }
}
```

**Cursor / Windsurf** (MCP settings):
```json
{
  "lingua": {
    "command": "node",
    "args": ["/path/to/LinguaMCP/server.mjs"]
  }
}
```

## Option 2: Supabase

For teams, multi-user setups, or if you prefer PostgreSQL.

### Using Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/` via the SQL editor
3. Set environment variables:

```bash
export SUPABASE_BASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
```

### Using Self-Hosted Supabase

Same steps, but point to your self-hosted instance:

```bash
export SUPABASE_BASE_URL=http://your-server:8000
export SUPABASE_ANON_KEY=your-anon-key
```

### Ingesting Curriculum

```bash
# After setting up Supabase and running the migration
npm run ingest
```

### Multi-User Setup

The schema includes `user_id` on all tables. For multi-user deployments:

1. Set up Row Level Security (RLS) policies per user
2. Each user connects with their own anon key or authenticated token
3. The `user_id` defaults to `'default'` — override per user

## Docker (Coming Soon)

A `docker-compose.yml` for one-command self-hosting is planned.

## Troubleshooting

### "Database is locked" (SQLite)
- Only one process can write to SQLite at a time
- LinguaMCP uses WAL mode for better concurrency
- If locked, stop the server and restart

### "Connection refused" (Supabase)
- Check `SUPABASE_BASE_URL` is correct
- Verify the Supabase instance is running
- Test with: `curl $SUPABASE_BASE_URL/rest/v1/ -H "apikey: $SUPABASE_ANON_KEY"`

### Reset Progress

```bash
# SQLite: delete the database and re-initialize
rm ~/.lingua-mcp/lingua.db
lingua-mcp-init

# Supabase: truncate the progress tables or re-run migration
```
