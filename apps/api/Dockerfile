# ============================================================
# API — Multi-stage Dockerfile
# Node 20 Alpine, pnpm workspace
# ============================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config first (cache layer)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install deps
RUN pnpm install

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared first, then api
RUN pnpm --filter @tms/shared build
RUN pnpm --filter @tms/api build

# --- Stage 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN pnpm install --prod

# Copy build output
COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/apps/api/dist/ ./apps/api/dist/

# Non-root user
RUN addgroup -S tms && adduser -S tms -G tms
USER tms

EXPOSE 4000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

CMD ["node", "apps/api/dist/server.js"]
