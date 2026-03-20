# Story 1.4: Health Check Endpoint

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a health check endpoint that confirms the API is operational,
So that I can monitor uptime and use it for container orchestration.

## Acceptance Criteria

1. **Given** the API server is running **When** a GET request is made to `/api/health` **Then** a 200 response is returned with body `{ "status": "ok", "timestamp": "<ISO 8601 datetime>" }` (FR25)

2. **Given** the health check endpoint **When** a request is made without authentication **Then** the response is still 200 (health check bypasses auth middleware)

3. **Given** the server has just started **When** the health check is called within 5 seconds of startup **Then** it returns 200 (NFR5)

## Tasks / Subtasks

- [ ] Task 1: Verify existing `src/routes/health-routes.ts` implementation (AC: #1, #2)
  - [ ] Confirm GET `/api/health` returns `{ "status": "ok", "timestamp": "<ISO 8601>" }` with 200 status
  - [ ] Confirm response `Content-Type` is `application/json`
  - [ ] Confirm timestamp is valid ISO 8601 format with timezone (e.g., `2026-03-20T12:00:00.000Z`)
  - [ ] Confirm route is mounted at `/api/health` in `src/app.ts`

- [ ] Task 2: Verify auth bypass in `src/middleware/auth-middleware.ts` (AC: #2)
  - [ ] Confirm `/api/health` is excluded from auth middleware
  - [ ] Confirm no `Authorization` header is required

- [ ] Task 3: Expand test coverage in `test/routes/health-routes.test.ts` (AC: #1, #2, #3)
  - [ ] Test: GET `/api/health` returns 200 with `{ "status": "ok", "timestamp": "..." }`
  - [ ] Test: `status` field equals exactly `"ok"`
  - [ ] Test: `timestamp` field is valid ISO 8601 datetime
  - [ ] Test: Response has no extra unexpected fields (only `status` and `timestamp`)
  - [ ] Test: No `Authorization` header needed (request without auth succeeds)
  - [ ] Test: Response `Content-Type` is `application/json`

- [ ] Task 4: Verify startup timing meets NFR5 (AC: #3)
  - [ ] Confirm server starts and health check responds within 5 seconds of cold start
  - [ ] This is a manual/integration verification — no unit test needed

## Dev Notes

### CRITICAL: Health Endpoint Already Exists

Story 1.3 created `src/routes/health-routes.ts` and `test/routes/health-routes.test.ts` as part of the auth middleware bypass requirement. **Do NOT recreate these files.** This story is about verifying completeness, expanding test coverage, and ensuring full AC compliance.

### Existing Implementation

**`src/routes/health-routes.ts`** — Already implemented:
```typescript
// Returns { status: 'ok', timestamp: new Date().toISOString() }
// Mounted at /api/health in app.ts
// No auth required (bypassed in auth-middleware.ts)
```

**`test/routes/health-routes.test.ts`** — Already has basic test:
- Verifies GET /api/health returns 200
- Verifies status='ok' and valid timestamp
- May need expansion for full AC coverage

### What Needs Verification / Enhancement

1. **Response format exactness:** Confirm response body has ONLY `status` and `timestamp` keys — no extra fields
2. **Timestamp format:** Must be ISO 8601 with timezone (`.toISOString()` produces this)
3. **Content-Type header:** Should be `application/json; charset=UTF-8` (Hono default for `c.json()`)
4. **Test completeness:** Ensure all 3 ACs have corresponding test assertions

### Architecture Compliance

- **Error format:** Health check does not need error handling — it always returns 200 with static JSON (no database queries, no external calls)
- **No database dependency:** Health check should NOT query the database — it confirms the HTTP server is responsive, not database connectivity
- **Logging:** Health check requests will be logged by `pino-http` middleware — no additional logging needed
- **File naming:** `kebab-case.ts` — `health-routes.ts` (already correct)
- **Route pattern:** `GET /api/health` — mounted via `healthRoutes` in `app.ts` (already correct)

### Integration with Existing Code

- **`src/app.ts`** — Health routes already registered at `/api/health`
- **`src/middleware/auth-middleware.ts`** — Already skips `/api/health` path
- **`src/middleware/logger-middleware.ts`** — Automatically logs health check requests (Pino)
- **`test/helpers.ts`** — Use `createStubLogger()` and `createInMemoryManager()` for test isolation

### Previous Story Intelligence (Story 1.3)

**Key learnings from Story 1.3 code review:**
1. **Lazy initialization pattern:** Use `getDatabase()` inside functions, not at module level. Health routes don't use DB, so not applicable here — but awareness helps.
2. **Shared test helpers:** Use `test/helpers.ts` for `createStubLogger()` and `createInMemoryManager()` — do NOT duplicate.
3. **`app.request()` for integration tests:** Use Hono's test helper, no server spin-up needed.
4. **Logger mocking:** If tests produce unwanted log output, use `vi.mock()` for the logger module.

**Files from Story 1.3 relevant here:**
- `src/routes/health-routes.ts` — Created: the route handler
- `src/app.ts` — Modified: wired health routes
- `src/middleware/auth-middleware.ts` — Created: health bypass logic
- `test/routes/health-routes.test.ts` — Created: basic test
- `test/helpers.ts` — Created: shared test utilities

### What This Story Does NOT Include

- Database health checks (checking SQLite connectivity) — not in PRD requirements
- Detailed system metrics (memory, uptime, version) — not in PRD requirements
- Health check caching or rate limiting — unnecessary for single-user API
- Docker HEALTHCHECK instruction — that's Story 5.1 (Docker Containerization)

### File Location Rules

| File | Location | Action |
|---|---|---|
| Health routes | `src/routes/health-routes.ts` | Verify (already exists) |
| Health route tests | `test/routes/health-routes.test.ts` | Verify/expand (already exists) |
| App wiring | `src/app.ts` | Verify (already wired) |
| Auth bypass | `src/middleware/auth-middleware.ts` | Verify (already implemented) |

### Testing Requirements

- **Framework:** Vitest — already configured (`vitest.config.ts` exists)
- **Test isolation:** Use `createApp()` factory with `createStubLogger()` and `createInMemoryManager()`
- **Integration tests:** Use `app.request()` — no HTTP server needed
- **Test file:** `test/routes/health-routes.test.ts` (already exists, expand if needed)
- **All assertions must pass `npm test`**

### References

- [Source: architecture.md#Infrastructure & Deployment] — health check endpoint: `GET /api/health` returns `{ status: "ok", timestamp: "..." }`
- [Source: architecture.md#API & Communication Patterns] — response format patterns
- [Source: architecture.md#Project Structure & Boundaries] — routes boundary, middleware boundary
- [Source: epics.md#Story 1.4] — acceptance criteria, user story
- [Source: story 1-3] — health endpoint created for auth bypass, test patterns, code review learnings

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
