# Contributing to LinguaMCP

Thank you for your interest in contributing! Here's how to get started.

## Ways to Contribute

- **Curriculum content** — Add new skill books, chapters, or lessons
- **Bug reports** — File issues for anything broken
- **Storage adapters** — Add support for new databases (MongoDB, DynamoDB, etc.)
- **Documentation** — Improve guides, fix typos, translate
- **Language support** — Help add languages beyond English

## Development Setup

```bash
# Clone the repo
git clone https://github.com/Marsmanleo/LinguaMCP.git
cd LinguaMCP

# Install dependencies
npm install

# Initialize SQLite database with curriculum
npm run init

# Start the MCP server
npm start
```

### Supabase Mode

If you want to develop against Supabase:

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your Supabase credentials
# Then run the Supabase migration in supabase/migrations/

# Start in Supabase mode
npm start  # auto-detects SUPABASE_BASE_URL
```

## Pull Request Process

1. **Fork** the repository
2. Create a **feature branch** from `main`
3. Make your changes with clear, descriptive commits
4. Test both **SQLite** and **Supabase** modes if touching storage
5. Submit a **PR** with a clear description of what changed and why

## Code Style

- ESM modules (`.mjs` extensions for runtime, `.ts` for scripts)
- No TypeScript in runtime files — `server.mjs`, `storage/*.mjs` are plain JS
- TypeScript for type definitions (`src/`) and scripts (`scripts/`)
- Follow existing patterns in the codebase

## Code of Conduct

Be respectful. We're all learning — that's literally the point of this project.

## Questions?

Open an issue or start a discussion on GitHub.
