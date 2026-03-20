# Story 1.3: API Key Authentication

Status: done

## Story

As a developer,
I want the system to auto-generate an API key on first run and require it for all API requests,
So that my bookmark data is protected from unauthorized access.

## Acceptance Criteria

1. **Given** the application starts for the first time (no API key in settings) **When** the database is initialized **Then** a 64-character hex API key is generated using `crypto.randomBytes(32)` **And** the key is displayed once in the server logs at startup **And** only the SHA-256 hash of the key is stored in the `settings` table (NFR6)

2. **Given** a valid API key exists **When** a request includes `Authorization: Bearer <valid-key>` header **Then** the request is authenticated and proceeds to the route handler (FR16)

3. **Given** a request is made without an Authorization header **When** the auth middleware processes it **Then** a 401 response is returned with body `{ "error": { "code": "unauthorized", "message": "..." } }` (FR18) **And** the error message does not reveal whether the key format was wrong or the key was invalid (NFR8)

4. **Given** a request is made with an invalid API key **When** the auth middleware processes it **Then** a 401 response is returned with the same generic error format (NFR8)

5. **Given** a user sends a POST request to `/api/auth/regenerate` with a valid API key **When** the request is processed **Then** a new API key is generated, the old key is invalidated, the new key hash replaces the old one in settings **And** the new key is returned in the response body (FR17)

6. **Given** the health check endpoint `/api/health` **When** a request is made without an API key **Then** the request succeeds (health check is excluded from auth middleware)

## Tasks / Subtasks

- [x] Task 1: Create `src/db/repositories/settings-repository.ts` (AC: #1, #5)
  - [x] `getApiKeyHash(): string | null` — query `settings` table for key `api_key_hash`
  - [x] `setApiKeyHash(hash: string): void` — upsert `api_key_hash` in `settings` table
  - [x] Use parameterized queries only (NFR9)
  - [x] Use `getDatabase()` from `src/db/database.ts` for the db instance

- [x] Task 2: Create `src/middleware/auth-middleware.ts` (AC: #2, #3, #4, #6)
  - [x] Export `authMiddleware()` — Hono MiddlewareHandler
  - [x] Skip auth for requests to `/api/health` (check `c.req.path`)
  - [x] Extract Bearer token from `Authorization` header
  - [x] Hash incoming token with SHA-256, compare against stored hash using `crypto.timingSafeEqual`
  - [x] On failure: return 401 with `{ "error": { "code": "unauthorized", "message": "Invalid or missing API key" } }`
  - [x] Generic error message for ALL failure cases — missing header, wrong format, invalid key (NFR8)
  - [x] Log auth failures at `warn` level (do NOT log the token itself)

- [x] Task 3: Create API key generation + first-run logic in `src/index.ts` (AC: #1)
  - [x] After `initDatabase()`, check if API key hash exists via settings repository
  - [x] If no key exists: generate with `crypto.randomBytes(32).toString('hex')`, hash with SHA-256, store hash, log plaintext key ONCE at `info` level
  - [x] If key exists: log `info` message that API key is already configured (do NOT log the key)
  - [x] This runs BEFORE server starts listening

- [x] Task 4: Create `src/routes/auth-routes.ts` with regenerate endpoint (AC: #5)
  - [x] `POST /api/auth/regenerate` — requires valid auth (middleware already applied)
  - [x] Generate new key with `crypto.randomBytes(32).toString('hex')`
  - [x] Hash new key with SHA-256, store via settings repository
  - [x] Return `{ "api_key": "<new-plaintext-key>" }` with 200 status
  - [x] Log key regeneration at `info` level (do NOT log the key value)

- [x] Task 5: Create `src/routes/health-routes.ts` (AC: #6)
  - [x] `GET /api/health` — returns `{ "status": "ok", "timestamp": "<ISO 8601>" }`
  - [x] No authentication required (excluded in auth middleware)
  - [x] 200 status code

- [x] Task 6: Wire middleware and routes into `src/app.ts` (AC: #2, #6)
  - [x] Apply `authMiddleware()` AFTER logger middleware, BEFORE route handlers
  - [x] Register health routes at `/api/health`
  - [x] Register auth routes at `/api/auth`
  - [x] Ensure middleware ordering: logger → auth → routes

- [x] Task 7: Write tests (AC: #1-6)
  - [x] `test/db/settings-repository.test.ts` — get/set API key hash with in-memory DB
  - [x] `test/middleware/auth-middleware.test.ts` — valid key, missing header, invalid key, health bypass
  - [x] `test/routes/auth-routes.test.ts` — regenerate endpoint returns new key, old key invalidated
  - [x] `test/routes/health-routes.test.ts` — returns 200 with status/timestamp, no auth required
  - [x] Use `app.request()` for integration tests (Hono test helper, no server spin-up)
  - [x] Use in-memory SQLite for test isolation

## Dev Notes

### Critical: Crypto Implementation Details

**Key generation:**
```typescript
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Generate 64-char hex API key
const apiKey = randomBytes(32).toString('hex');

// Hash for storage (SHA-256, not bcrypt — API keys are high-entropy)
const hash = createHash('sha256').update(apiKey).digest('hex');
```

**Key comparison (timing-safe):**
```typescript
// MUST use timingSafeEqual to prevent timing attacks
const incomingHash = createHash('sha256').update(incomingKey).digest('hex');
const storedHash = settingsRepo.getApiKeyHash();
const isValid = timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash));
```

**Why SHA-256 and not bcrypt:** API keys are 256-bit random values (not user-chosen passwords). SHA-256 is sufficient and fast — no brute-force risk at this entropy level. Architecture decision documented in `architecture.md#Authentication & Security`.

### Architecture Compliance

- **Error format:** ALL 401 responses MUST use `{ "error": { "code": "unauthorized", "message": "..." } }` — matches centralized error pattern
- **Generic error messages:** Same message for missing header, wrong format, invalid key (NFR8 — no information leakage)
- **Parameterized queries ONLY** in settings repository (NFR9)
- **Logging:** Use Pino `logger` from `src/middleware/logger-middleware.ts` — NEVER `console.log`
- **File naming:** `kebab-case.ts` for all files
- **Function naming:** `camelCase` for all functions

### Auth Middleware Pattern

```typescript
// src/middleware/auth-middleware.ts
import type { MiddlewareHandler } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getApiKeyHash } from '../db/repositories/settings-repository.js';
import { logger } from './logger-middleware.js';

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    // Skip auth for health check
    if (c.req.path === '/api/health') {
      return next();
    }

    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      // Return 401 — same message for all failures
    }

    const token = authHeader.slice(7);
    const hash = createHash('sha256').update(token).digest('hex');
    const storedHash = getApiKeyHash();

    if (!storedHash || !timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash))) {
      // Return 401
    }

    return next();
  };
};
```

### Settings Repository Pattern

```typescript
// src/db/repositories/settings-repository.ts
import { getDatabase } from '../database.js';

export function getApiKeyHash(): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key_hash') as { value: string } | undefined;
  return row?.value ?? null;
}

export function setApiKeyHash(hash: string): void {
  const db = getDatabase();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('api_key_hash', hash);
}
```

### Integration with Existing Code

- **`src/db/database.ts`** — exports `getDatabase()` returning better-sqlite3 `Database` instance. Use this in settings repository. DB is synchronous — no async/await needed for queries.
- **`src/middleware/logger-middleware.ts`** — exports `logger` (Pino instance) and `loggerMiddleware()`. Auth middleware should use `logger` for warn-level auth failure logging.
- **`src/config.ts`** — exports `config` with `dataDir`, `port`, etc. No auth-specific config needed (API key is auto-generated, not configurable).
- **`src/app.ts`** — currently applies CORS and logger middleware, mounts empty routes for `/bookmarks`, `/tags`, `/auth`. You MUST replace the empty route mounts with actual route handlers and add auth middleware.
- **`src/index.ts`** — currently calls `initDatabase()` then starts server. Add API key initialization between database init and server start.
- **`src/types.ts`** — `ApiError` type already defined: `{ error: { code: string; message: string } }`. Use this for 401 responses.

### Previous Story Intelligence (Story 1.2)

**Key learnings from code review:**
1. **Lazy initialization pattern:** Story 1.2 had a critical bug where module-level eager DB initialization crashed before `mkdirSync`. Fixed with lazy-init `getDatabase()` singleton. Use the same pattern — call `getDatabase()` inside functions, not at module level.
2. **No unused exports:** Story 1.2 review removed unused exports. Only export what's needed.
3. **Locale-independent sorting:** Use `Array.sort()` not `localeCompare`. (Not relevant to this story but good awareness.)

**Existing test patterns:**
- Vitest with `describe`/`it`/`expect`
- In-memory SQLite via `createDatabaseManager({ dbPath: ':memory:' })` for test isolation
- `app.request()` for HTTP integration tests (see `test/app.test.ts`)
- Test files mirror src structure: `test/routes/`, `test/middleware/`, `test/db/`

### What This Story Does NOT Include

- Health check response validation beyond 200 + JSON body (detailed health checking is Story 1.4)
- Error handling middleware (Story 1.5)
- Zod validation schemas for request bodies (Story 1.5)
- Any bookmark CRUD routes (Epic 2)
- Rate limiting on auth failures (deferred post-MVP)

### File Location Rules

| File | Location | Purpose |
|---|---|---|
| Settings repository | `src/db/repositories/settings-repository.ts` | API key hash get/set |
| Auth middleware | `src/middleware/auth-middleware.ts` | Bearer token validation |
| Auth routes | `src/routes/auth-routes.ts` | POST /api/auth/regenerate |
| Health routes | `src/routes/health-routes.ts` | GET /api/health |
| Settings repo tests | `test/db/settings-repository.test.ts` | Repository unit tests |
| Auth middleware tests | `test/middleware/auth-middleware.test.ts` | Middleware tests |
| Auth route tests | `test/routes/auth-routes.test.ts` | Endpoint integration tests |
| Health route tests | `test/routes/health-routes.test.ts` | Health endpoint tests |

### Testing Requirements

- **Test isolation:** In-memory SQLite (`:memory:`) — NEVER touch the real data directory
- **Auth middleware tests:** Create a test app with auth middleware, use `app.request()`:
  - Request without Authorization header → 401
  - Request with `Authorization: Bearer <wrong-key>` → 401
  - Request with `Authorization: Bearer <valid-key>` → passes through to route (200)
  - Request to `/api/health` without auth → 200 (bypassed)
- **Settings repository tests:** Use in-memory DB, test get (empty), set, get (populated), upsert (overwrite)
- **Regenerate tests:** Authenticated POST to `/api/auth/regenerate` → 200 with new key, old key no longer works
- **Framework:** Vitest — already configured from Story 1.1 (`vitest.config.ts` exists)

### References

- [Source: architecture.md#Authentication & Security] — key generation, SHA-256 hashing, Bearer auth pattern
- [Source: architecture.md#API & Communication Patterns] — error response format `{ error: { code, message } }`
- [Source: architecture.md#Implementation Patterns] — naming conventions, file structure, enforcement guidelines
- [Source: architecture.md#Project Structure & Boundaries] — middleware/routes/repository boundaries
- [Source: epics.md#Story 1.3] — acceptance criteria, user story
- [Source: epics.md#Story 1.4] — health check is separate story but basic endpoint needed here for auth bypass
- [Source: story 1-2] — lazy-init pattern, test patterns, code review learnings

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

### Completion Notes List

- Added API key settings repository, auth middleware, health/auth routes, and startup key provisioning before server listen.
- Added isolated in-memory SQLite tests covering first-run key generation, auth success/failure cases, health bypass, and regeneration invalidation flow.
- Validation completed with `npm test` and `npm run build`.

### File List

- `src/db/repositories/settings-repository.ts` — Created: API key hash get/set repository
- `src/middleware/auth-middleware.ts` — Created: Bearer token auth middleware with health bypass
- `src/routes/auth-routes.ts` — Created: POST /api/auth/regenerate endpoint
- `src/routes/health-routes.ts` — Created: GET /api/health endpoint
- `src/app.ts` — Modified: wired auth middleware + health/auth routes
- `src/index.ts` — Modified: added ensureApiKeyConfigured() first-run logic
- `src/db/database.ts` — Modified: added setDatabaseManager() for test isolation
- `test/helpers.ts` — Created: shared test utilities (createStubLogger, createInMemoryManager)
- `test/db/settings-repository.test.ts` — Created: settings repository unit tests
- `test/middleware/auth-middleware.test.ts` — Created: auth middleware tests
- `test/routes/auth-routes.test.ts` — Created: regenerate endpoint integration tests
- `test/routes/health-routes.test.ts` — Created: health endpoint tests
- `test/index.test.ts` — Created: ensureApiKeyConfigured unit tests

### Senior Developer Review (AI)

**Reviewer:** Amelia (claude-opus-4-6)
**Date:** 2026-03-20

**Issues Found:** 1 High, 3 Medium, 1 Low
**Issues Fixed:** 4 (1 High, 3 Medium)

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | HIGH | API key logged as structured JSON field in `src/index.ts:24` — plaintext key indexed by log aggregation | Moved key to message text, removed from structured fields |
| 2 | MEDIUM | Dev Agent Record File List empty — no documentation of created/modified files | Populated File List with all 13 files |
| 3 | MEDIUM | `createStubLogger()`/`createInMemoryManager()` duplicated across 4 test files | Extracted to shared `test/helpers.ts` |
| 4 | MEDIUM | Auth middleware warn logs leaking into test output | Added `vi.mock()` for logger in auth-middleware tests |
| 5 | LOW | No test for non-Bearer auth scheme (`Authorization: Basic xyz`) | Not fixed — code handles correctly, low risk |

**Acceptance Criteria Validation:**
- AC1: IMPLEMENTED — key generation, hash storage, one-time log display ✓
- AC2: IMPLEMENTED — valid Bearer token authentication ✓
- AC3: IMPLEMENTED — 401 for missing header with correct error format ✓
- AC4: IMPLEMENTED — 401 for invalid key with same generic error ✓
- AC5: IMPLEMENTED — POST /api/auth/regenerate returns new key, invalidates old ✓
- AC6: IMPLEMENTED — /api/health bypasses auth middleware ✓

**Verdict:** APPROVED — all ACs implemented, all HIGH/MEDIUM issues fixed

### Change Log

- 2026-03-20: Code review by Amelia — fixed 4 issues, approved, status → done
