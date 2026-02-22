# CLAUDE.md

## Project Overview

`just-chat` is a local terminal REPL for chatting with an Ollama model and iterating on agent behavior quickly.

Entry point: `src/index.ts`

Core flow:
1. Load and validate environment variables.
2. Create Ollama client.
3. Start REPL loop.
4. For each user message, run chat -> optional tool calls -> final assistant response.

## Stack

- Runtime: Node.js + TypeScript (ESM, `NodeNext`)
- Model SDK: `ollama`
- Validation: `zod`
- Command execution: `execa`
- Tests: `vitest`
- Lint: `eslint`

## Setup

1. `npm install`
2. `cp .env.example .env`
3. Set in `.env`:
   - `OLLAMA_API_KEY`
   - `OLLAMA_MODEL`
   - `OLLAMA_HOST`

Run locally:
- `npm run dev`

## Common Commands

- `npm run dev` - start REPL
- `npm run typecheck` - run TypeScript checks
- `npm run lint` - lint code
- `npm run test` - run unit tests
- `npm run build` - compile to `dist/`

## Collaboration and Commits

- Assume other agents may be working on the same branch and even the same file.
- Never revert, stage, or commit unrelated changes you did not make.
- Keep commits atomic: each commit should include only one focused change.
- Stage only files you touched for the current task.
- Check what will be committed before committing.

## Code Map

- `src/index.ts` - app bootstrap
- `src/config/env.ts` - env validation and errors
- `src/repl/repl.ts` - terminal interaction loop
- `src/agent/history.ts` - chat history helpers
- `src/agent/loop.ts` - chat/tool loop with max tool iterations
- `src/tools/*.ts` - tool definitions + execution
- `src/tools/registry.ts` - tool registry + dispatcher
- `tests/unit/**` - unit tests by module area

## Implementation Conventions

- Use strict TypeScript and explicit types at module boundaries.
- Keep functions focused and small; prefer guard clauses over nested branching.
- Validate external or tool input with `zod` before use.
- Return structured result objects from tool executors (`ok`, payload, optional `error`).
- Keep file and module naming consistent with existing lowercase patterns.
- For local imports in TS source, keep `.js` extension in import paths.

## Tooling Notes

- Workspace root is restricted for file operations (`resolveWorkspacePath`).
- Sandbox-only paths should use sandbox resolver (`resolveSandboxPath`).
- Tool output is truncated by `DEFAULT_MAX_TEXT_CHARS` to avoid oversized responses.

## Testing Notes

- Add or update tests in `tests/unit/**` when behavior changes.
- Prefer behavior-focused tests (inputs, outputs, error handling) over implementation details.
- Run at least `npm run test` and `npm run typecheck` before finalizing changes.

## Guardrails

- Do not commit secrets from `.env`.
- Preserve existing architecture unless there is a clear reason to refactor.
- Keep changes minimal and consistent with current style.
