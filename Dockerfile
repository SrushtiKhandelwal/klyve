# Production image for Klyve (website + background sending worker).
#
# Build:  docker build -t klyve .
# Run it with docker-compose.prod.yml (see docs/DEPLOY.md), which also starts
# Postgres and HTTPS. The image runs database migrations on start, then the app.
#
# Two stages: "build" installs everything and compiles the app; "runner" is
# what actually runs. We keep the full node_modules in the runner (it includes
# the Prisma CLI, needed for `prisma migrate deploy` on start). Bigger image,
# but simpler and harder to break, which matters more for us right now.

# ── 1. Build ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# OpenSSL is needed by Prisma's engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached until package*.json change).
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# Then the source, and build. Telemetry off; a dummy DATABASE_URL lets
# `prisma generate` run without a real database.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
  && npm run build

# ── 2. Run ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MEDIA_STORAGE_DIR=/app/storage/uploads

# Run as the unprivileged "node" user that the base image provides.
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/src/generated ./src/generated

# Uploaded images live here; docker-compose.prod.yml mounts a volume on it.
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage
USER node

EXPOSE 3000

# Wait-free start: apply any new migrations, then start the server.
# (`migrate deploy` only applies committed migrations; it never resets data.)
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
