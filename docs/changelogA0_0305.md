# Changelog — Agent 0 (Orchestrator) — 5 марта 2026

## 🔒 Спринт 5.7: GPT Audit Hardening

### Phase 1: Repo Hygiene
- Удалены 5 скомпилированных `.js` из `apps/api/src/` (auth, connection, schema, seed, triggers)
- `.gitignore` — добавлено правило `apps/api/src/**/*.js`
- `package.json` — добавлен root `test` script: `pnpm -r --if-present test`
- Dockerfiles — `pnpm@9.15.2` (pin) + `--frozen-lockfile` для reproducible builds

### Phase 2: Docker/Compose Security
- `docker-compose.prod.yml` — порты Postgres/Redis убраны (internal only)
- Все секреты через `${VAR:?Set VAR}` (fail-fast, no defaults)
- Redis auth: `--requirepass` + пароль в `REDIS_URL`
- `.github/workflows/ci.yml` — валидный CI pipeline с нуля

### Phase 3: Security
- `triggers.ts` — append-only проверяет ВСЕ поля events
- `auth.ts` — cookie `secure: true` всегда в production
- `server.ts` — structured JSON logging (pino-pretty только в dev)

### Phase 4: DB Types
- 21 денежное поле: `real` → `numeric(12,2).$type<number>()`
- Координаты: `real` → `doublePrecision`
- Физ. величины: `real` → `doublePrecision`

### Phase 5: Observability
- `/api/health/ready` — проверяет DB + Redis
- `x-request-id` correlation header

### Phase 6: Env Standardization
- `.env.example` обновлён (добавлен `REDIS_PASSWORD`)
- `.env.local.example` создан (dev, пароли из compose)
- `deploy.sh` — автомиграция `.env` (добавление Redis password)

### Bonus
- `redis.ts` — `testRedisConnection()` передаёт password
- `CreateOrderModal.tsx` — dropdown контрагентов вместо текстового поля
- `repair/page.tsx` — исправлен enum priority + добавлен source

### Git
- `c38ce06` fix: all GPT audit issues
- `084b4e9` fix: Redis client auth
