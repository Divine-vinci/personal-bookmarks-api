# Story 1.5: Error Handling and Input Validation Framework

Status: ready-for-dev

## Story

As a developer,
I want consistent, well-structured error responses for all error conditions,
So that API consumers can programmatically handle errors and debug issues quickly.

## Acceptance Criteria

1. **Given** any error occurs in the API **When** the centralized error handler processes it **Then** the response body matches `{ "error": { "code": "<machine-readable>", "message": "<human-readable>" } }` (FR28)

2. **Given** a request with malformed JSON body **When** the server processes it **Then** a 400 response with code `invalid_request` is returned (FR31)

3. **Given** a request with a body exceeding 1MB **When** the server processes it **Then** a 400 response with code `invalid_request` is returned (NFR10)

4. **Given** a Zod validation error occurs (e.g., missing required field, field too long) **When** the error handler processes it **Then** a 422 response with code `validation_error` is returned with per-field error details (FR30)

5. **Given** a request with an invalid URL value in the url field **When** validation runs **Then** a 400 response with code `invalid_url` is returned (FR29)

6. **Given** a request for a resource that does not exist **When** the route handler throws a not-found error **Then** a 404 response with code `not_found` is returned (FR31)

7. **Given** an unexpected server error occurs **When** the error handler processes it **Then** a 500 response with code `internal_error` is returned **And** no internal details are exposed **And** the full error is logged via Pino (NFR18)

8. **Given** Zod schemas are defined for bookmark creation and update **When** they are used **Then** url is required and validated as a valid URL (max 2000 chars), title is required (max 500 chars), description is optional (max 2000 chars), tags is an optional array of strings

## Tasks / Subtasks

- [ ] Task 1: Create centralized error handler middleware (AC: #1, #2, #7)
  - [ ] Create `src/middleware/error-middleware.ts` with Hono `onError` handler
  - [ ] Handle `HTTPException` — extract status and body, return standard error JSON
  - [ ] Handle `ZodError` — map to 422 with `validation_error` code and per-field messages
  - [ ] Handle unknown errors — return 500 `internal_error`, log full error via Pino, never expose internals
  - [ ] Handle malformed JSON (SyntaxError from body parsing) — return 400 `invalid_request`

- [ ] Task 2: Add body size limit middleware (AC: #3)
  - [ ] Add Hono `bodyLimit` middleware to `src/app.ts` — 1MB default limit
  - [ ] Ensure oversized requests return 400 with `invalid_request` error format

- [ ] Task 3: Create Zod validation schemas (AC: #4, #5, #8)
  - [ ] Create `src/schemas/bookmark-schemas.ts` with:
    - `createBookmarkSchema`: url (required, valid URL, max 2000), title (required, max 500), description (optional, max 2000), tags (optional array of trimmed lowercase strings)
    - `updateBookmarkSchema`: same shape as create
  - [ ] Create `src/schemas/common-schemas.ts` with:
    - `paginationSchema`: limit (optional int, default 20, max 100), offset (optional int, default 0, min 0), sort (optional enum: created_at, updated_at, title)
    - `idParamSchema`: id (integer, positive)
  - [ ] URL validation: use Zod `.url()` refinement; produce `invalid_url` error code distinct from generic validation

- [ ] Task 4: Create application error helpers (AC: #1, #5, #6)
  - [ ] Define a lightweight `AppError` class or factory functions in `src/middleware/error-middleware.ts` (or `src/types.ts`) for throwing typed errors:
    - `notFound(message)` — throws HTTPException(404) with `not_found` code
    - `conflict(message)` — throws HTTPException(409) with `duplicate_url` code (for future use in Epic 2)
    - `invalidUrl(message)` — throws HTTPException(400) with `invalid_url` code
  - [ ] These helpers ensure route handlers never construct error JSON manually

- [ ] Task 5: Wire error middleware into app (AC: #1)
  - [ ] Register `onError` handler in `src/app.ts`
  - [ ] Register `onNotFound` handler for unknown routes — return 404 `not_found`
  - [ ] Verify middleware execution order: logger → CORS → bodyLimit → auth → routes → onError

- [ ] Task 6: Write tests (AC: #1–#8)
  - [ ] Create `test/middleware/error-middleware.test.ts`:
    - Test: malformed JSON body → 400 `invalid_request`
    - Test: unknown route → 404 `not_found`
    - Test: HTTPException → correct status and error JSON
    - Test: unexpected error → 500 `internal_error` with no stack trace in response
    - Test: error response always matches `{ error: { code, message } }` shape
  - [ ] Create `test/schemas/bookmark-schemas.test.ts`:
    - Test: valid create payload passes
    - Test: missing url → validation error
    - Test: missing title → validation error
    - Test: url exceeds 2000 chars → validation error
    - Test: title exceeds 500 chars → validation error
    - Test: invalid URL format → error (for `invalid_url` code)
    - Test: tags normalized to lowercase trimmed
    - Test: description optional (null/undefined allowed)
  - [ ] Create `test/schemas/common-schemas.test.ts`:
    - Test: default pagination values (limit=20, offset=0)
    - Test: limit capped at 100
    - Test: invalid sort value rejected
    - Test: valid sort values accepted (created_at, updated_at, title)
  - [ ] All tests must pass `npm test`

## Dev Notes

### Error Response Format (MUST follow exactly)

All errors MUST return this exact JSON structure — no exceptions:
```json
{ "error": { "code": "<machine_readable_snake_case>", "message": "<human readable string>" } }
```

Error codes used in this story:
| HTTP Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, body too large, bad request |
| 400 | `invalid_url` | URL field fails URL validation |
| 401 | `unauthorized` | Missing/invalid API key (already in auth-middleware) |
| 404 | `not_found` | Resource not found, unknown route |
| 422 | `validation_error` | Zod schema validation failure |
| 500 | `internal_error` | Unexpected server error |

For 422 validation errors, include field details in message or as additional `details` array — consistent with FR30 (per-field error messages). Example:
```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": [
      { "field": "url", "message": "Invalid url: must be a valid URL" },
      { "field": "title", "message": "Required" }
    ]
  }
}
```

### Existing Patterns to Follow

**Auth middleware already uses the error format** (`src/middleware/auth-middleware.ts:9-14`):
```typescript
const UNAUTHORIZED_RESPONSE: ApiError = {
  error: { code: 'unauthorized', message: 'Invalid or missing API key' },
};
```
Follow this exact pattern. The `ApiError` type is already defined in `src/types.ts`.

**App factory pattern** (`src/app.ts`): Uses `createApp(appConfig)` factory. Register `onError` and `onNotFound` on the Hono app instance.

**Test helpers** (`test/helpers.ts`): Use `createStubLogger()` and `createInMemoryManager()` for isolated tests. Use `app.request()` for integration tests — no HTTP server needed.

### Hono-Specific Implementation Details

**`onError` handler:** Hono uses `app.onError((err, c) => ...)` — this catches all thrown errors from route handlers and middleware.

**`app.notFound((c) => ...)`:** Handles requests to undefined routes.

**Body size limit:** Use Hono's `bodyLimit` middleware:
```typescript
import { bodyLimit } from 'hono/body-limit';
app.use('*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
```
When limit exceeded, Hono throws a 413 error — intercept in onError and return 400 `invalid_request` to match AC#3.

**Zod validator middleware:** `@hono/zod-validator` is already installed. Use with:
```typescript
import { zValidator } from '@hono/zod-validator';
app.post('/api/bookmarks', zValidator('json', createBookmarkSchema), handler);
```
When Zod validation fails, `@hono/zod-validator` returns a 400 by default. Override with a custom `hook` to throw a ZodError instead, so the centralized error handler can format it as 422 `validation_error`.

### Zod v4 Notes

This project uses Zod v4.3.6 (not v3). Key differences:
- Import: `import { z } from 'zod'` (same)
- URL validation: `z.string().url()` (same)
- Error access: `error.issues` array with `path`, `message` fields
- `z.infer<typeof schema>` for type extraction (same)

### Body Size Limit vs Import Endpoint

Standard endpoints: 1MB body limit (NFR10). The import endpoint (Epic 4) needs 10MB — this will be handled later by applying a route-specific override. For now, set the global 1MB limit.

### Files to Create

| File | Purpose |
|---|---|
| `src/middleware/error-middleware.ts` | Centralized `onError` + `notFound` handlers + error helper functions |
| `src/schemas/bookmark-schemas.ts` | Zod schemas for bookmark create/update |
| `src/schemas/common-schemas.ts` | Zod schemas for pagination, ID params |
| `test/middleware/error-middleware.test.ts` | Error handler tests |
| `test/schemas/bookmark-schemas.test.ts` | Bookmark schema validation tests |
| `test/schemas/common-schemas.test.ts` | Common schema validation tests |

### Files to Modify

| File | Change |
|---|---|
| `src/app.ts` | Register `onError`, `notFound`, `bodyLimit` middleware |
| `src/types.ts` | Possibly extend `ApiError` to include optional `details` field for validation errors |

### Architecture Compliance

- **Naming:** `kebab-case.ts` for files, `camelCase` for functions, `PascalCase` for types, `camelCase` + `Schema` suffix for Zod schemas
- **File locations:** Schemas in `src/schemas/`, middleware in `src/middleware/`, tests in `test/` mirroring `src/`
- **No `console.log`:** Use Pino logger from `src/middleware/logger-middleware.ts`
- **Parameterized queries:** N/A for this story (no DB queries)
- **Error format:** `{ error: { code, message } }` — enforced by centralized handler

### Previous Story Intelligence (Story 1.4)

Key learnings:
1. Use `test/helpers.ts` for `createStubLogger()` and `createInMemoryManager()` — do NOT duplicate helpers
2. Use `app.request()` for integration tests — no server spin-up
3. Build script uses `scripts/copy-migrations.mjs` — be aware if adding new build steps
4. 35 tests currently pass — this story must not break any

### Git Intelligence

Recent commits show the project follows `[BMAD Phase 4] Story X.Y: Title` commit format. Files modified recently:
- `src/db/database.ts` — migration path simplified
- `test/helpers.ts` — shared test utilities
- `src/app.ts` — route wiring

### References

- [Source: architecture.md#Error Handling Patterns] — HTTPException + centralized onError handler
- [Source: architecture.md#Validation Patterns] — Zod + @hono/zod-validator at route level
- [Source: architecture.md#API & Communication Patterns] — error response format
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — naming, anti-patterns
- [Source: epics.md#Story 1.5] — acceptance criteria, FRs covered
- [Source: epics.md#Requirements Inventory] — FR28-31, NFR10, NFR18
- [Source: story 1-4] — test helper patterns, app factory, existing middleware

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
