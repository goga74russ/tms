# TMS v2

TMS v2 — рабочая ветка платформы управления транспортом. Это активный sandbox и будущая производственная база. Старая папка `D:\Ai\TMS` остаётся архивом исторической документации и release-evidence.

## Продукт

Операционная TMS с compliance-first уклоном для российского рынка автоперевозок.

Сквозной поток:

```text
order → trip → waybill → inspections → release → delivery → document-return → billing
```

## Что в коробке

| Стрим | Состояние |
|---|---|
| Web back-office | 47+ страниц на едином дизайн-системе (Button/Input/Stat/DataTable/Pill/Skeleton/EmptyState/Toast/SideDrawer/ErrorBoundary) |
| Driver mobile | 10 экранов, визуальный редизайн v2 на theme tokens + 8 UI-компонентах |
| REST API | 200+ эндпоинтов, ~287 route declarations, 140/140 unit-тестов |
| Docker Compose | 5 сервисов: postgres, redis, minio, nginx, api+web |
| База | 65 таблиц, 25 миграций (0000–0025), append-only триггеры на events / inspections / med_access_log |
| Provider adapters | 8 типов (signature/edi/telematics/fuel-card/fines/marking/payment/email/osago/ofd), 20+ скелетов с TODO в точке HTTP-вызова |
| Compliance | ОСАГО / тахограф (.DDD parser) / маркировка / ADR strict-mode |
| Monetization | Plans + subscriptions + payments + usage counters + plan-guard, ЮKassa webhook, ОФД skeleton |
| AI co-pilot | MVP с 10 tool-функциями, SSE streaming, mock-fallback без API-ключа |
| Public funnel | Landing + signup + email-verify + 6-step onboarding wizard + 3 legal-страницы |
| Cockpit v2 | Трёхпанельный fleet-ops cockpit (TopBar + LeftRail + Map + RightPanel) с dark-mode |

## Repository layout

```text
apps/api        Fastify API, Drizzle schema, миграции, бизнес-модули, providers, mocks
apps/web        Next.js 15 / React 19 веб-приложение
apps/mobile     Expo + React Native + WatermelonDB водительское приложение
packages/shared Общие enums, схемы, типы
nginx           Production nginx конфиги
scripts         Operational скрипты (включая api-smoke-chain.sh)
docs            Документация v2
```

## Source of truth

- `D:\Ai\TMS-prod` — активный v2 workspace.
- `D:\Ai\TMS` — архив/референс. Старые доки невалидны, пока не перенесены в `docs/`.

## Статус

Free-box («бесплатный контур») закрыт end-to-end после волн W1–W6. После W6 прошли 9 раундов углубления:

- **Round 1** — AI co-pilot MVP + provider adapter framework + Phase 1 stabilization (Playwright, JWT edge verify, pino logger).
- **Round 1B** — self-serve signup + 6-step onboarding wizard + админ-кабинет интеграций.
- **Round 2** — compliance breadth (ОСАГО, тахограф, маркировка, ADR strict), monetization (plans/subs/payments/usage), landing + legal.
- **Round 3** — 15 внутренних долгов закрыто: plan-guard wiring, inspection decision endpoints, helmet CSP, демо-генератор, audit-log UI, bulk import, perf-индексы, +73 теста.
- **Round 4A/4B/4C** — дизайн-система + полировка 47 страниц + public-funnel редизайн.
- **Round 5** — 16 багов из UI-walkthrough.
- **Round 6** — 9 внутренних долгов (mojibake, badges, drift, типы).
- **Cockpit v2** — fleet-ops cockpit redesign (lazyweb-driven).
- **Mobile v2** — визуальный редизайн всех 10 экранов (lazyweb-driven).
- **DataTable Phase 1+2** — primitive + 10 listing pages.

Детали: [docs/operations/wave-summary.md](docs/operations/wave-summary.md).

## Что дальше

Полный план: [docs/product/roadmap.md](docs/product/roadmap.md). Сейчас:

1. **Pilot launch** — реальные ключи провайдеров, юр-лицо, smoke на staging, первые beta-подписки.
2. **Phase 2 — паидные интеграции** — Контур.Подпись + Диадок + DaData live + Wialon + tachograph DDD upload.
3. **Phase 4 — compliance depth** — реальные ЦРПТ + РСА-АИС вместо моков.
4. **Phase 7 — AI co-pilot production** — реальный ANTHROPIC_API_KEY + 30 tools + cost dashboards.

## Quickstart

1. Скопировать `.env.example` → `.env` и заполнить `CHANGE_ME_*` (минимум `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `SEED_PASSWORD`).
2. Установить зависимости:
   ```
   pnpm install
   ```
3. Применить миграции (требуется `DATABASE_URL`):
   ```
   pnpm --filter @tms/api db:migrate
   ```
4. Засеять демо-данные (требуется `SEED_PASSWORD`):
   ```
   pnpm --filter @tms/api db:seed
   ```
5. Запустить API + web (два терминала):
   ```
   pnpm dev:api
   pnpm dev:web
   ```
6. Опционально — мобильное:
   ```
   pnpm --filter @tms/mobile start
   ```

После старта:

- Web: `http://localhost:3000` (`/` → landing, `/login` → cabinet, `/signup` → onboarding).
- API: `http://localhost:3001` (`/health`, `/docs` для Swagger).
- Smoke-chain: `API_URL=http://localhost:3001 SEED_PASSWORD=<your-seed-pw> node scripts/smoke-chain.mjs` — прогон цепочки login → order → trip → waybill → inspect → start → temperature → complete → invoice.

## Public landing & user-facing docs

- **Публичный лендинг:** `/landing` (неавторизованные посетители редиректятся с `/`).
- **Пользовательская документация:** [`docs/users/`](docs/users/) — quickstart, onboarding, гайды по ролям (диспетчер / водитель / бухгалтер), настройка интеграций, cold-chain, troubleshooting.
- **Юридические документы:** [`docs/legal/`](docs/legal/) — privacy policy, terms of service, 152-ФЗ согласие. Веб-страницы рендерятся на `/legal/privacy`, `/legal/terms`, `/legal/personal-data`. **ПРОЕКТЫ — требуют юр-ревизии перед публикацией.**

## Ключевые операционные доки

- [docs/operations/audit-2026-05-12-deep.md](docs/operations/audit-2026-05-12-deep.md) — **глубокий аудит всего проекта** (security, code, providers, mobile, tests, docs). 7-agent parallel walkthrough, severity-tagged findings, status per fix.
- [docs/operations/pre-launch-checklist.md](docs/operations/pre-launch-checklist.md) — **чек-лист готовности к пилоту** (env, безопасность, инфра, юр-вопросы, DR).
- [docs/operations/wave-summary.md](docs/operations/wave-summary.md) — что построено в каждой волне / раунде.
- [docs/operations/integrations-status.md](docs/operations/integrations-status.md) — карта mock → real provider.
- [docs/operations/free-box-checklist.md](docs/operations/free-box-checklist.md) — чек-лист функций free-box по этапам цепочки.
- [docs/operations/audit-2026-05-10.md](docs/operations/audit-2026-05-10.md) — аудит и статус закрытия.
- [docs/operations/design-system.md](docs/operations/design-system.md) — инвентарь UI-примитивов (web + mobile + cockpit).
- [docs/operations/lazyweb-workflow.md](docs/operations/lazyweb-workflow.md) — workflow дизайнерских проходов через lazyweb MCP.
- [docs/operations/bug-tracker.md](docs/operations/bug-tracker.md) — все B-* баги, статусы, файлы, контекст находки.
- [docs/operations/migration-history.md](docs/operations/migration-history.md) — листинг миграций 0000–0025.
- [docs/operations/security.md](docs/operations/security.md) — env-safeguards и security настройки.
