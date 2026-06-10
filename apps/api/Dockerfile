# ============================================================
# API вЂ” Multi-stage Dockerfile
# Node 20 Alpine, pnpm workspace
# ============================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

# Copy workspace config first (cache layer)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install deps needed for build (including workspace devDependencies)
ENV NODE_ENV=development
RUN pnpm install --prod=false --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/
# DPA-тексты (152-ФЗ согласия) — рантайм-ассеты, читаются apps/api/src/modules/dpa/loader.ts.
COPY docs/legal/dpa/ ./docs/legal/dpa/

# Build shared first, then api
RUN pnpm --filter @tms/shared exec tsc -p tsconfig.json
RUN pnpm --filter @tms/api build

# --- Stage 2: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN pnpm install --prod --frozen-lockfile

# Copy build output
COPY --from=builder /app/packages/shared/ ./packages/shared/
COPY --from=builder /app/apps/api/dist/ ./apps/api/dist/
# Шрифты для PDF (СФ/УПД/КСФ): tsc компилирует только .ts, .ttf-ассеты в dist
# не попадают → PDF-генерация падает с ENOENT на dist/assets/fonts/Roboto-*.ttf.
# Кладём src/assets рядом со скомпилированным кодом (код резолвит шрифт от dist).
COPY --from=builder /app/apps/api/src/assets/ ./apps/api/dist/assets/
# DPA-тексты — runtime-resource, читаются по относительному пути.
COPY --from=builder /app/docs/legal/dpa/ ./docs/legal/dpa/

# Non-root user
RUN addgroup -S tms && adduser -S tms -G tms
USER tms

EXPOSE 4000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

CMD ["node", "apps/api/dist/server.js"]



