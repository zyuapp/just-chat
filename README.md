# just-chat

This is my attempt to build a personal AI agent connected to Ollama Cloud.

Right now, it is a local terminal REPL where I can chat with the model and iterate on agent behavior quickly.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Set values in `.env`:
   - `OLLAMA_API_KEY`
   - `OLLAMA_MODEL`
   - `OLLAMA_HOST`
   - `OLLAMA_EMBED_MODEL` (optional, defaults to `OLLAMA_MODEL`)
4. Run:
   - `npm run dev`

Type your prompt after `You:`.
Type `exit` or `quit` to stop.

## Scripts

- `npm run dev` - start local REPL
- `npm run db:migrate` - ensure local SQLite schema
- `npm run typecheck` - TypeScript check
- `npm run lint` - ESLint
- `npm run test` - unit tests
- `npm run debug:runs -- 10` - show recent run summaries from logs
- `npm run debug:memory -- "query"` - inspect semantic memory hits
- `npm run eval:memory` - run a basic RAG memory evaluation
- `npm run build` - compile to `dist/`
