---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments: ["product-brief-personal-bookmarks-api-2026-03-20.md", "prd-personal-bookmarks-api.md", "prd-personal-bookmarks-api-validation.md", "ux-design-specification.md"]
workflowType: 'architecture'
project_name: 'personal-bookmarks-api'
user_name: 'User'
date: '2026-03-20'
lastStep: 8
status: 'complete'
completedAt: '2026-03-20'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

33 functional requirements across 8 categories:

- **Bookmark Management (FR1-6):** Standard CRUD with full-replace update semantics. Sorting by created_at, updated_at, title. Architecturally straightforward — maps to a single bookmarks table with standard REST routing.
- **Search & Discovery (FR7-10):** Full-text search across title, URL, description, and tags using SQLite FTS5. Tag filtering with AND semantics. Combined search + tag filtering in single queries. Results ranked by relevance. This is the core architectural differentiator — FTS5 requires a virtual table synchronized with the main bookmarks table.
- **Tag Organization (FR11-14):** Tags as a many-to-many relationship with bookmarks. Auto-creation on assignment, auto-cleanup on zero count. Tag listing with bookmark counts requires efficient aggregation queries.
- **Authentication (FR15-18):** Auto-generated API key on first run, stored hashed. Bearer token auth on all endpoints. Key regeneration endpoint. Minimal auth middleware — single check, no sessions.
- **Data Import (FR19-21):** Netscape HTML bookmark file parsing. Folder hierarchy maps to tags. Must report success/failure counts. Atomic operation — partial failures cannot corrupt existing data (NFR14).
- **Data Export (FR22-23):** Full JSON export of all bookmarks with all fields. Simple query + serialization.
- **Deployment & Operations (FR24-27):** Single Docker container, SQLite embedded, health check endpoint, volume-mounted persistence, <5s cold start.
- **Error Handling (FR28-31):** Consistent JSON error format with machine-readable codes. URL validation. Per-field validation errors. Appropriate HTTP status codes (400, 401, 404, 409, 422, 500).
- **Configuration (FR32-33):** CORS via environment variable. Port via environment variable.

**Non-Functional Requirements:**

18 NFRs across 4 categories that drive architectural decisions:

- **Performance (NFR1-5):** p95 < 200ms for CRUD and search at 10K bookmarks. Import of 1K bookmarks < 30s. Export of 10K < 10s. Cold start < 5s. These are comfortable targets for SQLite — no caching layer needed.
- **Security (NFR6-10):** Hashed API key storage. TLS via reverse proxy (not application concern). Generic auth failure messages. Parameterized queries (SQL injection prevention). Input size limits (1MB per request).
- **Reliability (NFR11-14):** Zero data loss across restarts with volume mount. WAL mode for crash consistency. 99.9% uptime target. Atomic imports.
- **Deployment (NFR15-18):** Docker image < 50MB. No external dependencies. Environment variable configuration (12-factor). Structured JSON logging to stdout.

**Scale & Complexity:**

- Primary domain: API Backend
- Complexity level: Low
- Estimated architectural components: 6-8 (HTTP server, router/middleware, auth, bookmark service, search/FTS, import parser, export serializer, database layer)

### Technical Constraints & Dependencies

- **Database:** SQLite with FTS5 extension — embedded, file-based, no external database server
- **Deployment:** Single Docker container, must be < 50MB image
- **Auth:** Single API key, no OAuth/SSO/multi-user complexity
- **Data format:** JSON request/response for all API endpoints; Netscape HTML for import
- **Configuration:** Environment variables only (PORT, CORS origins, data directory)
- **No external services:** Zero runtime dependencies beyond the container itself

### Cross-Cutting Concerns Identified

- **Error handling consistency:** All endpoints must return the same JSON error structure with machine-readable codes — requires centralized error handling middleware
- **Input validation:** URL validation, field length limits, payload size limits — validation layer before business logic
- **Authentication:** Bearer token check on every request except health check — middleware concern
- **Structured logging:** JSON to stdout for all operations — logging infrastructure decision
- **CORS:** Configurable allowed origins — middleware concern
- **Database transactions:** Import atomicity requires transaction support; FTS sync requires triggers or application-level consistency

## Starter Template Evaluation

### Technical Preferences

No existing technical preferences documented in project context. The PRD mentions "lightweight HTTP framework (e.g., Hono, Fastify, or Go's net/http)" as an implementation consideration — signaling a preference for minimal frameworks over batteries-included options.

### Primary Technology Domain

API Backend — pure REST API with no frontend, no CLI, no SDK. TypeScript is the natural choice for developer ergonomics, ecosystem maturity, and the project's focus on developer tooling.

### Starter Options Considered

| Option | Runtime | Latest Version | Pros | Cons |
|---|---|---|---|---|
| **Hono + Node.js** | Node.js | v4.12.8 (Mar 2026) | Ultra-lightweight, Web Standards API, multi-runtime, excellent TypeScript, tiny bundle, built-in middleware (CORS, Bearer auth, validator) | Newer than Fastify, smaller plugin ecosystem |
| **Fastify + Node.js** | Node.js | v5.x | Mature ecosystem, rich plugin system (fastify-sqlite, fastify-cors), battle-tested in production, excellent TypeScript | Heavier than Hono, plugin-oriented architecture adds abstraction |
| **Elysia + Bun** | Bun | v1.x | Fastest raw performance, built-in SQLite via bun:sqlite, end-to-end type safety, zero-dep SQLite | Bun runtime less mature for production, smaller community, fewer deployment guides |

### Selected Starter: Hono + Node.js (from scratch)

**Rationale for Selection:**

1. **Minimal footprint matches project philosophy.** The PRD explicitly values "lightweight" and "minimal footprint." Hono is one of the smallest HTTP frameworks available — the core is ~14KB. This directly supports the <50MB Docker image requirement.
2. **Built-in middleware covers cross-cutting concerns.** Hono ships with CORS, Bearer Auth, and validator middleware out of the box — exactly what this project needs without additional dependencies.
3. **Web Standards API.** Hono uses standard Request/Response objects, making the code portable and easy to test without framework-specific mocking.
4. **Multi-runtime escape hatch.** While targeting Node.js for production stability, Hono code can run on Bun, Deno, or Cloudflare Workers without changes — future-proofing without cost.
5. **No starter template needed.** For a project this simple (9 endpoints, SQLite, single-user auth), a fresh `npm init` with Hono + TypeScript + better-sqlite3 is cleaner than any starter template. Starters add opinions we don't need.

**Initialization Command:**

```bash
mkdir personal-bookmarks-api && cd personal-bookmarks-api
npm init -y
npm install hono @hono/node-server better-sqlite3
npm install -D typescript @types/better-sqlite3 @types/node tsx vitest
npx tsc --init
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript with Node.js (LTS) — mature, stable, well-supported
- `tsx` for development (fast TypeScript execution without compilation step)
- Strict TypeScript configuration

**Build Tooling:**
- TypeScript compiler (`tsc`) for production builds
- `tsx` for development with hot reload
- No bundler needed — Node.js runs the compiled output directly

**Testing Framework:**
- Vitest — fast, TypeScript-native, compatible with Hono's test helpers
- Hono provides `app.request()` for integration testing without spinning up a server

**Code Organization:**
- Flat, simple structure appropriate for a small API:
  - `src/` — application code
  - `src/routes/` — route handlers grouped by resource
  - `src/middleware/` — auth, error handling, CORS
  - `src/db/` — database layer, migrations, FTS setup
  - `src/services/` — business logic (import parser, export)
  - `test/` — test files mirroring src structure

**Development Experience:**
- `tsx watch src/index.ts` for development with auto-reload
- `vitest` for test runner with watch mode
- No complex dev server configuration needed

**Note:** Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database library and FTS5 integration strategy
- Data modeling approach (schema design, migrations)
- Input validation strategy
- Authentication implementation
- Error handling pattern

**Important Decisions (Shape Architecture):**
- Logging infrastructure
- Testing strategy
- Docker build approach
- Import parser library selection

**Deferred Decisions (Post-MVP):**
- PostgreSQL migration path
- API versioning strategy
- Rate limiting implementation
- OpenAPI spec generation

### Data Architecture

| Decision | Choice | Version | Rationale |
|---|---|---|---|
| **Database** | SQLite via better-sqlite3 | v12.8.0 | Synchronous API (simpler code, no async overhead for single-user), fastest Node.js SQLite binding, built-in FTS5 support, excellent TypeScript types |
| **FTS5 Strategy** | Content-sync FTS5 virtual table with triggers | SQLite built-in | FTS5 content table mirrors bookmarks table. SQLite triggers keep FTS index in sync on INSERT/UPDATE/DELETE — no application-level sync code needed. Ranking via `bm25()` function. |
| **Schema Migrations** | Hand-written SQL migration files, applied at startup | N/A | For a project with 3-4 tables, an ORM or migration framework is overhead. Numbered `.sql` files in `src/db/migrations/` applied sequentially. Migration tracking via a `migrations` table. |
| **Data Modeling** | Normalized with junction table for tags | N/A | Three tables: `bookmarks`, `tags`, `bookmark_tags`. Normalized design supports tag counts, cleanup, and flexible querying. Tags stored lowercase-trimmed for consistency. |
| **Input Validation** | Zod schemas | v4.3.6 | TypeScript-first, excellent error messages, composable schemas, widely adopted. Hono has `@hono/zod-validator` middleware for seamless integration. Zod schemas serve double duty as TypeScript types and runtime validation. |
| **Caching** | None | N/A | SQLite reads are fast enough for single-user (sub-ms for indexed queries). Caching adds complexity without measurable benefit at this scale. |

### Authentication & Security

| Decision | Choice | Rationale |
|---|---|---|
| **Auth mechanism** | API key via `Authorization: Bearer <key>` | PRD requirement. Single-user, single-key. Checked in middleware on every request except `/api/health`. |
| **Key storage** | SHA-256 hash in SQLite `settings` table | Never store plaintext. On first run, generate a random 32-byte key, display it once, store the hash. Compare incoming keys by hashing and comparing. |
| **Key generation** | `crypto.randomBytes(32).toString('hex')` | Node.js built-in crypto. 64-character hex string — sufficient entropy for a single-user API key. |
| **Password hashing** | SHA-256 (not bcrypt) | This is an API key comparison, not a password. API keys are high-entropy random strings, not user-chosen passwords. SHA-256 is sufficient and fast. |
| **Request size limit** | 1MB max body size | Hono middleware. Prevents oversized payloads. Import endpoint may need a higher limit (10MB) for large bookmark files. |
| **CORS** | Hono `cors()` middleware with configurable origins via `CORS_ORIGINS` env var | Supports browser-based consumers (bookmarklets, dashboards). Default: disabled (empty = no CORS headers). |

### API & Communication Patterns

| Decision | Choice | Rationale |
|---|---|---|
| **API style** | REST with JSON | PRD requirement. 9 endpoints, resource-oriented, standard HTTP methods. |
| **Error handling** | Centralized Hono `onError` handler + `HTTPException` | All errors flow through one handler that produces the standard `{ error: { code, message } }` JSON response. Route handlers throw typed errors; middleware catches and formats. |
| **Pagination** | Offset-based with `limit`/`offset` query params | Simple, stateless, matches PRD spec. Default limit: 20, max: 100. Response includes total count in a wrapper: `{ data: [...], total: N }`. |
| **Response format** | Envelope for lists: `{ data: [], total: N }`. Direct object for single resources. | Lists need total count for pagination. Single resources are returned directly for simplicity. |
| **Content negotiation** | JSON only — `Content-Type: application/json` | API-only product. No HTML, no XML. Import endpoint accepts `multipart/form-data` for file upload. |
| **URL validation** | Zod `.url()` refinement | Validates well-formed URLs at the schema level. Rejects malformed URLs before they reach the database. |
| **API documentation** | README with curl examples (MVP). OpenAPI spec deferred to post-MVP. | Matches PRD scope. curl examples are more useful to the target audience than generated Swagger docs. |

### Frontend Architecture

Not applicable — this is a pure API backend with no frontend component.

### Infrastructure & Deployment

| Decision | Choice | Version | Rationale |
|---|---|---|---|
| **Runtime** | Node.js LTS | v24.14.0 | Current LTS (Krypton). Mature, stable, well-supported. |
| **Logging** | Pino | v10.3.1 | Fastest structured JSON logger for Node.js. Outputs to stdout by default. Minimal configuration needed. `pino-http` for request logging middleware. |
| **Docker base image** | `node:24-alpine` | Alpine 3.x | Minimal image size. Alpine + Node.js LTS keeps the image well under 50MB. Multi-stage build: build stage compiles TypeScript, production stage copies only compiled JS + node_modules. |
| **Testing** | Vitest | v4.1.0 | Fast, TypeScript-native, no extra config. Hono's `app.request()` enables integration tests without HTTP server. |
| **Environment config** | `process.env` with validation at startup | N/A | Validate required env vars at application start, fail fast with clear error messages. No `.env` file library needed — Docker and docker-compose handle env injection. |
| **Health check** | `GET /api/health` returns `{ status: "ok", timestamp: "..." }` | N/A | Simple endpoint, excluded from auth middleware. Docker HEALTHCHECK instruction calls this endpoint. |

### Decision Impact Analysis

**Implementation Sequence:**
1. Project init (npm, TypeScript, Hono, better-sqlite3)
2. Database layer (schema, migrations, FTS5 setup)
3. Auth middleware (API key generation, hashing, Bearer check)
4. Error handling middleware (centralized, typed errors)
5. Bookmark CRUD routes
6. Tag listing route
7. Search integration (FTS5 queries)
8. Import endpoint (Netscape HTML parser)
9. Export endpoint
10. Docker configuration
11. Testing across all endpoints

**Cross-Component Dependencies:**
- Validation (Zod) is used by all route handlers — define schemas early
- Error handling middleware must be in place before routes
- FTS5 triggers depend on the bookmarks table schema — database layer is foundational
- Auth middleware wraps all routes except health — implement before individual endpoints
- Pino logger is injected early and used everywhere — configure at app initialization

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 12 areas where AI agents could make different choices without explicit guidance.

### Naming Patterns

**Database Naming Conventions:**
- Tables: `snake_case`, plural — `bookmarks`, `tags`, `bookmark_tags`, `migrations`, `settings`
- Columns: `snake_case` — `created_at`, `updated_at`, `bookmark_id`
- Primary keys: always `id` (integer, auto-increment)
- Foreign keys: `{referenced_table_singular}_id` — `bookmark_id`, `tag_id`
- Indexes: `idx_{table}_{column(s)}` — `idx_bookmarks_url`, `idx_bookmark_tags_bookmark_id`
- FTS table: `bookmarks_fts`

**API Naming Conventions:**
- Endpoints: plural nouns, lowercase — `/api/bookmarks`, `/api/tags`
- Route parameters: `:id` (Hono convention) — `/api/bookmarks/:id`
- Query parameters: `snake_case` — `created_at`, but single-word params are fine as-is: `q`, `tags`, `limit`, `offset`, `sort`
- No custom headers in MVP

**Code Naming Conventions:**
- Files: `kebab-case.ts` — `bookmark-routes.ts`, `auth-middleware.ts`, `import-service.ts`
- Functions: `camelCase` — `createBookmark`, `findByTags`, `parseNetscapeHtml`
- Variables: `camelCase` — `bookmarkId`, `tagCount`, `searchQuery`
- Constants: `UPPER_SNAKE_CASE` — `MAX_PAGE_SIZE`, `DEFAULT_PORT`
- Types/Interfaces: `PascalCase` — `Bookmark`, `CreateBookmarkInput`, `ApiError`
- Zod schemas: `camelCase` with `Schema` suffix — `createBookmarkSchema`, `updateBookmarkSchema`

### Structure Patterns

**Project Organization:**
- Tests: co-located in `test/` directory mirroring `src/` structure — `test/routes/bookmark-routes.test.ts`
- Routes: grouped by resource in `src/routes/` — one file per resource
- Middleware: all in `src/middleware/` — one file per concern
- Database: all in `src/db/` — schema, migrations, repository functions
- Services: business logic in `src/services/` — import, export, search
- Schemas: validation schemas in `src/schemas/` — one file per resource

**File Structure Patterns:**
- One export per file where possible (route group, middleware, service)
- Index files (`index.ts`) only at `src/` root for app entry — no barrel exports elsewhere
- Config in `src/config.ts` — single source for env var reading and validation
- Types that are shared across modules in `src/types.ts`

### Format Patterns

**API Response Formats:**

List responses (paginated):
```json
{
  "data": [{ "id": 1, "url": "...", ... }],
  "total": 42
}
```

Single resource responses:
```json
{ "id": 1, "url": "...", "title": "...", "tags": ["rust", "async"], "created_at": "2026-03-20T12:00:00.000Z", "updated_at": "2026-03-20T12:00:00.000Z" }
```

Error responses:
```json
{
  "error": {
    "code": "invalid_request",
    "message": "URL is required"
  }
}
```

Import response:
```json
{
  "imported": 437,
  "failed": 3,
  "errors": ["Line 42: invalid URL"]
}
```

**Data Exchange Formats:**
- JSON field naming: `snake_case` — `created_at`, `updated_at`, `bookmark_id` (matches database columns, avoids transformation layer)
- Dates: ISO 8601 strings with timezone — `2026-03-20T12:00:00.000Z`
- Booleans: `true`/`false` (JSON native)
- Null fields: included in response with `null` value (not omitted)
- Tags: always an array, even if empty — `"tags": []`
- IDs: integers (not UUIDs) — matches SQLite auto-increment

### Communication Patterns

**Event System Patterns:**
Not applicable for MVP — no event bus, no webhooks, no pub/sub. All operations are synchronous request-response.

**State Management Patterns:**
Not applicable — stateless REST API. No client-side state, no server-side sessions.

### Process Patterns

**Error Handling Patterns:**

1. Route handlers throw `HTTPException` with status code and error body:
```typescript
throw new HTTPException(404, {
  message: JSON.stringify({ error: { code: 'not_found', message: 'Bookmark not found' } })
});
```

2. Centralized `onError` handler catches all exceptions:
   - `HTTPException` → extract status and body, return as JSON
   - `ZodError` → map to 422 with `validation_error` code and per-field messages
   - Unknown errors → 500 with `internal_error` code, log full error with Pino

3. Database errors: catch at the repository layer, re-throw as application-level errors with appropriate codes (`duplicate_url` for UNIQUE constraint violations on URL)

4. Never expose internal error details (stack traces, SQL) in API responses

**Logging Patterns:**
- Log level: `info` in production, `debug` in development (via `LOG_LEVEL` env var)
- Request logging: method, path, status code, response time — via `pino-http`
- Error logging: full error object at `error` level
- Business events: `info` level — bookmark created, import completed, key regenerated
- Format: structured JSON to stdout (Pino default)

**Validation Patterns:**
- Validate at the route handler level using Zod + `@hono/zod-validator`
- Validation happens before any business logic or database access
- Zod schemas are the single source of truth for request shape and TypeScript types
- Use `z.infer<typeof schema>` for type extraction — no separate interface definitions for request bodies

### Enforcement Guidelines

**All AI Agents MUST:**

1. Use the naming conventions defined above — no exceptions for "personal preference"
2. Return error responses in the exact `{ error: { code, message } }` format
3. Use Zod schemas for all request validation — never manual `if` checks on request body fields
4. Use parameterized queries for all database operations — never string interpolation in SQL
5. Log via the Pino logger instance — never `console.log`
6. Place new files in the directory matching the pattern above — never create new top-level directories without architectural discussion

**Pattern Verification:**
- Vitest tests verify API response formats match the defined patterns
- TypeScript strict mode catches naming inconsistencies at compile time
- Code review checklist includes pattern compliance check

### Pattern Examples

**Good Examples:**
```typescript
// Route handler — correct pattern
app.post('/api/bookmarks', zValidator('json', createBookmarkSchema), async (c) => {
  const input = c.req.valid('json');
  const bookmark = bookmarkRepo.create(input);
  return c.json(bookmark, 201);
});

// Database query — correct pattern
const stmt = db.prepare('SELECT * FROM bookmarks WHERE id = ?');
const bookmark = stmt.get(id);

// Error — correct pattern
throw new HTTPException(404, {
  message: JSON.stringify({ error: { code: 'not_found', message: `Bookmark ${id} not found` } })
});
```

**Anti-Patterns:**
```typescript
// WRONG: camelCase in database columns
db.prepare('SELECT createdAt FROM bookmarks');  // Use created_at

// WRONG: manual validation
if (!body.url) return c.json({ message: 'URL required' }, 400);  // Use Zod

// WRONG: string interpolation in SQL
db.prepare(`SELECT * FROM bookmarks WHERE id = ${id}`);  // Use parameterized queries

// WRONG: console.log
console.log('Bookmark created');  // Use logger.info({ bookmarkId }, 'Bookmark created')

// WRONG: inconsistent error format
return c.json({ message: 'Not found' }, 404);  // Use { error: { code, message } }
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
personal-bookmarks-api/
├── .gitignore
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                    # App entry point — creates Hono app, registers middleware, starts server
│   ├── app.ts                      # Hono app factory — exported for testing without starting server
│   ├── config.ts                   # Environment variable reading and validation
│   ├── types.ts                    # Shared TypeScript types (Bookmark, Tag, ApiError, etc.)
│   ├── routes/
│   │   ├── bookmark-routes.ts      # CRUD: POST/GET/GET:id/PUT/DELETE /api/bookmarks
│   │   ├── tag-routes.ts           # GET /api/tags
│   │   ├── import-routes.ts        # POST /api/import
│   │   ├── export-routes.ts        # GET /api/export
│   │   ├── auth-routes.ts          # POST /api/auth/regenerate
│   │   └── health-routes.ts        # GET /api/health
│   ├── middleware/
│   │   ├── auth-middleware.ts       # Bearer token validation
│   │   ├── error-middleware.ts      # Centralized error handler (onError)
│   │   └── logger-middleware.ts     # Pino HTTP request logging
│   ├── schemas/
│   │   ├── bookmark-schemas.ts     # Zod schemas: createBookmarkSchema, updateBookmarkSchema, querySchema
│   │   └── common-schemas.ts       # Shared schemas: paginationSchema, idParamSchema
│   ├── db/
│   │   ├── database.ts             # SQLite connection, WAL mode, FTS5 setup, migration runner
│   │   ├── migrations/
│   │   │   ├── 001-initial-schema.sql    # bookmarks, tags, bookmark_tags tables
│   │   │   └── 002-fts5-setup.sql        # FTS5 virtual table and sync triggers
│   │   └── repositories/
│   │       ├── bookmark-repository.ts    # CRUD operations, search, tag filtering
│   │       ├── tag-repository.ts         # Tag listing with counts, cleanup
│   │       └── settings-repository.ts    # API key storage and retrieval
│   └── services/
│       ├── import-service.ts        # Netscape HTML parsing, folder-to-tag mapping
│       └── export-service.ts        # JSON export assembly
├── test/
│   ├── setup.ts                     # Test database setup, fixtures, helpers
│   ├── routes/
│   │   ├── bookmark-routes.test.ts
│   │   ├── tag-routes.test.ts
│   │   ├── import-routes.test.ts
│   │   ├── export-routes.test.ts
│   │   ├── auth-routes.test.ts
│   │   └── health-routes.test.ts
│   ├── db/
│   │   └── bookmark-repository.test.ts
│   └── services/
│       └── import-service.test.ts
└── data/                            # SQLite database files (volume mount target, gitignored)
    └── .gitkeep
```

### Architectural Boundaries

**API Boundary (HTTP Layer → Business Logic):**
- Route handlers receive validated input (Zod) and delegate to repositories/services
- Route handlers do NOT contain business logic or direct SQL
- Route handlers format responses and set HTTP status codes
- All routes are registered in `app.ts` with appropriate middleware

**Repository Boundary (Business Logic → Data):**
- Repositories are the ONLY code that touches SQLite
- Repositories accept plain TypeScript objects, return plain TypeScript objects
- Repositories handle SQL query construction, parameterization, and result mapping
- No Hono-specific types (Context, Request) flow into repositories

**Service Boundary (Complex Operations):**
- Services coordinate multi-step operations (import: parse HTML → validate → bulk insert)
- Services use repositories for data access — never direct SQL
- Services are stateless — no instance state between calls

**Middleware Boundary:**
- Auth middleware runs before route handlers (except health check)
- Error middleware runs after route handlers (catches thrown errors)
- Logger middleware wraps all requests
- Middleware does NOT call repositories or services directly

### Requirements to Structure Mapping

**FR Category → Directory Mapping:**

| FR Category | Primary Location | Supporting Files |
|---|---|---|
| Bookmark Management (FR1-6) | `src/routes/bookmark-routes.ts` | `src/db/repositories/bookmark-repository.ts`, `src/schemas/bookmark-schemas.ts` |
| Search & Discovery (FR7-10) | `src/routes/bookmark-routes.ts` (query params) | `src/db/repositories/bookmark-repository.ts` (FTS5 queries), `src/db/migrations/002-fts5-setup.sql` |
| Tag Organization (FR11-14) | `src/routes/tag-routes.ts` | `src/db/repositories/tag-repository.ts` |
| Authentication (FR15-18) | `src/middleware/auth-middleware.ts`, `src/routes/auth-routes.ts` | `src/db/repositories/settings-repository.ts` |
| Data Import (FR19-21) | `src/routes/import-routes.ts` | `src/services/import-service.ts` |
| Data Export (FR22-23) | `src/routes/export-routes.ts` | `src/services/export-service.ts` |
| Deployment & Ops (FR24-27) | `Dockerfile`, `docker-compose.yml` | `src/routes/health-routes.ts`, `src/config.ts` |
| Error Handling (FR28-31) | `src/middleware/error-middleware.ts` | `src/schemas/*.ts` (validation errors) |
| Configuration (FR32-33) | `src/config.ts` | `.env.example` |

**Cross-Cutting Concerns → Location:**

| Concern | Location |
|---|---|
| Authentication | `src/middleware/auth-middleware.ts` |
| Error formatting | `src/middleware/error-middleware.ts` |
| Input validation | `src/schemas/*.ts` + `@hono/zod-validator` in routes |
| Logging | `src/middleware/logger-middleware.ts` |
| CORS | Configured in `src/app.ts` via `hono/cors` |
| Database connection | `src/db/database.ts` (singleton) |

### Integration Points

**Internal Communication:**
- Route → Repository: direct function calls (synchronous for better-sqlite3)
- Route → Service → Repository: function call chain for complex operations (import/export)
- Middleware → Route: Hono middleware chain (sequential, before/after pattern)

**External Integrations:**
- None in MVP. The API is the external interface — consumers call in, the API never calls out.

**Data Flow:**
```
HTTP Request → Logger MW → Auth MW → Route Handler → Zod Validation → Repository/Service → SQLite → Response
                                                                                                      ↓
HTTP Response ← Error MW (if error) ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← JSON Response
```

### Development Workflow Integration

**Development:**
```bash
npm run dev          # tsx watch src/index.ts
npm run test         # vitest
npm run test:watch   # vitest --watch
npm run build        # tsc
npm run start        # node dist/index.js
```

**Docker Build (Multi-stage):**
- Stage 1 (`build`): `node:24-alpine`, install deps, compile TypeScript
- Stage 2 (`production`): `node:24-alpine`, copy compiled JS + production node_modules, set `NODE_ENV=production`
- `HEALTHCHECK`: `curl -f http://localhost:3000/api/health || exit 1`
- Volume mount: `/data` for SQLite database persistence

**Environment Variables:**
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `./data` | SQLite database directory |
| `CORS_ORIGINS` | (empty) | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Runtime environment |

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**
All technology choices are compatible and well-tested together:
- Hono v4.12.8 + `@hono/node-server` runs on Node.js 24 LTS without issues
- better-sqlite3 v12.8.0 is the most mature SQLite binding for Node.js, fully compatible with Node.js 24
- Zod v4.3.6 + `@hono/zod-validator` provides seamless integration for request validation
- Vitest v4.1.0 works with TypeScript and Hono's `app.request()` test helper
- Pino v10.3.1 is the standard structured logger for Node.js APIs
- No version conflicts or incompatibilities detected

**Pattern Consistency:**
- Naming conventions are consistent: `snake_case` for database and JSON, `camelCase` for TypeScript code, `kebab-case` for files
- Error handling pattern (centralized `onError` + `HTTPException`) aligns with Hono's built-in patterns
- Validation pattern (Zod + `@hono/zod-validator`) is the officially recommended approach for Hono
- Repository pattern cleanly separates SQL from route handlers

**Structure Alignment:**
- Project structure directly mirrors the architectural boundaries (routes → middleware → repositories → database)
- Each FR category maps to specific files with no ambiguity
- Test structure mirrors source structure for easy navigation

### Requirements Coverage Validation

**Functional Requirements Coverage:**

| FR Range | Category | Architectural Support | Status |
|---|---|---|---|
| FR1-6 | Bookmark CRUD | `bookmark-routes.ts` + `bookmark-repository.ts` | Covered |
| FR7-10 | Search & Discovery | FTS5 virtual table + `bookmark-repository.ts` search methods | Covered |
| FR11-14 | Tag Organization | `tag-routes.ts` + `tag-repository.ts` + junction table | Covered |
| FR15-18 | Authentication | `auth-middleware.ts` + `settings-repository.ts` + `auth-routes.ts` | Covered |
| FR19-21 | Data Import | `import-routes.ts` + `import-service.ts` | Covered |
| FR22-23 | Data Export | `export-routes.ts` + `export-service.ts` | Covered |
| FR24-27 | Deployment & Ops | `Dockerfile` + `health-routes.ts` + volume mount | Covered |
| FR28-31 | Error Handling | `error-middleware.ts` + Zod validation + `HTTPException` | Covered |
| FR32-33 | Configuration | `config.ts` + environment variables | Covered |

**All 33 FRs are architecturally supported.** Zero gaps.

**Non-Functional Requirements Coverage:**

| NFR Range | Category | Architectural Support | Status |
|---|---|---|---|
| NFR1-5 | Performance | SQLite (fast reads), better-sqlite3 (synchronous, no async overhead), no caching needed | Covered |
| NFR6-10 | Security | SHA-256 hashed API key, parameterized queries via better-sqlite3, Zod input validation, 1MB body limit | Covered |
| NFR11-14 | Reliability | WAL mode in `database.ts`, volume mount in Dockerfile, transactional imports | Covered |
| NFR15-18 | Deployment | Alpine multi-stage Docker build (<50MB), env var config, Pino JSON logging to stdout | Covered |

**All 18 NFRs are architecturally supported.** Zero gaps.

### Implementation Readiness Validation

**Decision Completeness:**
- All critical technology choices documented with verified current versions
- Implementation patterns include concrete code examples (good and anti-patterns)
- Consistency rules are specific and enforceable

**Structure Completeness:**
- Complete file tree with every expected file named and described
- Clear purpose annotation for each file
- Test files mapped 1:1 to source files

**Pattern Completeness:**
- Naming conventions cover database, API, code, and files
- Error handling pattern includes examples for all error types (validation, not-found, duplicate, internal)
- Logging pattern specifies levels, format, and usage

### Gap Analysis Results

**Critical Gaps:** 0

**Important Gaps:** 1
- **HTML parser library not specified:** The import service needs to parse Netscape HTML bookmark format. A specific library should be chosen during implementation (e.g., `cheerio`, `node-html-parser`, or `htmlparser2`). This is an implementation detail rather than an architectural decision — any spec-compliant HTML parser will work.

**Nice-to-Have Gaps:** 2
- **No linting/formatting configuration specified:** ESLint + Prettier configuration would enforce code consistency. Can be added during project initialization.
- **No CI/CD pipeline defined:** GitHub Actions workflow for test/build/lint would be valuable. Deferred — the project runs locally first.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Low)
- [x] Technical constraints identified (SQLite, Docker, single-user)
- [x] Cross-cutting concerns mapped (auth, errors, validation, logging, CORS)

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (Hono + Node.js 24 + SQLite + TypeScript)
- [x] Integration patterns defined (route → repository → database)
- [x] Performance considerations addressed (FTS5, sync API, no caching needed)

**Implementation Patterns**

- [x] Naming conventions established (database, API, code, files)
- [x] Structure patterns defined (routes, middleware, repositories, services, schemas)
- [x] Communication patterns specified (synchronous request-response, no events)
- [x] Process patterns documented (error handling, validation, logging)

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established (API → Service → Repository → DB)
- [x] Integration points mapped (middleware chain, data flow diagram)
- [x] Requirements to structure mapping complete (all 33 FRs mapped)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — low-complexity project with mature, well-understood technology choices and clear boundaries.

**Key Strengths:**
- Technology stack is intentionally boring — no novel combinations that could surprise
- Clear separation of concerns with explicit boundaries
- Every FR maps to a specific file — no ambiguity for implementing agents
- Synchronous SQLite API eliminates async complexity
- Comprehensive error handling pattern prevents inconsistent responses

**Areas for Future Enhancement:**
- PostgreSQL migration path (Phase 4) — would require abstracting the repository layer
- OpenAPI spec generation — consider `@hono/zod-openapi` when adding API docs post-MVP
- Rate limiting — simple middleware when/if needed
- Webhook support — would add an event emission layer after repository operations

### Implementation Handoff

**AI Agent Guidelines:**

1. Follow all architectural decisions exactly as documented
2. Use implementation patterns consistently across all components
3. Respect project structure and boundaries — don't create files outside the defined structure
4. Use the naming conventions without exception
5. Refer to this document for all architectural questions before making independent decisions

**First Implementation Priority:**
1. Run the project initialization commands from the Starter Template section
2. Set up TypeScript configuration (`tsconfig.json`)
3. Create the database layer (`src/db/database.ts` + migrations)
4. Implement auth middleware and API key generation
5. Build bookmark CRUD routes (the core value)
