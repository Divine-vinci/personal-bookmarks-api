---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
inputDocuments: []
date: 2026-03-20
author: User
projectName: personal-bookmarks-api
---

# Product Brief: personal-bookmarks-api

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

personal-bookmarks-api is a lightweight, API-first bookmarking service designed for developers and power users who want full programmatic control over their saved links. Unlike browser-native bookmarks or consumer-oriented services, this API prioritizes developer ergonomics — offering rich tagging, full-text search, and seamless integration with personal toolchains, scripts, and automation workflows. It is a single-user, self-hosted REST API that treats bookmarks as structured data rather than a browser sidebar feature.

---

## Core Vision

### Problem Statement

Developers and knowledge workers accumulate hundreds of bookmarks across multiple browsers, devices, and contexts. Browser bookmark managers are siloed to individual browsers, lack meaningful organization beyond folder hierarchies, and offer no programmatic access. When a developer wants to search, tag, export, or integrate their bookmarks into a script, CLI tool, or personal dashboard — they hit a wall. The bookmark is trapped inside the browser.

### Problem Impact

- **Lost knowledge:** Valuable links are saved and never found again due to poor search and organization.
- **Fragmentation:** Bookmarks are scattered across Chrome, Firefox, Safari, and mobile — with no single source of truth.
- **No automation:** There is no way to programmatically add, query, or manage bookmarks from scripts, CLI tools, or other applications.
- **Context loss:** Bookmarks lack metadata about *why* they were saved, what project they relate to, or when they were last relevant.

### Why Existing Solutions Fall Short

| Solution | Gap |
|---|---|
| **Browser bookmarks** | Siloed per-browser, no API, weak search, folder-only organization |
| **Pocket / Raindrop.io** | Consumer-focused, limited API flexibility, SaaS dependency, not self-hosted |
| **Linkding / Shaarli** | Full web apps with heavier footprint; not designed as API-first microservices |
| **Plain text / markdown files** | No search, no tagging, no API — manual maintenance overhead |

None of these solutions offer a clean, minimal REST API that a developer can `curl` from a terminal, call from a script, or wire into a personal dashboard without running a full web application.

### Proposed Solution

A self-hosted REST API for personal bookmark management with:

- **CRUD operations** for bookmarks with URL, title, description, and tags
- **Full-text search** across all bookmark fields
- **Tag-based organization** with flexible filtering and combination queries
- **Authentication** via API key for single-user simplicity
- **Lightweight deployment** — a single binary or container, backed by SQLite or PostgreSQL
- **Import/export** in standard formats (Netscape HTML, JSON) for browser interop

The API is the product. No mandatory web UI — though a minimal web frontend may be offered as an optional companion.

### Key Differentiators

1. **API-first by design:** Every feature is accessible via REST. The API is not an afterthought bolted onto a web app — it *is* the product.
2. **Developer ergonomics:** Clean endpoints, predictable JSON responses, and comprehensive filtering make integration trivial from any language or tool.
3. **Single-user simplicity:** No user management overhead. One API key, one owner, zero complexity.
4. **Minimal footprint:** Deployable as a single container with SQLite — no external database required for personal use.
5. **Interoperability:** Import from browsers, export to standard formats, integrate with anything that speaks HTTP.

## Target Users

### Primary Users

#### Persona 1: "Dev Alex" — The Automation-Minded Developer

- **Role:** Full-stack developer, 5 years experience, works across multiple projects
- **Environment:** Uses VS Code, terminal-heavy workflow, manages a personal VPS, writes shell scripts and CLI tools for daily tasks
- **Motivation:** Wants a single source of truth for all saved links that integrates into existing tooling
- **Problem Experience:** Has 500+ bookmarks scattered across Chrome (work laptop), Firefox (personal), and Safari (phone). Frequently thinks "I saw a great article about X last week" but can never find it. Has tried exporting bookmarks to JSON and grepping — it works once but becomes stale immediately.
- **Workarounds:** Keeps a `links.md` file in a git repo, manually copies URLs into it. Forgets to update it. Sometimes pastes links into Slack DMs to self.
- **Success Vision:** `curl https://bookmarks.local/api/bookmarks?tags=rust,async` returns exactly what Alex needs. New bookmarks are added from a shell alias: `bm add <url> --tags "rust, async"`. Everything searchable, everything tagged, zero browser dependency.

#### Persona 2: "Researcher Sam" — The Knowledge Curator

- **Role:** Independent developer / technical writer who researches topics deeply before writing
- **Environment:** Heavy browser user, 20+ tabs open at any time, uses multiple devices
- **Motivation:** Needs to organize research links by topic/project with rich descriptions and notes
- **Problem Experience:** Saves 10-15 links per day during research sprints. Browser bookmarks become an unmanageable dump within weeks. Has tried Raindrop.io but found the API too limited for custom integrations and doesn't want to depend on a SaaS for personal data.
- **Workarounds:** Uses Notion databases to track links, but the overhead of switching to Notion to save a link creates friction. Many links are lost because the save-friction is too high.
- **Success Vision:** A browser extension or bookmarklet that hits the API to save the current page with one click. Later, queries the API from a custom Next.js dashboard that shows bookmarks grouped by project and recency.

### Secondary Users

#### API Consumers (Scripts, Bots, Integrations)

While not "users" in the traditional sense, automated consumers are a key audience:

- **CI/CD pipelines** that archive documentation links
- **Discord/Slack bots** that save shared links to a personal collection
- **RSS readers or scrapers** that auto-bookmark curated content
- **Personal dashboards** that display recent bookmarks by tag

These integrations are possible *because* the product is API-first — they validate the core design decision.

### User Journey

#### Dev Alex's Journey

1. **Discovery:** Finds the project on GitHub while searching for "self-hosted bookmark API"
2. **Onboarding:** Runs `docker run` with one command, gets a running API in 30 seconds. Generates an API key.
3. **First Value:** Imports existing Chrome bookmarks via the `/import` endpoint. All 500+ bookmarks are now searchable via API.
4. **Aha Moment:** Writes a shell alias `bm() { curl -s "https://bookmarks.local/api/bookmarks?q=$1" | jq '.[] | .title, .url'; }` — searches bookmarks from the terminal for the first time. Finds that Rust article in 2 seconds.
5. **Long-term:** The API becomes the central bookmark store. A cron job imports new browser bookmarks weekly. Alex builds a Raycast extension that queries the API for instant bookmark search from anywhere on the desktop.

## Success Metrics

Since personal-bookmarks-api is a self-hosted, single-user tool (not a SaaS business), success metrics focus on **utility, reliability, and adoption signals** rather than traditional revenue or growth KPIs.

### User Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| **Time to first bookmark** | < 5 minutes from `docker run` | Onboarding friction test |
| **Search retrieval speed** | < 200ms p95 for queries up to 10K bookmarks | API response time monitoring |
| **Daily active API calls** | 5+ API calls/day after first week | Access logs |
| **Bookmark collection growth** | User imports existing bookmarks within first session | Import completion tracking |
| **Tag adoption** | 80%+ of bookmarks have at least one tag after 30 days | Database query |

### Business Objectives

As an open-source personal tool, "business" objectives map to **project health and community adoption**:

- **GitHub stars:** 100+ within 3 months of public release (signal of interest)
- **Docker pulls:** 50+ unique pulls within first month
- **Issue engagement:** Active issues/PRs from community members within 6 months
- **Self-use validation:** The creator (Vinci) uses it daily as their primary bookmark store within 2 weeks of deployment

### Key Performance Indicators

**Technical KPIs (release quality gates):**

1. **API response time:** p95 < 200ms for all CRUD and search operations with 10K bookmarks
2. **Uptime:** 99.9% availability on personal VPS (< 8.7 hours downtime/year)
3. **Import success rate:** 100% of valid Netscape HTML bookmark files import without errors
4. **Search relevance:** Full-text search returns the target bookmark in top 5 results for reasonable queries
5. **Container size:** Docker image < 50MB

**Adoption KPIs (post-launch):**

1. **Bookmark count growth:** Steady increase in stored bookmarks week-over-week
2. **Integration count:** At least 2 custom integrations built by the creator (e.g., CLI tool, browser extension, dashboard)
3. **Zero data loss:** No bookmark data lost across container restarts, upgrades, or migrations

## MVP Scope

### Core Features

The MVP delivers the minimum feature set needed for a developer to replace browser bookmarks with an API-driven workflow:

1. **Bookmark CRUD API**
   - `POST /api/bookmarks` — Create a bookmark (url, title, description, tags)
   - `GET /api/bookmarks` — List bookmarks with pagination
   - `GET /api/bookmarks/:id` — Get a single bookmark
   - `PUT /api/bookmarks/:id` — Update a bookmark
   - `DELETE /api/bookmarks/:id` — Delete a bookmark

2. **Tagging System**
   - Add multiple tags per bookmark at creation/update time
   - `GET /api/bookmarks?tags=rust,async` — Filter by one or more tags
   - `GET /api/tags` — List all tags with bookmark counts

3. **Full-Text Search**
   - `GET /api/bookmarks?q=search+term` — Search across title, URL, description, and tags
   - SQLite FTS5 for fast, relevant results

4. **API Key Authentication**
   - Single API key generated on first run
   - All endpoints require `Authorization: Bearer <key>` header
   - Key regeneration endpoint

5. **Browser Bookmark Import**
   - `POST /api/import` — Accept Netscape HTML bookmark format (Chrome/Firefox/Safari export)
   - Parse folders as tags

6. **JSON Export**
   - `GET /api/export` — Export all bookmarks as JSON for backup/migration

7. **Docker Deployment**
   - Single `Dockerfile` with SQLite embedded
   - `docker run -p 3000:3000 -v bookmarks-data:/data personal-bookmarks-api`
   - Health check endpoint: `GET /api/health`

### Out of Scope for MVP

The following are explicitly **deferred** to keep the MVP tight and shippable:

| Feature | Rationale for Deferral |
|---|---|
| **Web UI / frontend** | API-first philosophy — UI can be built later as a separate project |
| **Multi-user support** | Single-user simplicity is a core differentiator; adds auth complexity |
| **PostgreSQL support** | SQLite is sufficient for personal use (10K+ bookmarks); Postgres is a scaling concern |
| **Browser extension** | Can be built as a separate project that consumes the API |
| **Automatic metadata fetching** | (title, favicon, description from URL) — nice-to-have, not essential |
| **Bookmark archiving / wayback** | Storing page snapshots is a different product |
| **OAuth / SSO** | Overkill for single-user; API key is sufficient |
| **Rate limiting** | Single-user, self-hosted — no abuse vector |
| **Webhook notifications** | Can be added post-MVP when integration patterns emerge |
| **CLI tool** | Users can `curl` directly; a dedicated CLI is a companion project |

### MVP Success Criteria

The MVP is validated when:

1. **Functional completeness:** All 7 core features work end-to-end as documented
2. **Self-use test:** The creator successfully imports their existing bookmarks and uses the API as their primary bookmark tool for 1 week
3. **Performance gate:** Search returns results in < 200ms with 1,000+ bookmarks
4. **Reliability gate:** Data persists correctly across container restarts
5. **Deployability:** A new user can go from `docker run` to first API call in under 5 minutes
6. **Documentation:** README includes API reference, quick-start guide, and example `curl` commands

### Future Vision

If the MVP proves its value, the product evolves along three axes:

**Phase 2 — Enhanced Experience (v1.1)**
- Automatic URL metadata extraction (title, description, favicon)
- Bookmark deduplication detection
- `PATCH` support for partial updates
- Bulk operations (tag multiple bookmarks, bulk delete)

**Phase 3 — Ecosystem (v2.0)**
- Minimal web UI for visual browsing and management
- Browser extension (Chrome + Firefox) for one-click save
- CLI companion tool (`bm add`, `bm search`, `bm tags`)
- Webhook support for "bookmark added" events

**Phase 4 — Advanced (v3.0)**
- PostgreSQL as an alternative backend for larger collections
- Multi-device sync considerations
- Smart collections (auto-tag by domain, content type, or pattern)
- AI-powered bookmark summarization and categorization
