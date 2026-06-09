# LinguaMCP

> [English](./README.md) | [繁體中文（台灣）](./docs/README.zh-TW.md) | [繁體中文（香港）](./docs/README.zh-HK.md) | [简体中文](./docs/README.zh-CN.md)

> Open curriculum protocol for AI language tutors — learn naturally through daily practice with any AI tool.

## What is it?

LinguaMCP is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that serves daily language lessons from a structured curriculum. It works with Claude, Cursor, Windsurf, or any AI tool that supports MCP.

Instead of flashcards or grammar drills, you practice naturally through conversation. Your AI tutor knows what you've learned, tracks your progress, and introduces new material when you're ready.

## Quick Start

### Option 1: Zero-config SQLite (recommended)

```bash
# Install globally
npm install -g lingua-mcp

# Initialize database with curriculum
lingua-mcp-init

# Start the server
lingua-mcp
```

That's it. No database to set up, no API keys, no cloud services. Your progress lives in `~/.lingua-mcp/lingua.db`.

### Option 2: Supabase (cloud or self-hosted)

```bash
# Clone and install
git clone https://github.com/Marsmanleo/LinguaMCP.git
cd LinguaMCP
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run the Supabase migration (in supabase/migrations/)
# Then ingest the curriculum
npm run ingest

# Start the server
npm start
```

## Configure Your AI Tool

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lingua": {
      "command": "npx",
      "args": ["-y", "lingua-mcp"]
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "lingua": {
    "command": "node",
    "args": ["/path/to/LinguaMCP/server.mjs"]
  }
}
```

### Supabase mode

Set environment variables before starting:

```bash
SUPABASE_BASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
node server.mjs
```

## MCP Tools

Once connected, your AI tool gets **six tools** — three for practice and three for content curation:

### Practice Tools

| Tool | Description |
|------|-------------|
| `get_today_lesson` | Returns your next unmastered lesson with context and practice prompts |
| `get_user_progress` | Shows mastery, practiced, and remaining counts |
| `log_response` | Records your practice response (score 1-5, ≥4 = mastered) |

### Curation Tools

| Tool | Description |
|------|-------------|
| `add_lesson` | Add a new lesson to a chapter (title, content, type, difficulty, tags) |
| `add_resource` | Link an external resource to a lesson (YouTube, article, podcast) |
| `remove_lesson` | Soft-delete a lesson (marks as deprecated, excluded from serving) |

#### Adding a lesson

Your AI can add lessons from any source — YouTube channels, articles, or original content:

```
AI: "I found a great YouTube video about 'however' vs 'although'.
     Should I add it as a lesson?"

You: "Yes, add it to the Linking Words skill book"

AI: → calls add_lesson with title, content, difficulty
   ← "Lesson added successfully"
```

#### Curating resources

Link external materials to any lesson for reference:

```
AI: → calls add_resource with lesson_id, url, type="youtube"
   ← "Resource 'Emily Daily English EP1' added"
```

#### Removing low-quality lessons

Mark lessons as deprecated without deleting data:

```
AI: → calls remove_lesson with lesson_id, reason="not useful"
   ← "Lesson deprecated"
```

## Curriculum

Currently using structured content from [English-level-up-tips](https://github.com/byoungd/English-level-up-tips) (50k+ stars, MIT License).

**Available skill books:**
- 🔗 **Linking Words** — 4 chapters, 20 lessons covering contrast, addition, cause-effect, and condition connectors

More skill books and languages coming soon.

## How It Works

```
┌─────────────┐     MCP      ┌─────────────┐     Query     ┌──────────┐
│  Your AI    │──────────────▶│  LinguaMCP  │──────────────▶│ Database │
│  Tool       │◀──────────────│  Server     │◀──────────────│          │
└─────────────┘   Lessons &   └─────────────┘   Progress &   └──────────┘
                  Progress                      Lessons
```

1. You chat with your AI tool normally
2. The AI calls LinguaMCP to get your lesson for the day
3. You practice through conversation
4. LinguaMCP tracks what you've mastered and what's next

## Architecture

```
server.mjs              ← MCP server entry point
storage/
  interface.mjs         ← Storage contract
  supabase.mjs          ← Supabase/PostgREST adapter
  sqlite.mjs            ← SQLite adapter (zero-config)
schema/
  sqlite.sql            ← SQLite schema
scripts/
  ingest-english-tips.ts  ← Content ingestion (Supabase)
  init-sqlite.mjs         ← Content ingestion (SQLite)
src/
  index.ts              ← TypeScript types
```

## Storage Modes

| Mode | When | Database | Best for |
|------|------|----------|----------|
| **SQLite** | No `SUPABASE_BASE_URL` set | `~/.lingua-mcp/lingua.db` | Personal use, self-hosted |
| **Supabase** | `SUPABASE_BASE_URL` is set | PostgreSQL via PostgREST | Cloud, multi-user, teams |

Same tools, same responses, same curriculum. The server auto-detects which mode to use.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add curriculum content, storage adapters, or language support.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

Curriculum content from English-level-up-tips is MIT licensed.

## Related

- [MarsNMe](https://github.com/Marsmanleo/MarsNMe) — AI memory companion (sister project)
- [Model Context Protocol](https://modelcontextprotocol.io/) — The protocol that makes this work
