# SESSION HANDOFF — TransPult (разработчик), 2026-06-02

> Записано перед сбросом лимита токенов. Точка входа для продолжения. Канон-статус —
> также в `docs/product/Audit_ALL.md §0`.

## 🔑 Git / прод состояние (на момент записи)
- **local == origin == prod == `0b0aaf1`** — всё синхронно.
- Прод: `135.106.152.23`, `/opt/transpult`, деплой: `ssh -i ~/.ssh/transpult_ed25519 transpult@135.106.152.23 'cd /opt/transpult && bash scripts/deploy.sh'`.
- Прод-здоровье: `/api/health/ready` → 200; `/logo-mark.svg` → 200; `/login` → 200.
- Миграции на проде: до **0040** включительно (0039 per-org unique, 0040 users.token_version).
- Прод — **демо-данные одного тенанта** (только владелец Гоша). Реальных юзеров нет.

## ✅ Что закрыто (всё на проде)
- **P0 (8)** + **P1 (20, кластеры A–D)** — ранее.
- **P2 + отложенное P1 (кластеры E1–E6)** — эта линия сессий:
  - E1 — P0 Gate зелёный + вычистка CI-гнили (OpenAPI-дрейф, e2e-дрейф, тайм-бомба MSW-фикстуры).
  - E2 — per-org нумерация счетов + per-org events.external_id (миг. 0039).
  - E3 — web-middleware RBAC (+10 маршрутов) + sign-endpoint role-гейт.
  - E4 — 5-дн срок СФ в Europe/Moscow + client-портал invoice-enum.
  - E5 — `.env.example` плейсхолдеры + markdown href XSS-whitelist.
  - E6 — JWT revocation (Вариант A: `users.token_version`, миг. 0040; authenticate сверяет с БД;
    бамп при reset-password/деактивации).
- **Дизайн-хэндофф `docs/design/HANDOFF-fixes.md`:**
  - **Блок 1 (shared)** ✅ — z-index шкала (tailwind.config), button↔input h-10, единый focus-ring
    brand-400, единый disabled, **Combobox dropdown через React-portal** (не обрезается модалкой),
    **Dialog grid-rows+90dvh+overflow-hidden**, z-index shared→токены.
  - **Блок 4 (лого)** ✅ — `logo-mark.svg`/`logo-mark-white.svg` в `apps/web/public/`; внедрён в
    sidebar + login/signup (auth-split-layout). + фикс middleware: статика (`*.svg` и пр.) не
    редиректится на /login.

## ⏳ ЧТО ДЕЛАТЬ ДАЛЬШЕ (приоритет сверху)
1. **Дизайн Блок 3 — adaptive (~10ч, БОЛЬШОЙ).** `docs/design/HANDOFF-fixes.md` §БЛОК 3.
   Таблицы (`min-w-[Npx]` → overflow-x-auto wrapper + cards <768 для billing/compliance),
   dispatcher 3-кол responsive (hidden lg/xl + toggle), grid 1→2→4, fleet 10-табов overflow-x-auto.
   **Требует поднятого стека + проверки на 375/768/1024 глазами.** Делать свежей сессией.
2. **Дизайн Блок 5 — цвет (navy+teal).** Дизайнер пометил «последним, отдельный spec» — ЖДЁМ его spec.
3. **QA-задача (чип):** ремонт Playwright e2e под редизайн UI (login починен; sidebar/order-modal/
   мульти-шаг happy-path в `test.fixme` с TODO(QA); auth.setup storage-state для role-юзеров не
   создавался — диагностировать). Нужен запущенный стек.
4. **P3-косметика (не на демо):** `as-any` в money-пути, wialon mock-одометр, 6 skipped gosklyuch,
   `@tms/shared` без тест-раннера, `margin.ts` FX. + хвосты Блока 4 (лого на лендинге white-версия,
   print-формы mono).
5. Открытые в backlog: T-25 (KPI aggregation), T-9 (invoice service unit-tests), R1 (Диадок research).

## ⚠️ ОПЕРАЦИОННЫЕ НЮАНСЫ (важно!)
- **Docker Desktop часто лежит** → локально интеграц.тесты не гоняются; полагаемся на CI
  (`api-integration` job применяет миграции к реальному PG). Unit-тесты (`pnpm --filter @tms/api test`)
  и tsc — без Docker.
- **Реальный web tsc:** `apps/web/node_modules/.bin/tsc --noEmit` (НЕ `npm run lint` — там stub).
- **Реальный api tsc:** `pnpm --filter @tms/api exec tsc --noEmit`.
- **Web vitest:** `cd apps/web && pnpm vitest run`. **API unit:** `pnpm --filter @tms/api test` (714 pass).
- **bash-шелл, НЕ PowerShell** — для commit-сообщений heredoc `cat > /tmp/x.txt <<'EOF' ... EOF` +
  `git commit -F`. PowerShell-синтаксис `@'...'@` в bash ломается (был casual-баг).
- **Shell cwd сбрасывается в worktree** `.claude/worktrees/...` после каждой Bash-команды → каждую
  команду начинать с `cd /d/Ai/TMS-prod`. Работаем на ветке **main** в `D:/Ai/TMS-prod`.
- **Классификатор:** прямой push в main и SSH-деплой на прод требуют ЯВНОЙ пер-действенной
  авторизации. Деплой — только по фразе **«Деплой на прод 135.106.152.23 разрешаю»** (односложное
  «да»/«подтверждаю»/«синхронизируй» классификатор НЕ принимает для деплоя/E-фич-пуша).
- **OpenAPI sync gate:** после изменения роутов api — `pnpm --filter @tms/api openapi:export` +
  коммит `docs/api/openapi.json|md`, иначе P0 Gate падает на «OpenAPI out of sync».
- **MSW/e2e тайм-бомбы:** фикстуры с фикс-датами выпадают из MTD-фильтра при смене месяца —
  использовать относительные даты (`new Date().toISOString()`).
- **Рабочее дерево:** есть много незакоммиченных/untracked доков ДРУГИХ ролей (docs/users, docs/design,
  docs/marketing, docs/qa, CLAUDE.md, .claude/) — НЕ коммитить их, это не моё.

## Контекст продукта
ИП Бардин Г.Д., TMS-prod (ЭТрН/ЭПД, дедлайн 01.09.2026). Стек: apps/api (Fastify+Drizzle+PG),
apps/web (Next.js App Router), packages/shared (zod+invoice-FSM), apps/mobile. Multi-tenant по
organizationId, CASL requireAbility, JWT. Цель сейчас: код→дизайн→демо (web only).
Роль в этих сессиях: **TransPult (разработчик)**.
