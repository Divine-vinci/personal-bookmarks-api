# Stage 1: Build
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

# Prune dev dependencies so we can copy production-only node_modules
RUN npm prune --omit=dev

# Stage 2: Production
FROM node:24-alpine AS production

WORKDIR /app

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /data && chown appuser:appgroup /data

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
