# Story 5.1: Docker Containerization

Status: ready-for-dev

## Story

As a developer,
I want to deploy the API as a single Docker container with persistent data storage,
So that I can run it reliably on any VPS with minimal operational overhead.

## Acceptance Criteria

1. **Given** a Dockerfile with multi-stage build **When** the image is built **Then** Stage 1 (build) uses `node:24-alpine` to compile TypeScript **And** Stage 2 (production) copies only compiled JS and production `node_modules` **And** the final image size is under 50MB (NFR15) (FR24)

2. **Given** a `docker-compose.yml` file **When** `docker compose up` is run **Then** the API container starts and is accessible on the configured port **And** a volume is mounted to `/data` for SQLite database persistence (FR26)

3. **Given** the container is running with a mounted data volume **When** the container is stopped and restarted **Then** all bookmarks, tags, and settings persist with zero data loss (NFR11)

4. **Given** the Docker container starts **When** the application initializes **Then** the health check endpoint responds within 5 seconds of container start (FR27, NFR5)

5. **Given** the Dockerfile includes a HEALTHCHECK instruction **When** Docker runs the health check **Then** it calls `GET /api/health` and expects a 200 response

6. **Given** a `.env.example` file exists in the project root **When** a developer reviews it **Then** all environment variables (PORT, DATA_DIR, CORS_ORIGINS, LOG_LEVEL, NODE_ENV) are documented with their defaults

7. **Given** a `.gitignore` file exists **When** reviewed **Then** it excludes `node_modules/`, `dist/`, `data/`, `.env`, and other build artifacts

8. **Given** the Docker container is running **When** no external services are required **Then** the API functions fully with only SQLite embedded (NFR16)

## Tasks / Subtasks

- [ ] Task 1: Create `Dockerfile` with multi-stage build (AC: #1, #4, #5, #8)
  - [ ] Stage 1 (build): `node:24-alpine`, install all deps, compile TypeScript, copy migrations
  - [ ] Stage 2 (production): `node:24-alpine`, copy compiled JS + production `node_modules` only
  - [ ] Add HEALTHCHECK instruction using wget (curl not available on alpine by default)
  - [ ] Set DATA_DIR=/data, expose port, add non-root user

- [ ] Task 2: Create `docker-compose.yml` (AC: #2, #3)
  - [ ] Service definition with build context
  - [ ] Named volume mounted to `/data`
  - [ ] Port mapping via environment variable
  - [ ] Environment variable passthrough

- [ ] Task 3: Create `.dockerignore` (AC: #1)
  - [ ] Exclude node_modules, dist, data, .git, test, .env

- [ ] Task 4: Update `.gitignore` if needed (AC: #7)
  - [ ] Verify `node_modules/`, `dist/`, `data/`, `.env` are excluded

- [ ] Task 5: Verify `.env.example` completeness (AC: #6)
  - [ ] All 5 env vars documented with defaults

- [ ] Task 6: Build and verify image size < 50MB (AC: #1)
  - [ ] Run `docker build` and check image size
  - [ ] Optimize if needed (prune dev deps, minimize layers)

## Dev Notes

### Existing Code to Reuse (DO NOT recreate)

**`package.json` scripts** — already has `build: "tsc && node scripts/copy-migrations.mjs"` and `start: "node dist/index.js"`. The Dockerfile should use these directly.

**`scripts/copy-migrations.mjs`** — copies SQL migration files from `src/db/migrations/` to `dist/db/migrations/` during build. The build stage must run this.

**`src/config.ts`** — reads `PORT`, `DATA_DIR`, `CORS_ORIGINS`, `LOG_LEVEL`, `NODE_ENV` from env vars with defaults. `DATA_DIR` defaults to `./data` — the Dockerfile should set `DATA_DIR=/data` to use the volume mount path.

**`src/index.ts`** — `startServer()` creates `config.dataDir` directory with `fs.mkdirSync(recursive: true)` before initializing the database. No need to `mkdir /data` in the Dockerfile — the app handles it.

**`.env.example`** — already exists with all 5 env vars documented. No changes needed unless something is missing.

**`.gitignore`** — already excludes `node_modules/`, `dist/`, `data/*.db*`, `.env`. May need minor updates for completeness.

**`better-sqlite3`** — this is a native Node.js addon (C++ binding). It must be compiled for the target architecture. Since both build and production stages use `node:24-alpine`, the compiled native addon from the build stage can be copied directly. However, `npm ci --omit=dev` in the production stage will reinstall it — ensure build tools are available or copy `node_modules` from build stage instead.

### Task 1: Dockerfile Implementation

```dockerfile
FROM node:24-alpine AS build

WORKDIR /app

# Install build dependencies for better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p /data && chown appuser:appgroup /data
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
```

**Key design decisions:**

1. **Multi-stage build**: Build stage has full dev dependencies and build tools. Production stage only has production deps + compiled JS.

2. **better-sqlite3 native build**: Requires `python3`, `make`, `g++` for compilation. In production stage, install build tools, run `npm ci --omit=dev` (which compiles better-sqlite3), then remove build tools to minimize image size.

3. **HEALTHCHECK with wget**: Alpine doesn't include curl by default but has wget via busybox. Use `wget -qO-` instead of `curl -f`.

4. **Non-root user**: Security best practice. Create `appuser`, give ownership of `/data` directory, then switch to non-root.

5. **DATA_DIR=/data**: Overrides the default `./data` so SQLite writes to the volume mount point.

6. **start-period=5s**: Matches NFR5 — allows 5 seconds for cold start before health checks count as failures.

**Alternative approach for smaller image** — copy `node_modules` from build stage instead of reinstalling:

```dockerfile
FROM node:24-alpine AS production
WORKDIR /app

# Reinstall production deps only (rebuilds native addons for this stage)
COPY package.json package-lock.json ./

# Copy build tools are needed for better-sqlite3
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev && \
    apk del python3 make g++ && \
    rm -rf /root/.npm /tmp/*

COPY --from=build /app/dist ./dist
```

If the build tools inflate the image too much (cached layers from apk), an alternative is to copy `node_modules` from the build stage and then prune dev deps:

```dockerfile
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev
```

This avoids needing build tools in the production stage at all — the native addon was already compiled in the build stage (same Alpine base = same architecture). This approach is likely smaller. **Prefer this approach.**

### Task 2: docker-compose.yml

```yaml
services:
  api:
    build: .
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - bookmarks-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/data
      - CORS_ORIGINS=${CORS_ORIGINS:-}
      - LOG_LEVEL=${LOG_LEVEL:-info}
    restart: unless-stopped

volumes:
  bookmarks-data:
```

**Key design decisions:**

1. **Named volume** (`bookmarks-data`): Persists across `docker compose down` / `docker compose up`. Only destroyed with `docker compose down -v`.

2. **Port mapping**: Host port is configurable via `PORT` env var (defaults to 3000). Container always listens on 3000 internally.

3. **restart: unless-stopped**: Auto-restart on crash, survives host reboot, but respects manual `docker stop`.

4. **Environment passthrough**: Reads from host `.env` file (docker compose does this automatically). Falls back to defaults.

### Task 3: .dockerignore

```
node_modules
dist
data
.git
.gitignore
test
*.md
.env
.env.example
_bmad-output
```

**Purpose:** Reduces Docker build context size and prevents secrets (`.env`) from being copied into the image.

### Task 4: .gitignore Updates

Current `.gitignore` already covers the essentials. Verify and add if missing:
- `node_modules/` — present
- `dist/` — present
- `data/*.db*` — present (could be broader: `data/`)
- `.env` — present

No changes expected unless the data/ pattern needs updating.

### Task 5: .env.example Verification

Current `.env.example` already documents all 5 env vars:
- `PORT=3000`
- `DATA_DIR=./data`
- `CORS_ORIGINS=`
- `LOG_LEVEL=info`
- `NODE_ENV=development`

No changes needed.

### Task 6: Image Size Optimization

Target: < 50MB (NFR15).

Estimated size breakdown:
- `node:24-alpine` base: ~50MB (this alone might be close to the limit)
- Production `node_modules` (hono, better-sqlite3, pino, zod, etc.): ~15-20MB
- Compiled JS (`dist/`): < 1MB

**If over 50MB**, optimization strategies:
1. Use `node:24-alpine` slim variant if available
2. Copy `node_modules` from build stage + `npm prune` (avoids build tools in prod)
3. Remove `.node` debug files from better-sqlite3
4. Multi-layer cleanup in single `RUN` statement

**Note on alpine + better-sqlite3:** The `better-sqlite3` package includes a prebuilt binary for common platforms. If the prebuilt matches `linux-x64-musl` (Alpine), `npm ci` won't need build tools at all. Check `node_modules/better-sqlite3/prebuilds/` — if a matching prebuild exists, skip `apk add python3 make g++` entirely, which will significantly reduce image size.

### Previous Story Learnings (from Epics 1-4)

1. **Build script**: `npm run build` already handles TypeScript compilation AND migration file copying via `scripts/copy-migrations.mjs`. Use it directly in Dockerfile.
2. **Type casts**: Use proper types, not `as never`.
3. **Keep existing tests passing**: Docker changes should NOT affect any existing test behavior.
4. **Config defaults**: `src/config.ts` handles all env var defaults — the Dockerfile just needs to set `DATA_DIR=/data` and `NODE_ENV=production`.

### Project Structure Notes

- **New file**: `Dockerfile` — multi-stage build
- **New file**: `docker-compose.yml` — service + volume definition
- **New file**: `.dockerignore` — build context exclusions
- **Possibly modified**: `.gitignore` — minor additions if needed
- **NOT modified**: `package.json`, `src/config.ts`, `src/index.ts`, any source code
- **NOT modified**: `.env.example` — already complete

### References

- [Source: epics.md#Story 5.1] — acceptance criteria and FR/NFR mappings (FR24, FR26, FR27, NFR5, NFR11, NFR13, NFR15, NFR16)
- [Source: architecture.md#Docker Build] — multi-stage build spec, HEALTHCHECK instruction, volume mount
- [Source: architecture.md#Environment Variables] — PORT, DATA_DIR, CORS_ORIGINS, LOG_LEVEL, NODE_ENV
- [Source: architecture.md#Infrastructure & Deployment] — `node:24-alpine` base image
- [Source: package.json] — build script: `tsc && node scripts/copy-migrations.mjs`, start script: `node dist/index.js`
- [Source: config.ts] — env var parsing with defaults
- [Source: index.ts] — `fs.mkdirSync(config.dataDir, { recursive: true })` — auto-creates data dir

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
