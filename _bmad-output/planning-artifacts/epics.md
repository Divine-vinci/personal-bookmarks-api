---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
status: complete
inputDocuments: ["prd-personal-bookmarks-api.md", "prd-personal-bookmarks-api-validation.md", "architecture.md", "ux-design-specification.md"]
---

# personal-bookmarks-api - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for personal-bookmarks-api, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can create a bookmark by providing a URL, title, optional description, and optional tags
FR2: User can retrieve a single bookmark by its unique identifier
FR3: User can retrieve a paginated list of all bookmarks
FR4: User can update all fields of an existing bookmark (full replace)
FR5: User can delete a bookmark by its unique identifier
FR6: User can sort bookmark listings by creation date, update date, or title
FR7: User can perform full-text search across bookmark titles, URLs, descriptions, and tags
FR8: User can filter bookmarks by one or more tags (AND semantics — all specified tags must be present)
FR9: User can combine full-text search with tag filtering in a single query
FR10: Search results are ranked by relevance to the query
FR11: User can assign one or more tags to a bookmark at creation or update time
FR12: User can retrieve a list of all tags with the count of bookmarks per tag
FR13: Tags are automatically created when first assigned to a bookmark (no separate tag creation step)
FR14: Tags with zero bookmarks are automatically cleaned up or excluded from tag listings
FR15: System generates an API key automatically on first run
FR16: All API endpoints require a valid API key via Authorization header
FR17: User can regenerate their API key, invalidating the previous key
FR18: Unauthenticated requests receive a 401 error response with machine-readable error code and human-readable message
FR19: User can import bookmarks from a Netscape HTML bookmark file (Chrome/Firefox/Safari export format)
FR20: Import process maps bookmark folder hierarchy to tags
FR21: Import reports the number of bookmarks successfully imported and any failures
FR22: User can export all bookmarks as a JSON file
FR23: Export includes all bookmark fields (URL, title, description, tags, timestamps)
FR24: System runs as a single Docker container with SQLite embedded
FR25: System exposes a health check endpoint that confirms operational status
FR26: System persists all data to a mountable volume for survival across container restarts
FR27: System starts and serves requests within 5 seconds of container start
FR28: System returns JSON error responses matching the defined error schema with machine-readable error codes and human-readable messages
FR29: System validates bookmark URLs and rejects malformed URLs with a specific error
FR30: System validates request payloads and returns per-field validation error messages identifying which field failed and why
FR31: System returns appropriate HTTP status codes (400, 401, 404, 409, 422, 500) for all error conditions
FR32: System supports CORS configuration via environment variable for browser-based API consumers
FR33: System configures the listening port via environment variable

### NonFunctional Requirements

NFR1: All CRUD endpoints respond in < 200ms at p95 with up to 10,000 bookmarks stored
NFR2: Full-text search responds in < 200ms at p95 with up to 10,000 bookmarks
NFR3: Browser bookmark import of 1,000 bookmarks completes in < 30 seconds
NFR4: JSON export of 10,000 bookmarks completes in < 10 seconds
NFR5: Cold start (container start to first request served) completes in < 5 seconds
NFR6: API key is stored hashed in SQLite (never plaintext)
NFR7: API key is transmitted only via HTTPS in production (documentation recommends TLS termination via reverse proxy)
NFR8: Failed authentication attempts return generic error messages (no information leakage about key validity)
NFR9: SQL injection is prevented through parameterized queries for all database operations
NFR10: Input validation rejects payloads exceeding 1MB per request
NFR11: Zero data loss across container restarts when data volume is properly mounted
NFR12: SQLite database remains consistent after unexpected process termination (WAL mode)
NFR13: System availability target of 99.9% on a properly configured VPS (< 8.7 hours downtime/year)
NFR14: Import operation is atomic — partial failures do not corrupt existing bookmarks
NFR15: Docker image size < 50MB
NFR16: System runs with no external dependencies (no external database, cache, or message queue)
NFR17: All configuration via environment variables (12-factor app compliance)
NFR18: Structured JSON logging to stdout for container log aggregation

### Additional Requirements

**STARTER TEMPLATE (Epic 1 Story 1):** Architecture specifies Hono + Node.js from scratch — no starter template. Initialization commands:
- `npm init -y`
- `npm install hono @hono/node-server better-sqlite3`
- `npm install -D typescript @types/better-sqlite3 @types/node tsx vitest`
- `npx tsc --init`

**Technology Stack:**
- Runtime: Node.js 24 LTS with TypeScript (strict mode)
- HTTP Framework: Hono v4.12.8 with @hono/node-server
- Database: SQLite via better-sqlite3 v12.8.0 (synchronous API)
- FTS5: Content-sync virtual table with SQLite triggers for auto-sync
- Validation: Zod v4.3.6 with @hono/zod-validator
- Logging: Pino v10.3.1 with pino-http for request logging
- Testing: Vitest v4.1.0 with Hono's app.request() test helper
- Dev tooling: tsx for development with hot reload

**Database Architecture:**
- Schema migrations: Hand-written SQL files in src/db/migrations/, applied at startup
- Tables: bookmarks, tags, bookmark_tags (junction), migrations, settings
- FTS5 virtual table: bookmarks_fts with triggers for INSERT/UPDATE/DELETE sync
- WAL mode for crash consistency
- API key stored as SHA-256 hash in settings table

**Project Structure:**
- src/routes/ — route handlers grouped by resource
- src/middleware/ — auth, error handling, logger
- src/schemas/ — Zod validation schemas
- src/db/ — database layer, migrations, repositories
- src/services/ — import and export business logic
- test/ — tests mirroring src structure
- src/app.ts — Hono app factory (exported for testing)
- src/index.ts — entry point (starts server)
- src/config.ts — env var reading and validation
- src/types.ts — shared TypeScript types

**Docker Deployment:**
- Multi-stage build: node:24-alpine base
- Stage 1: build (compile TypeScript)
- Stage 2: production (compiled JS + production node_modules)
- HEALTHCHECK using /api/health endpoint
- Volume mount: /data for SQLite persistence

**API Patterns:**
- List responses: { data: [...], total: N }
- Single resource: direct object
- Errors: { error: { code, message } }
- Import response: { imported: N, failed: N, errors: [...] }
- JSON field naming: snake_case (matches DB columns)
- Dates: ISO 8601 with timezone
- IDs: integers (auto-increment)

**Naming Conventions:**
- Files: kebab-case.ts
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Types: PascalCase
- DB tables: snake_case plural
- DB columns: snake_case

**Environment Variables:**
- PORT (default: 3000)
- DATA_DIR (default: ./data)
- CORS_ORIGINS (default: empty)
- LOG_LEVEL (default: info)
- NODE_ENV (default: development)

**UX/Developer Experience Requirements:**
- All error responses must use consistent JSON schema
- Health check endpoint excluded from auth middleware
- Import endpoint accepts multipart/form-data with higher size limit (10MB)
- CORS configurable for browser-based consumers (bookmarklets, dashboards)
- Tags always returned as arrays (even if empty)
- Null fields included in response (not omitted)

**HTML Parser for Import:**
- Architecture notes HTML parser library not specified — to be chosen at implementation (cheerio, node-html-parser, or htmlparser2)
- Must handle Chrome, Firefox, Safari export formats
- Folder hierarchy maps to tags

### FR Coverage Map

FR1: Epic 2 - Create bookmark
FR2: Epic 2 - Get single bookmark
FR3: Epic 2 - List bookmarks with pagination
FR4: Epic 2 - Update bookmark (full replace)
FR5: Epic 2 - Delete bookmark
FR6: Epic 2 - Sort bookmark listings
FR7: Epic 3 - Full-text search
FR8: Epic 3 - Tag filtering (AND semantics)
FR9: Epic 3 - Combined search + tag filtering
FR10: Epic 3 - Relevance-ranked search results
FR11: Epic 2 - Assign tags at create/update time
FR12: Epic 3 - List all tags with counts
FR13: Epic 2 - Auto-create tags on assignment
FR14: Epic 3 - Auto-cleanup zero-count tags
FR15: Epic 1 - Auto-generate API key on first run
FR16: Epic 1 - API key required on all endpoints
FR17: Epic 1 - Regenerate API key
FR18: Epic 1 - 401 error for unauthenticated requests
FR19: Epic 4 - Import Netscape HTML bookmark file
FR20: Epic 4 - Map folder hierarchy to tags
FR21: Epic 4 - Import success/failure reporting
FR22: Epic 4 - Export bookmarks as JSON
FR23: Epic 4 - Export includes all fields
FR24: Epic 5 - Single Docker container deployment
FR25: Epic 1 - Health check endpoint
FR26: Epic 5 - Volume-mounted data persistence
FR27: Epic 5 - Sub-5-second cold start
FR28: Epic 1 - Consistent JSON error responses
FR29: Epic 1 - URL validation with specific errors
FR30: Epic 1 - Per-field validation error messages
FR31: Epic 1 - Appropriate HTTP status codes for all errors
FR32: Epic 1 - CORS configuration via env var
FR33: Epic 1 - Port configuration via env var

## Epic List

### Epic 1: Project Foundation & Authentication
After this epic, a developer can run the API locally, authenticate with an auto-generated API key, hit the health check endpoint, and receive well-structured error responses for any invalid request. The project is initialized with the full tech stack (Hono, TypeScript, SQLite, Pino), database migrations run on startup, and all cross-cutting middleware (auth, error handling, logging, CORS) is in place.
**FRs covered:** FR15, FR16, FR17, FR18, FR25, FR28, FR29, FR30, FR31, FR32, FR33
**NFRs addressed:** NFR5, NFR6, NFR8, NFR9, NFR10, NFR12, NFR16, NFR17, NFR18

### Epic 2: Bookmark Management
After this epic, a developer can create, read, update, delete, and list bookmarks via the REST API with full pagination and sorting. Bookmarks support tags assigned at creation/update time, with tags auto-created on first use. This delivers the core product value — programmatic bookmark CRUD.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR11, FR13
**NFRs addressed:** NFR1

### Epic 3: Search, Filtering & Tag Management
After this epic, a developer can perform full-text search across all bookmark fields, filter by tags (AND semantics), combine search with tag filters, and get relevance-ranked results. Tag listing with counts is available, and zero-count tags are cleaned up. This delivers the "aha moment" — finding bookmarks faster than browser search.
**FRs covered:** FR7, FR8, FR9, FR10, FR12, FR14
**NFRs addressed:** NFR2

### Epic 4: Data Import & Export
After this epic, a developer can import their existing browser bookmarks from Netscape HTML format (Chrome/Firefox/Safari) with folder-to-tag mapping, and export all bookmarks as JSON. This is the critical onboarding funnel and data freedom guarantee.
**FRs covered:** FR19, FR20, FR21, FR22, FR23
**NFRs addressed:** NFR3, NFR4, NFR14

### Epic 5: Production Deployment
After this epic, a developer can build and run the API as a single Docker container, with SQLite data persisted via volume mount, health check for container orchestration, and sub-5-second cold start. The image is under 50MB.
**FRs covered:** FR24, FR26, FR27
**NFRs addressed:** NFR5, NFR11, NFR13, NFR15

---

## Epic 1: Project Foundation & Authentication

After this epic, a developer can run the API locally, authenticate with an auto-generated API key, hit the health check endpoint, and receive well-structured error responses for any invalid request. The project is initialized with the full tech stack (Hono, TypeScript, SQLite, Pino), database migrations run on startup, and all cross-cutting middleware (auth, error handling, logging, CORS) is in place.

### Story 1.1: Initialize Project and Development Environment

As a developer,
I want to initialize the project with the complete tech stack and project structure,
So that I have a working development environment with all dependencies, TypeScript configuration, and the Hono server running locally.

**Acceptance Criteria:**

**Given** a fresh project directory
**When** the initialization commands are run (`npm init`, dependency installation, TypeScript config)
**Then** the project has the following structure: `src/` with `index.ts`, `app.ts`, `config.ts`, `types.ts`; `src/routes/`, `src/middleware/`, `src/schemas/`, `src/db/`, `src/services/`; `test/`; and `data/` directories
**And** `package.json` includes scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist/index.js), `test` (vitest)

**Given** the project is initialized
**When** `npm run dev` is executed
**Then** Hono server starts on the configured port (default 3000) using `@hono/node-server`
**And** structured JSON logs are output to stdout via Pino

**Given** the server is running
**When** the `PORT` environment variable is set to a custom value
**Then** the server listens on the specified port (FR33)

**Given** the server is running
**When** `CORS_ORIGINS` environment variable is set to a comma-separated list of origins
**Then** CORS headers are returned for requests from those origins (FR32)

**Given** environment variables are missing or invalid
**When** the server starts
**Then** it uses documented defaults (PORT=3000, DATA_DIR=./data, LOG_LEVEL=info)

### Story 1.2: Database Setup and Migration System

As a developer,
I want the SQLite database to initialize automatically with a migration system,
So that the database schema is created on first run and can evolve with future changes.

**Acceptance Criteria:**

**Given** the application starts for the first time
**When** the database file does not exist in DATA_DIR
**Then** a new SQLite database is created with WAL mode enabled (NFR12)
**And** a `migrations` table is created to track applied migrations

**Given** SQL migration files exist in `src/db/migrations/` (numbered sequentially: `001-*.sql`, `002-*.sql`)
**When** the application starts
**Then** all unapplied migrations are executed in order
**And** each successful migration is recorded in the `migrations` table

**Given** the initial migration `001-initial-schema.sql` runs
**When** it completes
**Then** the following tables exist: `bookmarks` (id, url, title, description, created_at, updated_at), `tags` (id, name), `bookmark_tags` (bookmark_id, tag_id), `settings` (key, value)
**And** a unique index exists on `bookmarks.url`
**And** a unique index exists on `tags.name`

**Given** a migration has already been applied
**When** the application restarts
**Then** the migration is not re-applied

**Given** all database operations
**When** queries are executed
**Then** parameterized queries are used (NFR9) — no string interpolation in SQL

### Story 1.3: API Key Authentication

As a developer,
I want the system to auto-generate an API key on first run and require it for all API requests,
So that my bookmark data is protected from unauthorized access.

**Acceptance Criteria:**

**Given** the application starts for the first time (no API key in settings)
**When** the database is initialized
**Then** a 64-character hex API key is generated using `crypto.randomBytes(32)`
**And** the key is displayed once in the server logs at startup
**And** only the SHA-256 hash of the key is stored in the `settings` table (NFR6)

**Given** a valid API key exists
**When** a request includes `Authorization: Bearer <valid-key>` header
**Then** the request is authenticated and proceeds to the route handler (FR16)

**Given** a request is made without an Authorization header
**When** the auth middleware processes it
**Then** a 401 response is returned with body `{ "error": { "code": "unauthorized", "message": "..." } }` (FR18)
**And** the error message does not reveal whether the key format was wrong or the key was invalid (NFR8)

**Given** a request is made with an invalid API key
**When** the auth middleware processes it
**Then** a 401 response is returned with the same generic error format (NFR8)

**Given** a user sends a POST request to `/api/auth/regenerate` with a valid API key
**When** the request is processed
**Then** a new API key is generated, the old key is invalidated, the new key hash replaces the old one in settings
**And** the new key is returned in the response body (FR17)

**Given** the health check endpoint `/api/health`
**When** a request is made without an API key
**Then** the request succeeds (health check is excluded from auth middleware)

### Story 1.4: Health Check Endpoint

As a developer,
I want a health check endpoint that confirms the API is operational,
So that I can monitor uptime and use it for container orchestration.

**Acceptance Criteria:**

**Given** the API server is running
**When** a GET request is made to `/api/health`
**Then** a 200 response is returned with body `{ "status": "ok", "timestamp": "<ISO 8601 datetime>" }` (FR25)

**Given** the health check endpoint
**When** a request is made without authentication
**Then** the response is still 200 (health check bypasses auth middleware)

**Given** the server has just started
**When** the health check is called within 5 seconds of startup
**Then** it returns 200 (NFR5)

### Story 1.5: Error Handling and Input Validation Framework

As a developer,
I want consistent, well-structured error responses for all error conditions,
So that API consumers can programmatically handle errors and debug issues quickly.

**Acceptance Criteria:**

**Given** any error occurs in the API
**When** the centralized error handler processes it
**Then** the response body matches the format `{ "error": { "code": "<machine-readable>", "message": "<human-readable>" } }` (FR28)

**Given** a request with malformed JSON body
**When** the server processes it
**Then** a 400 response with code `invalid_request` is returned (FR31)

**Given** a request with a body exceeding 1MB
**When** the server processes it
**Then** a 400 response with code `invalid_request` is returned (NFR10)

**Given** a Zod validation error occurs (e.g., missing required field, field too long)
**When** the error handler processes it
**Then** a 422 response with code `validation_error` is returned with per-field error details (FR30)

**Given** a request with an invalid URL value in the url field
**When** validation runs
**Then** a 400 response with code `invalid_url` is returned (FR29)

**Given** a request for a resource that does not exist (e.g., bookmark ID)
**When** the route handler throws a not-found error
**Then** a 404 response with code `not_found` is returned (FR31)

**Given** an unexpected server error occurs
**When** the error handler processes it
**Then** a 500 response with code `internal_error` is returned
**And** no internal details (stack traces, SQL errors) are exposed in the response
**And** the full error is logged at error level via Pino (NFR18)

**Given** Zod schemas are defined for bookmark creation and update
**When** they are used
**Then** url is required and validated as a valid URL (max 2000 chars), title is required (max 500 chars), description is optional (max 2000 chars), tags is an optional array of strings

---

## Epic 2: Bookmark Management

After this epic, a developer can create, read, update, delete, and list bookmarks via the REST API with full pagination and sorting. Bookmarks support tags assigned at creation/update time, with tags auto-created on first use. This delivers the core product value — programmatic bookmark CRUD.

### Story 2.1: Create Bookmark

As a developer,
I want to create a bookmark via the API with URL, title, description, and tags,
So that I can programmatically save and organize links.

**Acceptance Criteria:**

**Given** an authenticated request with a valid JSON body containing url (required), title (required), description (optional), tags (optional array)
**When** POST `/api/bookmarks` is called
**Then** a new bookmark is created in the database with auto-generated id, created_at, and updated_at timestamps
**And** a 201 response is returned with the complete bookmark object including all fields (FR1)

**Given** a bookmark is created with tags (e.g., `["rust", "async"]`)
**When** the tags do not already exist in the tags table
**Then** the tags are automatically created (FR13)
**And** entries are added to the bookmark_tags junction table (FR11)

**Given** a bookmark is created with tags
**When** some tags already exist from previous bookmarks
**Then** existing tags are reused (not duplicated) and new tags are created as needed

**Given** a bookmark is created with an empty tags array or no tags field
**When** the response is returned
**Then** the tags field is an empty array `[]` (not null, not omitted)

**Given** tags are provided with mixed case or whitespace (e.g., `[" Rust ", "ASYNC"]`)
**When** the bookmark is created
**Then** tags are stored as lowercase-trimmed values (`["rust", "async"]`)

**Given** a bookmark is created with a URL that already exists in the database
**When** the request is processed
**Then** a 409 response with code `duplicate_url` is returned (FR31)

**Given** a request body with missing required fields (no url or no title)
**When** validation runs
**Then** a 422 response with specific per-field errors is returned (FR30)

### Story 2.2: Get and List Bookmarks

As a developer,
I want to retrieve a single bookmark by ID or a paginated list of all bookmarks,
So that I can access my saved links programmatically.

**Acceptance Criteria:**

**Given** a bookmark exists with a known ID
**When** GET `/api/bookmarks/:id` is called with that ID
**Then** a 200 response is returned with the complete bookmark object including tags array (FR2)

**Given** a bookmark ID that does not exist
**When** GET `/api/bookmarks/:id` is called
**Then** a 404 response with code `not_found` is returned

**Given** bookmarks exist in the database
**When** GET `/api/bookmarks` is called with no query parameters
**Then** a 200 response is returned with `{ "data": [...], "total": N }` format (FR3)
**And** results are paginated with default limit of 20, offset 0
**And** results are sorted by `created_at` descending (newest first) by default

**Given** the `limit` query parameter is provided (e.g., `?limit=5`)
**When** the request is processed
**Then** at most 5 results are returned
**And** `limit` values above 100 are capped at 100

**Given** the `offset` query parameter is provided (e.g., `?offset=20`)
**When** the request is processed
**Then** results skip the first 20 bookmarks

**Given** the `sort` query parameter is provided
**When** `sort=title` is specified
**Then** results are sorted alphabetically by title (ascending)
**And** valid sort values are: `created_at`, `updated_at`, `title` (FR6)

**Given** an invalid sort parameter value
**When** validation runs
**Then** a 422 validation error is returned

### Story 2.3: Update Bookmark

As a developer,
I want to update all fields of an existing bookmark (full replace),
So that I can correct or modify saved bookmarks.

**Acceptance Criteria:**

**Given** a bookmark exists with a known ID
**When** PUT `/api/bookmarks/:id` is called with a valid JSON body (url, title, description, tags)
**Then** all bookmark fields are replaced with the new values (FR4)
**And** the `updated_at` timestamp is set to the current time
**And** the `created_at` timestamp is not modified
**And** a 200 response is returned with the updated bookmark object

**Given** a bookmark is updated with new tags
**When** the previous tags are `["rust", "async"]` and the new tags are `["rust", "tokio"]`
**Then** the `async` tag association is removed, the `tokio` tag is created if needed, and the new associations are set (FR11)

**Given** a bookmark is updated with an empty tags array
**When** the update is processed
**Then** all tag associations are removed from the bookmark

**Given** a bookmark is updated with a URL that belongs to a different existing bookmark
**When** the update is processed
**Then** a 409 response with code `duplicate_url` is returned

**Given** a bookmark ID that does not exist
**When** PUT `/api/bookmarks/:id` is called
**Then** a 404 response with code `not_found` is returned

### Story 2.4: Delete Bookmark

As a developer,
I want to delete a bookmark by its ID,
So that I can remove links I no longer need.

**Acceptance Criteria:**

**Given** a bookmark exists with a known ID
**When** DELETE `/api/bookmarks/:id` is called
**Then** the bookmark is removed from the database (FR5)
**And** all tag associations for that bookmark are removed from bookmark_tags
**And** a 204 No Content response is returned

**Given** a bookmark ID that does not exist
**When** DELETE `/api/bookmarks/:id` is called
**Then** a 404 response with code `not_found` is returned

**Given** a bookmark is deleted and it was the only bookmark with a specific tag
**When** the deletion is complete
**Then** the orphaned tag remains in the tags table (cleanup is handled in Epic 3, FR14)

---

## Epic 3: Search, Filtering & Tag Management

After this epic, a developer can perform full-text search across all bookmark fields, filter by tags (AND semantics), combine search with tag filters, and get relevance-ranked results. Tag listing with counts is available, and zero-count tags are cleaned up. This delivers the "aha moment" — finding bookmarks faster than browser search.

### Story 3.1: Full-Text Search with FTS5

As a developer,
I want to search my bookmarks using natural language queries across all text fields,
So that I can find saved links quickly without remembering exact titles or URLs.

**Acceptance Criteria:**

**Given** the FTS5 migration `002-fts5-setup.sql` is applied
**When** it completes
**Then** a `bookmarks_fts` virtual table exists (content-sync with bookmarks table) indexing title, url, description
**And** SQLite triggers exist to keep bookmarks_fts in sync on INSERT, UPDATE, and DELETE of bookmarks

**Given** bookmarks exist in the database
**When** GET `/api/bookmarks?q=tokio+cancel` is called
**Then** full-text search is performed across title, url, description, and tags (FR7)
**And** results are ranked by FTS5 `bm25()` relevance score (FR10)
**And** results are returned in `{ "data": [...], "total": N }` format with pagination

**Given** a search query is provided
**When** no bookmarks match the query
**Then** a 200 response with `{ "data": [], "total": 0 }` is returned

**Given** a search query is combined with pagination parameters
**When** GET `/api/bookmarks?q=rust&limit=5&offset=10` is called
**Then** search results respect the pagination parameters

**Given** a new bookmark is created after FTS5 is set up
**When** the bookmark is saved to the database
**Then** the FTS5 index is automatically updated via the INSERT trigger

**Given** an existing bookmark is updated
**When** the title or description changes
**Then** the FTS5 index is automatically updated via the UPDATE trigger

### Story 3.2: Tag Filtering

As a developer,
I want to filter bookmarks by one or more tags,
So that I can browse my bookmarks by topic or category.

**Acceptance Criteria:**

**Given** bookmarks exist with various tags
**When** GET `/api/bookmarks?tags=rust` is called
**Then** only bookmarks tagged with `rust` are returned (FR8)

**Given** multiple tags are specified
**When** GET `/api/bookmarks?tags=rust,async` is called
**Then** only bookmarks that have BOTH `rust` AND `async` tags are returned (AND semantics) (FR8)

**Given** tag filtering is combined with full-text search
**When** GET `/api/bookmarks?q=performance&tags=rust` is called
**Then** only bookmarks matching the search query AND having the `rust` tag are returned (FR9)

**Given** tag filtering is combined with pagination and sorting
**When** GET `/api/bookmarks?tags=rust&limit=10&offset=0&sort=title` is called
**Then** results are filtered, sorted, and paginated correctly

**Given** a tag name that does not exist
**When** GET `/api/bookmarks?tags=nonexistent` is called
**Then** a 200 response with `{ "data": [], "total": 0 }` is returned

### Story 3.3: Tag Listing and Cleanup

As a developer,
I want to retrieve a list of all tags with bookmark counts and have orphaned tags cleaned up,
So that I can see my tag taxonomy and keep it organized.

**Acceptance Criteria:**

**Given** bookmarks exist with various tags
**When** GET `/api/tags` is called
**Then** a 200 response is returned with an array of tag objects: `[{ "name": "rust", "count": 5 }, ...]` (FR12)
**And** the count reflects the actual number of bookmarks with that tag

**Given** no bookmarks have been created
**When** GET `/api/tags` is called
**Then** a 200 response with an empty array `[]` is returned

**Given** a tag exists that was previously assigned to bookmarks
**When** all bookmarks with that tag are deleted or updated to remove the tag
**Then** the tag is excluded from the GET `/api/tags` response (FR14)
**And** the zero-count tag is either cleaned up from the database or filtered out from results

**Given** tags are returned
**When** the response is generated
**Then** tags are sorted alphabetically by name

---

## Epic 4: Data Import & Export

After this epic, a developer can import their existing browser bookmarks from Netscape HTML format (Chrome/Firefox/Safari) with folder-to-tag mapping, and export all bookmarks as JSON. This is the critical onboarding funnel and data freedom guarantee.

### Story 4.1: Import Netscape HTML Bookmarks

As a developer,
I want to import my browser bookmarks from an HTML export file,
So that I can migrate my existing bookmarks into the API without manual entry.

**Acceptance Criteria:**

**Given** an authenticated request with a Netscape HTML bookmark file
**When** POST `/api/import` is called with `multipart/form-data` containing the file (FR19)
**Then** the file is parsed and bookmarks are extracted with URL, title, and folder hierarchy

**Given** the HTML file contains bookmark folders (e.g., `Programming > Rust`)
**When** the import processes them
**Then** folder hierarchy is mapped to tags (e.g., tags: `["programming", "rust"]`) (FR20)

**Given** an import file with 1,000 bookmarks
**When** the import completes
**Then** a response is returned with `{ "imported": N, "failed": M, "errors": [...] }` (FR21)
**And** the import completes in under 30 seconds (NFR3)

**Given** some bookmarks in the file have invalid URLs or missing titles
**When** the import processes them
**Then** valid bookmarks are imported and invalid ones are reported in the errors array
**And** existing bookmarks in the database are not affected by any import failures (NFR14 — atomic operation)

**Given** the import file contains bookmarks with URLs that already exist in the database
**When** the import processes them
**Then** duplicate URLs are skipped and reported in the failed count

**Given** the import endpoint
**When** the request body size exceeds 10MB
**Then** a 400 error is returned (import has a higher size limit than standard endpoints)

**Given** a Chrome, Firefox, or Safari HTML bookmark export
**When** the file is imported
**Then** bookmarks are extracted correctly from each browser's export format

### Story 4.2: Export Bookmarks as JSON

As a developer,
I want to export all my bookmarks as a JSON file,
So that I can back up my data or migrate to another system.

**Acceptance Criteria:**

**Given** bookmarks exist in the database
**When** GET `/api/export` is called with a valid API key
**Then** a 200 response is returned with `Content-Type: application/json`
**And** the body contains an array of all bookmarks with all fields: id, url, title, description, tags, created_at, updated_at (FR22, FR23)

**Given** 10,000 bookmarks exist in the database
**When** the export is requested
**Then** the response completes in under 10 seconds (NFR4)

**Given** no bookmarks exist in the database
**When** GET `/api/export` is called
**Then** a 200 response with an empty array `[]` is returned

**Given** bookmarks with tags exist
**When** the export is generated
**Then** each bookmark includes its full tags array (not tag IDs)

---

## Epic 5: Production Deployment

After this epic, a developer can build and run the API as a single Docker container, with SQLite data persisted via volume mount, health check for container orchestration, and sub-5-second cold start. The image is under 50MB.

### Story 5.1: Docker Containerization

As a developer,
I want to deploy the API as a single Docker container with persistent data storage,
So that I can run it reliably on any VPS with minimal operational overhead.

**Acceptance Criteria:**

**Given** a Dockerfile with multi-stage build
**When** the image is built
**Then** Stage 1 (build) uses `node:24-alpine` to compile TypeScript
**And** Stage 2 (production) copies only compiled JS and production `node_modules`
**And** the final image size is under 50MB (NFR15) (FR24)

**Given** a `docker-compose.yml` file
**When** `docker compose up` is run
**Then** the API container starts and is accessible on the configured port
**And** a volume is mounted to `/data` for SQLite database persistence (FR26)

**Given** the container is running with a mounted data volume
**When** the container is stopped and restarted
**Then** all bookmarks, tags, and settings persist with zero data loss (NFR11)

**Given** the Docker container starts
**When** the application initializes
**Then** the health check endpoint responds within 5 seconds of container start (FR27, NFR5)

**Given** the Dockerfile includes a HEALTHCHECK instruction
**When** Docker runs the health check
**Then** it calls `GET /api/health` and expects a 200 response

**Given** a `.env.example` file exists in the project root
**When** a developer reviews it
**Then** all environment variables (PORT, DATA_DIR, CORS_ORIGINS, LOG_LEVEL, NODE_ENV) are documented with their defaults

**Given** a `.gitignore` file exists
**When** reviewed
**Then** it excludes `node_modules/`, `dist/`, `data/`, `.env`, and other build artifacts

**Given** the Docker container is running
**When** no external services are required
**Then** the API functions fully with only SQLite embedded (NFR16)
