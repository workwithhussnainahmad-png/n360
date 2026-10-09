# Node 24 uses V8 async-context frames for AsyncLocalStorage.
FROM node:24.21.0-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Compilers and verification tools stay out of worker/migrator runtimes.
FROM deps AS production-deps
RUN npm prune --omit=dev --ignore-scripts

FROM deps AS worker-builder
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY scripts/push-receipt-worker.ts scripts/institution-restore-worker.ts ./scripts/
RUN ./node_modules/.bin/esbuild scripts/push-receipt-worker.ts \
      --bundle --platform=node --target=node20 --format=cjs --packages=external \
      --sourcemap --outfile=dist/push-receipt-worker.cjs
RUN ./node_modules/.bin/esbuild scripts/institution-restore-worker.ts \
      --bundle --platform=node --target=node20 --format=cjs --packages=external \
      --sourcemap --outfile=dist/institution-restore-worker.cjs

# Only compiled workers and production dependencies; no root or source/test tools.
FROM base AS push-receipt-worker
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=worker-builder --chown=node:node /app/dist ./dist
ENV NODE_ENV production
USER node
CMD ["node", "dist/push-receipt-worker.cjs"]

# Database changes use a separate, explicitly invoked migration job.
FROM base AS migrator
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts/migrate-production.mjs ./scripts/migrate-production.mjs
USER node
CMD ["node", "scripts/migrate-production.mjs", "--apply"]

FROM base AS builder
ARG NISAAB360_BUILD_ID
ENV NISAAB360_BUILD_ID=${NISAAB360_BUILD_ID}
ARG NEXT_PUBLIC_APP_DOMAIN=nisaab360.app
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
ENV NEXT_PUBLIC_APP_DOMAIN=${NEXT_PUBLIC_APP_DOMAIN}
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
# Application backup verification needs pg_restore; schema changes use migrator.
RUN apk add --no-cache postgresql-client
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir -p public/downloads && chown -R nextjs:nodejs public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# No migration SQL, migrator, Drizzle Kit, tsx or compiler overlays in web image.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/standalone-server.cjs ./scripts/standalone-server.cjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/hot-lane-request.cjs ./scripts/hot-lane-request.cjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
# HOT_PATH_LANE=0 routes through Next without rebuilding.
CMD ["node", "scripts/standalone-server.cjs"]
