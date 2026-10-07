# Node 24 uses V8 async-context frames instead of per-promise async_hooks for
# AsyncLocalStorage, which Next uses throughout every request.
FROM node:24.21.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Dedicated lightweight runtime for the receipt-only worker.
#
# The entry point is bundled ahead of time instead of being executed through tsx.
# tsx loads its own ESM loader hook plus the esbuild transform pipeline into the
# worker process and re-transpiles the shared TypeScript sources on every start,
# which costs ~80-150 MB of RSS for the lifetime of a process whose actual job is a
# few queries a minute. On an 8 GB box shared with Postgres that is worth removing.
#
# --packages=external keeps every bare import (pg, drizzle-orm, ioredis,
# next/server) resolving from node_modules at runtime, so nothing about module
# resolution changes — only the TypeScript-to-JavaScript step moves from startup to
# build time. esbuild reads tsconfig.json, so the "@/..." path aliases in the shared
# libraries resolve exactly as they do under tsx.
#
# Fallback if a future import breaks bundling: the sources and tsx are still present
# in this stage, so the previous command works unchanged:
#   CMD ["./node_modules/.bin/tsx", "scripts/push-receipt-worker.ts"]
FROM deps AS push-receipt-worker
WORKDIR /app
COPY . .
RUN ./node_modules/.bin/esbuild scripts/push-receipt-worker.ts \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=cjs \
      --packages=external \
      --sourcemap \
      --outfile=dist/push-receipt-worker.cjs
RUN ./node_modules/.bin/esbuild scripts/institution-restore-worker.ts \
      --bundle --platform=node --target=node20 --format=cjs --packages=external \
      --sourcemap --outfile=dist/institution-restore-worker.cjs
ENV NODE_ENV production
CMD ["node", "dist/push-receipt-worker.cjs"]

# Database migrations do not need a compiled Next.js application. Keeping this
# as a dedicated target makes the deployment gate small and lets migration-only
# changes ship without rebuilding the web bundle.
FROM base AS migrator
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts/migrate-production.mjs ./scripts/migrate-production.mjs
USER node
CMD ["node", "scripts/migrate-production.mjs", "--apply"]

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install postgresql-client for pg_isready.
RUN apk add --no-cache postgresql-client

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir -p public/downloads && chown -R nextjs:nodejs public
# Copy schema and config for migrations
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate-production.mjs ./scripts/migrate-production.mjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Overlay only the migration packages into the standalone app's real
# node_modules directory, so Node can resolve Drizzle Kit's dependencies.
COPY --from=deps /app/node_modules/@drizzle-team/ ./node_modules/@drizzle-team/
COPY --from=deps /app/node_modules/@esbuild-kit/ ./node_modules/@esbuild-kit/
COPY --from=deps /app/node_modules/@esbuild/ ./node_modules/@esbuild/
COPY --from=deps /app/node_modules/drizzle-kit/ ./node_modules/drizzle-kit/
COPY --from=deps /app/node_modules/drizzle-orm/ ./node_modules/drizzle-orm/
COPY --from=deps /app/node_modules/esbuild/ ./node_modules/esbuild/
COPY --from=deps /app/node_modules/tsx/ ./node_modules/tsx/
COPY --from=deps /app/node_modules/get-tsconfig/ ./node_modules/get-tsconfig/
COPY --from=deps /app/node_modules/resolve-pkg-maps/ ./node_modules/resolve-pkg-maps/
COPY --from=deps /app/node_modules/pg/ ./node_modules/pg/
COPY --from=deps /app/node_modules/pg-cloudflare/ ./node_modules/pg-cloudflare/
COPY --from=deps /app/node_modules/pg-connection-string/ ./node_modules/pg-connection-string/
COPY --from=deps /app/node_modules/pg-int8/ ./node_modules/pg-int8/
COPY --from=deps /app/node_modules/pg-pool/ ./node_modules/pg-pool/
COPY --from=deps /app/node_modules/pg-protocol/ ./node_modules/pg-protocol/
COPY --from=deps /app/node_modules/pg-types/ ./node_modules/pg-types/
COPY --from=deps /app/node_modules/pgpass/ ./node_modules/pgpass/
COPY --from=deps /app/node_modules/postgres-array/ ./node_modules/postgres-array/
COPY --from=deps /app/node_modules/postgres-bytea/ ./node_modules/postgres-bytea/
COPY --from=deps /app/node_modules/postgres-date/ ./node_modules/postgres-date/
COPY --from=deps /app/node_modules/postgres-interval/ ./node_modules/postgres-interval/
COPY --from=deps /app/node_modules/split2/ ./node_modules/split2/
COPY --from=deps /app/node_modules/xtend/ ./node_modules/xtend/
COPY --from=deps /app/node_modules/buffer-from/ ./node_modules/buffer-from/
COPY --from=deps /app/node_modules/source-map/ ./node_modules/source-map/
COPY --from=deps /app/node_modules/source-map-support/ ./node_modules/source-map-support/

# Production entry point: Next's request handler plus a direct lane for the
# guarded portal JSON APIs (see the file header for the measured reason).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/standalone-server.cjs ./scripts/standalone-server.cjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/hot-lane-request.cjs ./scripts/hot-lane-request.cjs

# Copy entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
# Normalize Windows CRLF line endings so Alpine can interpret the script's shebang.
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
# Rollback without a rebuild: `command: ["node", "server.js"]` in Compose, or
# HOT_PATH_LANE=0 to keep this entry point but route everything through Next.
CMD ["node", "scripts/standalone-server.cjs"]
