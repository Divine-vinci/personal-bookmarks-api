---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys", "step-05-domain-skipped", "step-06-innovation-skipped", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
inputDocuments: ["product-brief-personal-bookmarks-api-2026-03-20.md"]
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: api_backend
  domain: general
  complexity: low
  projectContext: greenfield
status: complete
workflowType: 'prd'
projectName: 'personal-bookmarks-api'
date: '2026-03-20'
author: 'User'
---

# Product Requirements Document - personal-bookmarks-api

**Author:** User
**Date:** 2026-03-20

## Executive Summary

personal-bookmarks-api is a self-hosted REST API that gives developers programmatic control over their saved bookmarks. Browser bookmarks are siloed, unsearchable across devices, and inaccessible to scripts, CLI tools, and automation workflows. This API eliminates that wall — treating bookmarks as structured, queryable data exposed through clean REST endpoints. It targets developers and power users who want to `curl` their bookmarks, pipe search results into scripts, and integrate saved links into personal dashboards and toolchains. Single-user by design, backed by SQLite, deployable as one Docker container.

### What Makes This Special

The API is the product — not a web application with an API bolted on as an afterthought. Every competitor (Linkding, Shaarli, Raindrop) ships a full web app where the API is secondary. personal-bookmarks-api inverts that: zero mandatory UI, maximum developer ergonomics, one API key for auth, and a footprint small enough to run on any VPS alongside other services. The core insight is that no one has built the obvious primitive — a clean REST endpoint for bookmark CRUD and full-text search — because everyone assumes bookmarks need a UI. They don't. Scripts, bots, browser extensions, and dashboards can all be built on top of this API independently.

## Project Classification

| Attribute | Value |
|---|---|
| **Project Type** | API / Backend Service |
| **Domain** | General (Developer Tooling / Personal Productivity) |
| **Complexity** | Low — single-user, no regulatory requirements, standard CRUD + search |
| **Project Context** | Greenfield — new project, no existing codebase |
| **Tech Signals** | REST API, SQLite FTS5, Docker, API key auth |

## Success Criteria

### User Success

- **Time to first bookmark via API:** < 5 minutes from `docker run` to successful `curl` creating a bookmark. This is the critical onboarding gate — if a developer can't get value in 5 minutes, they'll abandon it.
- **Search retrieval relevance:** Target bookmark appears in top 5 results for reasonable natural-language queries across 1,000+ bookmarks. FTS5 must actually work, not just exist.
- **Daily API integration:** User makes 5+ API calls/day after the first week — evidence that the API replaced browser bookmarks as the primary store.
- **Tag adoption:** 80%+ of bookmarks have at least one tag within 30 days — proves the tagging model adds value over flat URL lists.
- **Aha moment:** User successfully runs their first programmatic query (e.g., `curl ... | jq`) and retrieves a bookmark they couldn't find in their browser. This is the "I'm never going back" moment.

### Business Success

As an open-source personal tool, business success = project health and self-use validation:

- **Self-use validation:** Vinci uses the API daily as primary bookmark store within 2 weeks of deployment.
- **GitHub traction:** 100+ stars within 3 months of public release; 50+ Docker pulls in first month.
- **Community signal:** At least 1 external contributor opens a meaningful issue or PR within 6 months.
- **Integration proof:** At least 2 custom integrations built on top of the API (CLI tool, browser extension, dashboard, bot) within 3 months.

### Technical Success

- **API response time:** p95 < 200ms for all CRUD and search operations with 10K bookmarks.
- **Zero data loss:** No bookmark data lost across container restarts, upgrades, or SQLite migrations.
- **Import reliability:** 100% of valid Netscape HTML bookmark files import without errors or data corruption.
- **Container footprint:** Docker image < 50MB. Single process, no external dependencies.
- **Uptime:** 99.9% availability on personal VPS (< 8.7 hours downtime/year).

### Measurable Outcomes

| Outcome | Metric | Target | Timeframe |
|---|---|---|---|
| Onboarding friction | Time to first API call | < 5 min | At launch |
| Search quality | Target in top 5 results | 90%+ queries | At launch |
| Adoption signal | Daily API calls | 5+/day | Week 2+ |
| Collection growth | Bookmarks stored | Steady WoW increase | Month 1+ |
| Reliability | Data loss incidents | Zero | Ongoing |

## User Journeys

### Journey 1: Dev Alex — "I Know I Saved That Somewhere"

**Opening Scene:** It's 11pm. Alex is debugging a tricky async issue in Rust and *knows* they bookmarked a brilliant article about `tokio` task cancellation last month. Chrome has 400+ bookmarks in a flat mess of folders. Firefox on the personal laptop has another 200. Alex opens the bookmark manager, types "tokio cancel" — nothing. Scrolls through "Programming" folder. Nothing relevant. Tries the phone. Nothing. The article is gone, buried in the digital landfill.

**Rising Action:** Alex discovers personal-bookmarks-api on GitHub. `docker run -p 3000:3000 -v bookmarks-data:/data personal-bookmarks-api` — running in 15 seconds. Exports Chrome bookmarks as HTML, hits `curl -X POST http://localhost:3000/api/import -H "Authorization: Bearer $KEY" -F "file=@bookmarks.html"` — 437 bookmarks imported, folders auto-mapped to tags. Does the same for Firefox. 612 total bookmarks, one place.

**Climax:** Alex types `curl -s "http://localhost:3000/api/bookmarks?q=tokio+cancel" -H "Authorization: Bearer $KEY" | jq '.[].title'` — the article appears. First result. Two seconds. Alex adds a shell alias: `bm() { curl -s "http://localhost:3000/api/bookmarks?q=$1" -H "Authorization: Bearer $KEY" | jq '.[] | "\(.title)\n  \(.url)"'; }`. From now on, `bm "rust async"` from any terminal, any machine.

**Resolution:** Alex sets up a weekly cron that re-imports browser bookmarks. Writes a Raycast extension that queries the API. Bookmarks become a tool, not a graveyard. The anxiety of "I saved it somewhere" is replaced by the confidence of `bm search`.

---

### Journey 2: Researcher Sam — "The Research Sprint"

**Opening Scene:** Sam is writing a deep-dive article on WebAssembly performance. Over 3 days, they open 47 tabs across two monitors — benchmarks, blog posts, spec documents, GitHub repos. By day 3, they can't remember which tabs they've already read. Notion is open in another tab but switching to it to save each link breaks flow. Links accumulate in a text file, untagged, undescribed.

**Rising Action:** Sam installs a simple bookmarklet that sends `POST /api/bookmarks` with the current page URL, auto-extracted title, and a quick tag dialog. Each save is one click + type "wasm, performance" + enter. Zero context switch. Over the research sprint, Sam saves 38 links, all tagged with `wasm` and sub-tagged by focus area (`benchmarks`, `spec`, `tooling`).

**Climax:** When Sam sits down to write, they query `GET /api/bookmarks?tags=wasm,benchmarks` — 12 focused results. Then `?tags=wasm,spec` — 8 specification documents. The article's structure writes itself from the tag taxonomy. Sam realizes the tagging system *is* the outline.

**Resolution:** Sam builds a personal Next.js dashboard that displays recent bookmarks grouped by tag, with a search bar wired to the API. Research sprints become organized by default. The "where was that link?" problem is gone. Sam starts every new research topic by creating a tag, knowing everything saved will be queryable later.

---

### Journey 3: The Automation Consumer — "The Discord Bot"

**Opening Scene:** Alex (from Journey 1) runs a small Discord server for their dev team. Useful links get shared daily — Stack Overflow answers, docs pages, tutorials — and disappear into the chat scroll. Nobody can find them a week later.

**Rising Action:** Alex writes a Discord bot that watches for URLs in a `#resources` channel. When a link is shared, the bot calls `POST /api/bookmarks` with the URL, the message text as description, and channel-name + any user-added tags. Takes 45 minutes to build because the API is standard REST — no SDK needed, just `fetch`.

**Climax:** A team member asks "does anyone have that article about database indexing strategies?" Alex types `!search database indexing` — the bot queries `GET /api/bookmarks?q=database+indexing` and returns the top 3 results. Found in 2 seconds. The team realizes every link shared in `#resources` is now permanently searchable.

**Resolution:** The bot becomes the team's collective memory. Other channels get added. The API handles it without configuration changes — it's just more bookmarks with different tags.

---

### Journey 4: Admin/Ops — "Container Restart at 3am"

**Opening Scene:** The VPS reboots after a kernel update at 3am. All Docker containers restart.

**Rising Action:** `GET /api/health` returns 200 within 4 seconds of container start. SQLite database file persists on the mounted volume. No data migration needed, no warm-up period, no external dependencies to reconnect to.

**Climax:** Alex checks the API the next morning: `GET /api/bookmarks?limit=1` — latest bookmark still there. `GET /api/tags` — all tags intact. Zero data loss. Zero manual intervention.

**Resolution:** Alex adds the health endpoint to an uptime monitor. The API just works. The operational burden is effectively zero — exactly what a personal tool should be.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---|---|
| **Dev Alex (Happy Path)** | Docker deploy, browser import, full-text search, tag filtering, API key auth, JSON output |
| **Researcher Sam (Power User)** | Bookmark creation with tags, tag-based filtering, multi-tag queries, pagination |
| **Discord Bot (API Consumer)** | Programmatic CRUD, search endpoint, standard REST conventions, predictable JSON responses |
| **Admin/Ops (Reliability)** | Health check endpoint, SQLite persistence across restarts, volume mount, fast startup |

**Cross-cutting requirements:** All journeys depend on < 200ms response times, reliable data persistence, and clean error responses. The import journey is the critical onboarding funnel — if it fails, users never reach the "aha" moment.

## API Backend Specific Requirements

### Project-Type Overview

This is a single-purpose REST API backend — no web frontend, no CLI, no SDK. The API surface is the entire product. Design decisions should optimize for developer ergonomics: predictable URL patterns, consistent JSON responses, meaningful HTTP status codes, and clean error messages that help integrators debug without guesswork.

### Endpoint Specification

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/bookmarks` | Create bookmark (url, title, description, tags) |
| `GET` | `/api/bookmarks` | List bookmarks with pagination, search, tag filter |
| `GET` | `/api/bookmarks/:id` | Get single bookmark |
| `PUT` | `/api/bookmarks/:id` | Update bookmark (full replace) |
| `DELETE` | `/api/bookmarks/:id` | Delete bookmark |
| `GET` | `/api/tags` | List all tags with bookmark counts |
| `POST` | `/api/import` | Import Netscape HTML bookmark file |
| `GET` | `/api/export` | Export all bookmarks as JSON |
| `GET` | `/api/health` | Health check (returns 200 + status) |

**Query Parameters for `GET /api/bookmarks`:**
- `q` — Full-text search across title, URL, description, tags
- `tags` — Comma-separated tag filter (AND semantics)
- `limit` — Results per page (default: 20, max: 100)
- `offset` — Pagination offset
- `sort` — Sort field (`created_at`, `updated_at`, `title`; default: `created_at` desc)

### Authentication Model

- **Mechanism:** API key via `Authorization: Bearer <key>` header
- **Key generation:** Auto-generated on first run, stored in SQLite
- **Key regeneration:** `POST /api/auth/regenerate` (authenticated) — returns new key, invalidates old
- **Scope:** Single-user, single-key. No roles, no permissions, no OAuth.
- **Failed auth response:** `401 Unauthorized` with clear error message

### Data Schemas

**Bookmark Object:**
```json
{
  "id": "integer (auto-increment)",
  "url": "string (required, valid URL)",
  "title": "string (required, max 500 chars)",
  "description": "string (optional, max 2000 chars)",
  "tags": ["string array (optional)"],
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

**Tag Object:**
```json
{
  "name": "string",
  "count": "integer (number of bookmarks with this tag)"
}
```

### Error Codes

Consistent error response format across all endpoints:

```json
{
  "error": {
    "code": "string (machine-readable)",
    "message": "string (human-readable)"
  }
}
```

| HTTP Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, missing required fields |
| 400 | `invalid_url` | URL field fails validation |
| 401 | `unauthorized` | Missing or invalid API key |
| 404 | `not_found` | Bookmark ID doesn't exist |
| 409 | `duplicate_url` | URL already bookmarked (optional: configurable) |
| 422 | `validation_error` | Field validation failures (too long, invalid type) |
| 500 | `internal_error` | Unexpected server error |

### Rate Limits

Not applicable for MVP. Single-user, self-hosted — no abuse vector. If needed post-MVP, implement simple per-minute limits.

### API Documentation

- OpenAPI 3.0 spec auto-generated or hand-maintained at `/api/docs` (optional for MVP)
- README includes complete `curl` examples for every endpoint
- Response examples included in documentation for every endpoint

### Implementation Considerations

- **Framework:** Lightweight HTTP framework (e.g., Hono, Fastify, or Go's net/http). No heavy batteries-included frameworks.
- **Database:** SQLite with FTS5 extension for full-text search. Single file, zero config.
- **Versioning:** No API versioning for MVP. Single version, breaking changes only in major releases.
- **SDK:** Not needed — the API is simple enough that `curl`/`fetch` is sufficient. SDK is a post-MVP companion project.
- **CORS:** Configurable via environment variable for browser-based integrations (bookmarklets, dashboards).

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — the smallest thing that proves "developers want an API for bookmarks." Not a platform play, not a revenue play. Validate the core hypothesis: if a developer can import their browser bookmarks and search them via `curl` in under 5 minutes, they'll keep using it.

**Resource Requirements:** Solo developer. No team needed. The tech stack (SQLite + lightweight HTTP framework + Docker) is intentionally chosen to be buildable by one person in a focused sprint. No external services, no DevOps complexity.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Dev Alex (happy path): Import → search → integrate into workflow
- Admin/Ops: Deploy → health check → data persistence

**Must-Have Capabilities:**

| # | Feature | Why It's Essential |
|---|---|---|
| 1 | Bookmark CRUD | Without this, there's no product |
| 2 | Tag filtering | Organization is the core value prop beyond just storing URLs |
| 3 | Full-text search (FTS5) | The "aha" moment — finding bookmarks faster than browser search |
| 4 | API key auth | Security minimum for a self-hosted service exposed to network |
| 5 | Browser import (Netscape HTML) | Onboarding funnel — without import, users start from zero |
| 6 | JSON export | Data freedom — users must trust they can leave; prevents vendor lock-in anxiety |
| 7 | Docker deployment + health check | Deployment simplicity is a core differentiator |

**Explicitly NOT in MVP:**
- No web UI (API-first philosophy — UI is a separate project)
- No automatic metadata fetch (user provides title/description)
- No deduplication (handle manually or ignore)
- No bulk operations (individual CRUD is sufficient initially)
- No webhooks (no integration patterns to observe yet)

### Post-MVP Features

**Phase 2 — Enhanced Experience (v1.1):**
- Automatic URL metadata extraction (fetch title, description, favicon from URL)
- Duplicate URL detection with configurable handling (reject, warn, allow)
- `PATCH` endpoint for partial bookmark updates
- Bulk operations: tag multiple bookmarks, bulk delete by tag/query
- Pagination metadata in response headers (`X-Total-Count`, `Link`)

**Phase 3 — Ecosystem (v2.0):**
- Minimal web UI companion (separate repo, consumes the API)
- Browser extension (Chrome + Firefox) for one-click bookmark save
- CLI tool (`bm add`, `bm search`, `bm tags`)
- Webhook support for "bookmark added/updated/deleted" events
- OpenAPI 3.0 auto-generated spec at `/api/docs`

**Phase 4 — Advanced (v3.0):**
- PostgreSQL as alternative backend for larger collections
- Smart collections (auto-tag by domain pattern, content type)
- AI-powered bookmark summarization and categorization
- Multi-device sync considerations

### Risk Mitigation Strategy

**Technical Risks:**
- *SQLite FTS5 search quality:* Low risk. FTS5 is battle-tested and well-documented. Fallback: simple `LIKE` queries if FTS5 integration proves complex (unlikely).
- *Netscape HTML import parsing:* Medium risk. Browser export formats may have quirks. Mitigation: test with Chrome, Firefox, and Safari exports; use an established HTML parser library rather than regex.
- *Container size:* Low risk. SQLite is embedded, no external deps. A Go or Node.js binary + SQLite stays well under 50MB.

**Market Risks:**
- *"Does anyone want this?":* Primary risk. Mitigation: Vinci uses it daily first (self-use validation). If the creator doesn't use it, nobody will. GitHub stars and Docker pulls within 3 months validate external interest.
- *Competition from Linkding/Shaarli:* Differentiated by API-first approach. Not competing on UI — competing on developer ergonomics.

**Resource Risks:**
- *Solo developer:* The intentionally small scope makes this a non-risk. 7 endpoints, SQLite, Docker. If even this scope is too large, cut JSON export and key regeneration from MVP — they're nice-to-have.

## Functional Requirements

### Bookmark Management

- **FR1:** User can create a bookmark by providing a URL, title, optional description, and optional tags
- **FR2:** User can retrieve a single bookmark by its unique identifier
- **FR3:** User can retrieve a paginated list of all bookmarks
- **FR4:** User can update all fields of an existing bookmark (full replace)
- **FR5:** User can delete a bookmark by its unique identifier
- **FR6:** User can sort bookmark listings by creation date, update date, or title

### Search & Discovery

- **FR7:** User can perform full-text search across bookmark titles, URLs, descriptions, and tags
- **FR8:** User can filter bookmarks by one or more tags (AND semantics — all specified tags must be present)
- **FR9:** User can combine full-text search with tag filtering in a single query
- **FR10:** Search results are ranked by relevance to the query

### Tag Organization

- **FR11:** User can assign multiple tags to a bookmark at creation or update time
- **FR12:** User can retrieve a list of all tags with the count of bookmarks per tag
- **FR13:** Tags are automatically created when first assigned to a bookmark (no separate tag creation step)
- **FR14:** Tags with zero bookmarks are automatically cleaned up or excluded from tag listings

### Authentication & Security

- **FR15:** System generates an API key automatically on first run
- **FR16:** All API endpoints require a valid API key via Authorization header
- **FR17:** User can regenerate their API key, invalidating the previous key
- **FR18:** Unauthenticated requests receive a clear 401 error response

### Data Import

- **FR19:** User can import bookmarks from a Netscape HTML bookmark file (Chrome/Firefox/Safari export format)
- **FR20:** Import process maps bookmark folder hierarchy to tags
- **FR21:** Import reports the number of bookmarks successfully imported and any failures

### Data Export

- **FR22:** User can export all bookmarks as a JSON file
- **FR23:** Export includes all bookmark fields (URL, title, description, tags, timestamps)

### Deployment & Operations

- **FR24:** System runs as a single Docker container with SQLite embedded
- **FR25:** System exposes a health check endpoint that confirms operational status
- **FR26:** System persists all data to a mountable volume for survival across container restarts
- **FR27:** System starts and serves requests within 5 seconds of container start

### Error Handling

- **FR28:** System returns consistent JSON error responses with machine-readable error codes and human-readable messages
- **FR29:** System validates bookmark URLs and rejects malformed URLs with a specific error
- **FR30:** System validates request payloads and returns specific validation error messages for each invalid field
- **FR31:** System returns appropriate HTTP status codes (400, 401, 404, 409, 422, 500) for all error conditions

### Configuration

- **FR32:** System supports CORS configuration via environment variable for browser-based API consumers
- **FR33:** System configures the listening port via environment variable

## Non-Functional Requirements

### Performance

- **NFR1:** All CRUD endpoints respond in < 200ms at p95 with up to 10,000 bookmarks stored
- **NFR2:** Full-text search responds in < 200ms at p95 with up to 10,000 bookmarks
- **NFR3:** Browser bookmark import of 1,000 bookmarks completes in < 30 seconds
- **NFR4:** JSON export of 10,000 bookmarks completes in < 10 seconds
- **NFR5:** Cold start (container start to first request served) completes in < 5 seconds

### Security

- **NFR6:** API key is stored hashed in SQLite (never plaintext)
- **NFR7:** API key is transmitted only via HTTPS in production (documentation recommends TLS termination via reverse proxy)
- **NFR8:** Failed authentication attempts return generic error messages (no information leakage about key validity)
- **NFR9:** SQL injection is prevented through parameterized queries for all database operations
- **NFR10:** Input validation rejects payloads exceeding reasonable size limits (e.g., 1MB per request)

### Reliability

- **NFR11:** Zero data loss across container restarts when data volume is properly mounted
- **NFR12:** SQLite database remains consistent after unexpected process termination (WAL mode)
- **NFR13:** System availability target of 99.9% on a properly configured VPS (< 8.7 hours downtime/year)
- **NFR14:** Import operation is atomic — partial failures do not corrupt existing bookmarks

### Deployment & Operations

- **NFR15:** Docker image size < 50MB
- **NFR16:** System runs with no external dependencies (no external database, cache, or message queue)
- **NFR17:** All configuration via environment variables (12-factor app compliance)
- **NFR18:** Structured JSON logging to stdout for container log aggregation
