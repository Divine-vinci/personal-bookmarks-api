# Story 1.1: Initialize Project and Development Environment

Status: review

## Story

As a developer,
I want to initialize the project with the complete tech stack and project structure,
So that I have a working development environment with all dependencies, TypeScript configuration, and the Hono server running locally.

## Acceptance Criteria

1. **Given** a fresh project directory **When** the initialization commands are run (`npm init`, dependency installation, TypeScript config) **Then** the project has the following structure: `src/` with `index.ts`, `app.ts`, `config.ts`, `types.ts`; `src/routes/`, `src/middleware/`, `src/schemas/`, `src/db/`, `src/services/`; `test/`; and `data/` directories **And** `package.json` includes scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist/index.js), `test` (vitest)

2. **Given** the project is initialized **When** `npm run dev` is executed **Then** Hono server starts on the configured port (default 3000) using `@hono/node-server` **And** structured JSON logs are output to stdout via Pino

3. **Given** the server is running **When** the `PORT` environment variable is set to a custom value **Then** the server listens on the specified port (FR33)

4. **Given** the server is running **When** `CORS_ORIGINS` environment variable is set to a comma-separated list of origins **Then** CORS headers are returned for requests from those origins (FR32)

5. **Given** environment variables are missing or invalid **When** the server starts **Then** it uses documented defaults (PORT=3000, DATA_DIR=./data, LOG_LEVEL=info)

## Tasks / Subtasks

- [x] Task 1: Initialize npm project and install dependencies (AC: #1)
  - [x] Run `npm init -y` in project root
  - [x] Install production deps: `hono @hono/node-server better-sqlite3 zod @hono/zod-validator pino pino-http`
  - [x] Install dev deps: `typescript @types/better-sqlite3 @types/node tsx vitest`
  - [x] Configure package.json scripts: `dev`, `build`, `start`, `test`
- [x] Task 2: Configure TypeScript (AC: #1)
  - [x] Run `npx tsc --init` and configure strict mode
  - [x] Set `outDir: "dist"`, `rootDir: "src"`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`
  - [x] Enable `declaration`, `strict`, `esModuleInterop`, `skipLibCheck`
- [x] Task 3: Create project directory structure (AC: #1)
  - [x] Create `src/routes/`, `src/middleware/`, `src/schemas/`, `src/db/`, `src/db/migrations/`, `src/db/repositories/`, `src/services/`
  - [x] Create `test/routes/`, `test/db/`, `test/services/`
  - [x] Create `data/` with `.gitkeep`
- [x] Task 4: Implement config module (AC: #3, #4, #5)
  - [x] Create `src/config.ts` reading PORT, DATA_DIR, CORS_ORIGINS, LOG_LEVEL, NODE_ENV from env
  - [x] Apply defaults: PORT=3000, DATA_DIR=./data, LOG_LEVEL=info, NODE_ENV=development
  - [x] Parse CORS_ORIGINS as comma-separated string to string array
- [x] Task 5: Implement logger middleware (AC: #2)
  - [x] Create `src/middleware/logger-middleware.ts` using Pino + pino-http
  - [x] Configure Pino with LOG_LEVEL from config, JSON output to stdout
- [x] Task 6: Implement Hono app factory (AC: #2, #4)
  - [x] Create `src/app.ts` — Hono app factory exported for testing
  - [x] Register CORS middleware using `hono/cors` with origins from config
  - [x] Register logger middleware
  - [x] Add placeholder route structure (empty route groups for future epics)
- [x] Task 7: Implement server entry point (AC: #2, #3)
  - [x] Create `src/index.ts` — starts @hono/node-server on configured PORT
  - [x] Log server start message with port number via Pino
- [x] Task 8: Create shared types (AC: #1)
  - [x] Create `src/types.ts` with core types: Bookmark, Tag, ApiError, PaginatedResponse
- [x] Task 9: Create project support files (AC: #1)
  - [x] Create `.gitignore` (node_modules, dist, data/*.db*, .env)
  - [x] Create `.env.example` documenting all env vars with defaults
  - [x] Create `vitest.config.ts`
- [x] Task 10: Verify dev server starts (AC: #2, #3, #5)
  - [x] Run `npm run dev` and confirm Hono server starts on configured port (validated live on 3457; config default for 3000 covered by tests due host port 3000 collision)
  - [x] Verify structured JSON log output

## Dev Notes

### Architecture Compliance

- **HTTP Framework:** Hono v4.12.8 with `@hono/node-server` — NOT Express, NOT Fastify
- **Logger:** Pino v10.3.1 — NEVER use `console.log`. All logging through Pino instance
- **Validation:** Zod v4.3.6 — install now, used extensively from Story 1.5 onward
- **Database:** better-sqlite3 v12.8.0 — install now, used from Story 1.2 onward
- **Testing:** Vitest v4.1.0 — configure now, tests written from Story 1.2 onward
- **Dev runner:** tsx for development (`tsx watch src/index.ts`)

### Technical Requirements

- **TypeScript strict mode is mandatory** — `"strict": true` in tsconfig.json
- **Module system:** Use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` — all imports must include `.js` extension for compiled output compatibility
- **No barrel exports:** Do NOT create `index.ts` barrel files in subdirectories. Only `src/index.ts` (entry point) and `src/app.ts` (app factory) at root
- **File naming:** All files `kebab-case.ts` — e.g., `logger-middleware.ts`, `bookmark-routes.ts`
- **Constants:** `UPPER_SNAKE_CASE` — e.g., `DEFAULT_PORT`, `MAX_PAGE_SIZE`
- **Functions/variables:** `camelCase`
- **Types/interfaces:** `PascalCase` — e.g., `Bookmark`, `ApiError`

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Config Module Pattern

```typescript
// src/config.ts
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: process.env.DATA_DIR || './data',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : [],
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;
```

### App Factory Pattern (Critical for Testing)

```typescript
// src/app.ts — MUST export app for Hono's app.request() test helper
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';

const app = new Hono();

// CORS — only if origins configured
if (config.corsOrigins.length > 0) {
  app.use('*', cors({ origin: config.corsOrigins }));
}

export { app };
```

```typescript
// src/index.ts — server entry, NOT exported for tests
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';

serve({ fetch: app.fetch, port: config.port }, (info) => {
  // Use Pino logger here, not console.log
});
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `./data` | SQLite database directory |
| `CORS_ORIGINS` | (empty) | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | Pino log level (trace/debug/info/warn/error/fatal) |
| `NODE_ENV` | `development` | Runtime environment |

### .gitignore Must Include

```
node_modules/
dist/
data/*.db
data/*.db-wal
data/*.db-shm
.env
*.tgz
```

### CORS Behavior

- Empty `CORS_ORIGINS` = no CORS headers returned (default, secure)
- `CORS_ORIGINS=http://localhost:3001,https://my-dashboard.com` = those origins allowed
- Use Hono's built-in `cors()` middleware — do NOT implement custom CORS handling

### Pino Logger Setup

- Create a shared Pino logger instance in `src/middleware/logger-middleware.ts`
- Export the logger for use across the app (route handlers, services)
- Use `pino-http` for automatic request/response logging
- Log level from `config.logLevel`

### What This Story Does NOT Include

- Database setup (Story 1.2)
- Auth middleware (Story 1.3)
- Health check endpoint (Story 1.4)
- Error handling middleware (Story 1.5)
- Any route handlers beyond basic app setup

### Project Structure Notes

After this story, the project tree should look like:

```
personal-bookmarks-api/
├── .gitignore
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts          # Entry point — starts server
│   ├── app.ts            # Hono app factory — exported for testing
│   ├── config.ts         # Env var reading with defaults
│   ├── types.ts          # Shared TypeScript types
│   ├── routes/           # (empty — populated in later stories)
│   ├── middleware/
│   │   └── logger-middleware.ts  # Pino + pino-http setup
│   ├── schemas/          # (empty — populated in Story 1.5)
│   ├── db/
│   │   ├── migrations/   # (empty — populated in Story 1.2)
│   │   └── repositories/ # (empty — populated in Story 1.2+)
│   └── services/         # (empty — populated in Epic 4)
├── test/
│   ├── routes/           # (empty — populated in later stories)
│   ├── db/               # (empty — populated in later stories)
│   └── services/         # (empty — populated in later stories)
└── data/
    └── .gitkeep
```

### References

- [Source: architecture.md#Starter Template Evaluation] — initialization commands, tech stack selection
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — naming conventions, file patterns
- [Source: architecture.md#Project Structure & Boundaries] — complete directory structure
- [Source: architecture.md#Environment Variables] — env var names and defaults
- [Source: epics.md#Story 1.1] — acceptance criteria, user story
- [Source: ux-design-specification.md#Effortless Interactions] — authentication invisible after setup, error recovery self-documenting

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- `npm test`
- `npm run build`
- `PORT=3457 timeout 8s npm run dev`
- `ss -ltnp '( sport = :3000 )'`

### Completion Notes List

- ✅ AC1: Verified project structure, dependencies, TypeScript config, support files, and shared types.
- ✅ AC2: Verified Hono + `@hono/node-server` boots and emits structured Pino JSON startup logs.
- ✅ AC3: Verified custom `PORT` handling with live boot on `3457`; default `3000` remains defined in `src/config.ts`.
- ✅ AC4: Verified CORS origin parsing and header behavior via `test/app.test.ts`.
- ✅ AC5: Verified documented config defaults and invalid-env fallback via `test/config.test.ts`.
- ✅ Added `test/logger-middleware.test.ts` to cover logger level selection, JSON log payload shape, and middleware passthrough.
- ⚠️ Host environment note: port `3000` is occupied by an unrelated process (`next-server`), so live default-port boot could not bind on this machine.

### File List

- .env.example
- .gitignore
- data/.gitkeep
- package-lock.json
- package.json
- src/app.ts
- src/config.ts
- src/index.ts
- src/middleware/logger-middleware.ts
- src/types.ts
- test/app.test.ts
- test/config.test.ts
- test/logger-middleware.test.ts
- tsconfig.json
- vitest.config.ts

### Change Log

- 2026-03-20: Completed Story 1.1 implementation; validated config defaults/CORS/server boot and added logger test coverage.
