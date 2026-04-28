# ============================================================
# Web вЂ” Multi-stage Dockerfile
# Next.js 15 standalone output
# ============================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install deps needed for build (including workspace devDependencies)
ENV NODE_ENV=development
RUN pnpm install --prod=false --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared, then web
RUN pnpm --filter @tms/shared exec tsc -p tsconfig.json

# Next.js standalone output for minimal image
ARG NEXT_PUBLIC_API_URL
ARG INTERNAL_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm --filter @tms/web build

# --- Stage 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S tms && adduser -S tms -G tms

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER tms

EXPOSE 3000

ARG INTERNAL_API_URL
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV INTERNAL_API_URL=${INTERNAL_API_URL}

CMD ["node", "apps/web/server.js"]




