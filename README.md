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
4. Run:
   - `npm run dev`

Type your prompt after `You:`.
Type `exit` or `quit` to stop.

## Scripts

- `npm run dev` - start local REPL
- `npm run typecheck` - TypeScript check
- `npm run lint` - ESLint
- `npm run build` - compile to `dist/`
