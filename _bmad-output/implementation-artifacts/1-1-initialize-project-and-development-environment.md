# Story 1.1: Initialize Project and Development Environment

Status: ready-for-dev

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

- [ ] Task 1: Initialize npm project and install dependencies (AC: #1)
  - [ ] Run `npm init -y` in project root
  - [ ] Install production deps: `hono @hono/node-server better-sqlite3 zod @hono/zod-validator pino pino-http`
  - [ ] Install dev deps: `typescript @types/better-sqlite3 @types/node tsx vitest`
  - [ ] Configure package.json scripts: `dev`, `build`, `start`, `test`
- [ ] Task 2: Configure TypeScript (AC: #1)
  - [ ] Run `npx tsc --init` and configure strict mode
  - [ ] Set `outDir: "dist"`, `rootDir: "src"`, `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`
  - [ ] Enable `declaration`, `strict`, `esModuleInterop`, `skipLibCheck`
- [ ] Task 3: Create project directory structure (AC: #1)
  - [ ] Create `src/routes/`, `src/middleware/`, `src/schemas/`, `src/db/`, `src/db/migrations/`, `src/db/repositories/`, `src/services/`
  - [ ] Create `test/routes/`, `test/db/`, `test/services/`
  - [ ] Create `data/` with `.gitkeep`
- [ ] Task 4: Implement config module (AC: #3, #4, #5)
  - [ ] Create `src/config.ts` reading PORT, DATA_DIR, CORS_ORIGINS, LOG_LEVEL, NODE_ENV from env
  - [ ] Apply defaults: PORT=3000, DATA_DIR=./data, LOG_LEVEL=info, NODE_ENV=development
  - [ ] Parse CORS_ORIGINS as comma-separated string to string array
- [ ] Task 5: Implement logger middleware (AC: #2)
  - [ ] Create `src/middleware/logger-middleware.ts` using Pino + pino-http
  - [ ] Configure Pino with LOG_LEVEL from config, JSON output to stdout
- [ ] Task 6: Implement Hono app factory (AC: #2, #4)
  - [ ] Create `src/app.ts` — Hono app factory exported for testing
  - [ ] Register CORS middleware using `hono/cors` with origins from config
  - [ ] Register logger middleware
  - [ ] Add placeholder route structure (empty route groups for future epics)
- [ ] Task 7: Implement server entry point (AC: #2, #3)
  - [ ] Create `src/index.ts` — starts @hono/node-server on configured PORT
  - [ ] Log server start message with port number via Pino
- [ ] Task 8: Create shared types (AC: #1)
  - [ ] Create `src/types.ts` with core types: Bookmark, Tag, ApiError, PaginatedResponse
- [ ] Task 9: Create project support files (AC: #1)
  - [ ] Create `.gitignore` (node_modules, dist, data/*.db*, .env)
  - [ ] Create `.env.example` documenting all env vars with defaults
  - [ ] Create `vitest.config.ts`
- [ ] Task 10: Verify dev server starts (AC: #2, #3, #5)
  - [ ] Run `npm run dev` and confirm Hono server starts on port 3000
  - [ ] Verify structured JSON log output

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
