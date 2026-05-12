# Bug tracker

Все B-* баги, обнаруженные после free-box completion (W6). IDs выделены последовательно в порядке обнаружения. **All P0 / P1 issues are closed.**

## Status legend

- **Fixed** — code shipped, commit recorded.
- **Open** — needs work.
- **Deferred** — known, intentionally not blocking.

## Severity

- **P0** — broken core flow.
- **P1** — broken non-core or visible regression.
- **P2** — UX-quality.
- **P3** — polish / cosmetic.

## Index

| ID | Severity | Where | Description | Status | Discovery |
|---|---|---|---|---|---|
| B-1 | P0 | `apps/api/src/db/triggers/prevent_inspection_modification` | `/inspections/{tech,med}/:id/decision` крашился — append-only trigger forbade UPDATE | Fixed in `3ca734f` (Round 5, migration 0025) | UI walkthrough |
| B-2 | P1 | `apps/api/src/modules/finance/finance.service.ts` | `/finance/export/1c` returned 500 — `db.query.invoices.findMany({ with: { contractor } })` без relations() | Fixed in `3ca734f` (plain leftJoin) | UI walkthrough |
| B-3 | P1 | `docker-compose.yml` (web service) | Web container restarted on every page load — JWT_SECRET не passed to web env | Fixed in `359b6b5` | Smoke walkthrough |
| B-4 | P2 | `apps/web/src/app/dispatcher/page.tsx` | Cockpit blocker rows показывали ?????? mojibake | Fixed in `3ca734f` + Cockpit v2 `4001702` (isMojibake suppression) | UI walkthrough |
| B-5 | P2 | `apps/web/src/app/dispatcher/page.tsx` | Cockpit blocker titles были English ("Crew and rest plan", etc.) | Fixed in `3ca734f` (RU i18n map keyed off `OperationException.type`) | UI walkthrough |
| B-6 | — | — | (reserved/merged with B-5) | — | — |
| B-7 | — | — | (reserved) | — | — |
| B-8 | P2 | `apps/web/src/app/logist/page.tsx` | Kanban overflowed off-screen | Fixed in `3ca734f` (`overflow-x-auto + min-w-max + 280px`) | UI walkthrough |
| B-9 | P3 | `apps/web/src/app/finance/page.tsx` | "+ Счёт по рейсам" button styling | Verified в `3ca734f` (already brand variant) | UI walkthrough |
| B-10 | P2 | `apps/web/src/app/finance/page.tsx` | Long invoice numbers `СЧ-2504-20260429205232193` truncated visually | Fixed in `3ca734f` (`shortInvoiceNo` helper, prefix(16)…suffix(4), full на hover) | UI walkthrough |
| B-11 | P2 | `apps/web/src/components/layout/Sidebar.tsx` | Admin sidebar показывал только 4 из 9 admin pages | Fixed in `3ca734f` (все 9 + grouping "Справочники"/"Эксплуатация") | UI walkthrough |
| B-12 | P3 | `apps/web/src/app/admin/audit-log/page.tsx` | "Применить" filter button была outline | Fixed in `3ca734f` (brand variant) | UI walkthrough |
| B-13 | P3 | `apps/web/src/app/admin/audit-log/page.tsx` | Event-type + entity-type columns truncated без hover-full | Fixed in `3ca734f` (`title=` для full string) | UI walkthrough |
| B-14 | P1 | `apps/api/src/modules/billing/service.ts` + `auth/plan-guard.ts` | "No organization in token" leaked на `/billing` и `/copilot` для seed users без `org_id` | Fixed in `3ca734f` (synthetic Free plan для null orgId, plan-guard bypass для admin без org) | UI walkthrough |
| B-15 | P2 | `apps/web/src/app/billing/page.tsx` | Billing рендерил raw English API errors | Fixed in `3ca734f` (amber localized banner + Повторить) | UI walkthrough |
| B-16 | P3 | `apps/web/src/app/admin/compliance/page.tsx` | OSAGO badges still pale (bumped в `3ca734f` to 100/800 но недостаточно) | Fixed in `64b4e43` (Round 6 — solid span pills с 50/300/800 + icons) | Original audit (M-3-class) + walkthrough |
| B-17 | P2 | `apps/web/src/app/admin/compliance/page.tsx` | Header was English "Compliance" | Fixed in `3ca734f` ("Контроль соответствия: ОСАГО, тахограф, маркировка, ADR") | UI walkthrough |
| B-18 | — | — | (reserved) | — | — |
| B-19 | P2 | `apps/web/src/app/trips/page.tsx` + `waybills/page.tsx` | CP1251-as-UTF-8 byte sequences (mojibake `вЂ`) | Fixed in `64b4e43` (byte-level replacement — 8 occurrences trips, 15 waybills) | UI walkthrough |
| B-20 | P3 | `apps/web/src/app/trips/page.tsx:2616` | "ПЛ check"/"ПЛ ready" badge truncated | Fixed in `64b4e43` ("ПЛ ✓"/"ПЛ ⚠") | UI walkthrough |
| B-21 | P1 | `apps/api/src/modules/finance/routes.ts` | `/finance/invoices?tripId=X` filter ignored — `tripId` отсутствовал в Zod query schema | Fixed in `64b4e43` (Round 6, +2 finance tests, inArray против invoice_trips) | Internal debt review |
| B-22 | P2 | `apps/web/src/app/dispatcher/page.tsx` | Blocker subtitles были English после Cockpit v2 redesign ("etrn is required but missing", etc.) | Fixed in `4001702` (Cockpit v2, `localizeExceptionMessage` exact-match map 15 + prefix-regex 5) | Cockpit v2 walkthrough |
| B-23 | P2 | `apps/web/src/app/(authenticated)/layout-shell.tsx` | Public pages (`/landing /signup /onboarding /legal /login`) показывали authenticated sidebar | Fixed in `35a5fc5` (PUBLIC_PATH_PREFIXES list, bare children render) | DataTable Phase 2 walkthrough |
| B-24 | P2 | `apps/web/src/components/layout/Sidebar.tsx` | Logo label overflowed когда sidebar narrow | Fixed in `35a5fc5` (`min-w-0 flex-1 + truncate` on labels) | DataTable Phase 2 walkthrough |
| B-25 | P1 | `apps/web/src/app/waybills/page.tsx` | Odometer column visual overlap | Fixed in `35a5fc5` (`toLocaleString('ru-RU')`, "Одометр (км)" header, `whitespace-nowrap`) | DataTable Phase 2 walkthrough |
| B-26 | P3 | `apps/web/src/app/claims/page.tsx` | Stat labels too long ("Расследование", "Урегулировано", "Effective exposure") wrapped и ломали grid | Fixed in `35a5fc5` ("В расслед.", "Урегулир.", "Возможные потери") | DataTable Phase 2 walkthrough |
| B-27 | P2 | `apps/web/src/app/claims/page.tsx` | English terms на claims page (Reserve / Estimated / Effective / Cause / Not settled) | Fixed in `35a5fc5` (Резерв / Оценка / Эффект. / Причина / Не урегулирована + EXPOSURE_BASIS_LABELS + CAUSE_LABELS dicts) | DataTable Phase 2 walkthrough |
| B-28 | P3 | `apps/web/src/app/repair/page.tsx` | Repair kanban пустые колонки без EmptyState | Fixed in `35a5fc5` (per-column EmptyState с unique icon + tone + "Новая заявка" CTA на "Создана") | DataTable Phase 2 walkthrough |
| B-29 | P3 | `apps/web/src/app/admin/users/page.tsx` | Role label "Администраторы" слишком длинный для Pill | Fixed in `35a5fc5` ("Админы") | DataTable Phase 2 walkthrough |
| B-30 | P1 | `apps/api/src/modules/integrations/routes.ts` + `apps/web/src/app/admin/integrations/page.tsx` | GET /integrations возвращал 400 "no organization in token" для seed admin | Fixed in `35a5fc5` (returns 200 + `note=no_organization_in_token`, web shows neutral blue info banner) | DataTable Phase 2 walkthrough |
| B-31 | P2 | `apps/web/src/app/admin/integrations/page.tsx` | Provider rows показывали raw enum-like keys (`gosklyuch`, `kontur_sign`, etc.) | Fixed in `35a5fc5` (PROVIDER_LABEL_RU map 26 entries: gosklyuch→Госключ, kontur_sign→Контур.Подпись, diadoc→Контур.Диадок, sbis_sign→СБИС, kaluga_astral→Калуга Астрал, yookassa→ЮKassa, и т.д.) | DataTable Phase 2 walkthrough |
| B-32 | P3 | `apps/web/src/app/admin/billing/page.tsx` | "MRR (active)" English string | Fixed in `35a5fc5` ("MRR (активные)") | DataTable Phase 2 walkthrough |
| B-33 | P3 | `apps/web/src/app/admin/settings/page.tsx` | "Cost model" English string | Fixed in `35a5fc5` ("Модель себестоимости") | DataTable Phase 2 walkthrough |
| B-34 | P1 | `apps/web/src/app/trips/page.tsx` | Множество английских строк: `Loading`/`Unloading`/`Stop` для типов точек, ` t`/` kg`/` m3` для веса/объёма, `problem`/severity tokens, `dispatcher`/`driver`/`accounting` для роли, `block`/`warning` для severity badge, "Next actions"/"Repair request"/"Return checklist"/"Breakdown flow"/"Close gate", "Document queue"/"Missing, overdue and exceptioned", `close: ready/blocked`, `Readiness checklist`, `ready`/`check`/`block`/`ok`/`optional` для readiness items, "Print act" | Fixed (Wave-bugs-2) — RU labels + new helpers `bucketLabel` / `eventSeverityLabel` / `readinessLabel` | Wave-bugs-2 walkthrough |
| B-35 | P1 | `apps/web/src/app/waybills/page.tsx` | Английские строки: `required`/`optional`/`history N`/`retry after fix`, "ETRN issues"/"Check blockers", "Compliance snapshot", "Readiness checklist", `ready`/`check`/`block` (cue + row), `ok`/`check`/`optional` (items) | Fixed (Wave-bugs-2) | Wave-bugs-2 walkthrough |
| B-36 | P1 | `apps/web/src/app/legal/*` | Все три юр-страницы (Privacy, Terms, Personal-data) имели dateline `подлежит уточнению` — нарушение требований 152-ФЗ к датированию политики | Fixed (Wave-bugs-2) — dateline `12 мая 2026 года (пилотная редакция)`. INN/ОГРН/адрес остаются placeholder'ами до регистрации юрлица (draft banner предупреждает) | Public-funnel walkthrough |
| B-37 | P1 | `apps/web/src/components/layout-shell.tsx` + `apps/web/src/app/forgot-password/page.tsx` | `/forgot-password` ссылка из `/login` вела в 404, и страница оборачивалась в authenticated sidebar shell (т.к. префикс не в PUBLIC_PATH_PREFIXES) | Fixed (Wave-bugs-2) — добавлен `/forgot-password` в PUBLIC_PATH_PREFIXES + создана stub-страница (AuthSplitLayout + amber-banner "пока вручную через админа" + support email) | Public-funnel walkthrough |
| B-38 | P1 | `apps/web/src/app/login/page.tsx` | Чек-бокс "Запомнить меня" — pure UI noise, никак не передавался в API.login() и не влиял на сессию | Fixed (Wave-bugs-2) — флаг сохраняется в localStorage `auth:remember`. Server-side long-lived sessions всё ещё не реализованы, но чек-бокс честно перестал быть no-op | Public-funnel walkthrough |
| B-39 | P2 | `apps/web/src/app/login/page.tsx` + `apps/web/src/app/page.tsx` | Role routing использовал `reduce` по `user.roles` массиву — а порядок ролей в массиве произвольный. Пользователь с `['driver','admin']` уходил на `/` (driver) вместо `/admin/users` | Fixed (Wave-bugs-2) — добавлен `ROLE_PRIORITY` массив (admin > manager > dispatcher > logist > accountant > mechanic > medic > repair_service > client > driver) + `pickRouteForRoles()` helper | Public-funnel walkthrough |
| B-40 | P1 | `apps/web/src/app/claims/page.tsx` | English form labels (`Reserve, RUB`, `Estimated, RUB`, `Settlement note`) + placeholders (`Reserve rationale, evidence notes...`, `Settlement, deductions, recovery notes...`) + row labels (`Settlement:`, `Evidence:`) + evidenceValue fallback (`N item(s)`, `provided`, `Attachment N`) | Fixed (Wave-bugs-2) — RU + pluralization (`элемент/элемента/элементов`) | Operational-pages walkthrough |
| B-41 | P2 | `apps/web/src/app/dispatcher/components/CockpitRightPanel.tsx:198` | Строка "Cold chain OK" в RU cockpit | Fixed (Wave-bugs-2) — "Холодовая цепь — норма" | Operational-pages walkthrough |
| B-42 | P3 | `apps/web/src/app/dispatcher/components/CockpitTopBar.tsx:150` | `aria-label="Toggle theme"` на RU UI — screen reader читал по-английски | Fixed (Wave-bugs-2) — "Переключить тему" | Operational-pages walkthrough |
| B-43 | P2 | `apps/web/src/app/admin/demo/page.tsx` | `iconTone="indigo"` (другие PageHeader используют `brand`) + info-banner `bg-blue-50` (другие используют `sky-*`) — palette divergence | Fixed (Wave-bugs-2) — brand + sky | Admin-pages walkthrough |
| B-44 | P3 | `apps/web/src/app/admin/demo/page.tsx` + `apps/web/src/app/admin/compliance/page.tsx` | Dead imports: `Loader2` (demo), `FileText` (compliance) | Fixed (Wave-bugs-2) | Admin-pages walkthrough |
| B-45 | P3 | `apps/web/src/app/admin/audit-log/page.tsx` | aria-label="Раскрыть" одинаковый независимо от open state | Fixed (Wave-bugs-2) — динамический aria-label + aria-expanded | Admin-pages walkthrough |
| B-46 | P2 | `apps/web/src/components/auth-split-layout.tsx:51` + `:97` | `w-4.5 h-4.5` не в default Tailwind spacing scale — иконка коллапсировала. Плюс `aria-hidden={!rightPanel}` инвертирован (decorative panel всегда aria-hidden) | Fixed (Wave-bugs-2) — `w-[18px] h-[18px]` + `aria-hidden="true"` | Public-funnel walkthrough |
| B-47 | P2 | `apps/web/src/app/signup/verify/page.tsx:166` | `navigator.clipboard.readText()` без проверки existence — TypeError на Safari < 13.4 / insecure HTTP / Firefox без permission | Fixed (Wave-bugs-2) — guard `navigator.clipboard?.readText` + warning toast | Public-funnel walkthrough |
| B-48 | P2 | `apps/web/src/app/signup/page.tsx:237` | `setErrors({ email: ... })` стирает остальные field errors при server-side email-exists ошибке | Fixed (Wave-bugs-2) — `setErrors(prev => ({ ...prev, email: ... }))` | Public-funnel walkthrough |
| B-49 | P3 | `apps/web/src/app/admin/layout.tsx` | Вложенный `sticky top-0` внутри уже-sticky aside (header sticky не работает — aside сам прокручивается). Плюс header использовал `bg-indigo-50` вместо `bg-brand-50` для tile | Fixed (Wave-bugs-2) — убран inner sticky + brand tone | Admin-pages walkthrough |
| A-P0-1 | P0 | `apps/api/src/modules/billing/routes.ts:147-162` + `service.ts:218-350` + migration `0026` | ЮKassa webhook не проверял HMAC и не имел replay protection. Любой мог POST'нуть `payment.succeeded` для pending payment'а и активировать подписку | Fixed (deep audit) — HMAC-SHA256 verification против raw body + `YOOKASSA_WEBHOOK_SECRET`, 401 на mismatch, 503 в проде без env. Replay dedupe через `payments.provider_metadata.lastWebhookEventId` (JSONB column в 0026) | Deep audit 2026-05-12 |
| A-P0-2 | P0 | `apps/api/src/providers/base.ts:58-75` | `getKey()` молча возвращал `sha256("tms-dev-credentials-key")` если `CREDENTIALS_KEY` не задан. В проде → все AES-256-GCM credentials публично дешифруются. Плюс "hash anything" fallback скрывал короткие ключи-опечатки | Fixed (deep audit) — fail-fast throw в `NODE_ENV=production`. Loud warning в dev. Refuse short / non-32-byte keys (raise помогает обнаружить typo). Dev fallback переименован в "tms-dev-credentials-key-DO-NOT-USE-IN-PROD" | Deep audit 2026-05-12 |
| A-P0-3 | P0 | `apps/api/src/auth/auth.ts:752` + `modules/onboarding/routes.ts:282` | `Math.random()` для 6-значного email verification кода и для bulk-invite temp паролей. V8 PRNG предсказуема. Combined with 5-attempt rate limit per IP (не per-email) → brute-force окно signup admin'а реалистично | Fixed (deep audit) — `crypto.randomInt(100000, 1000000)` для кодов, `crypto.randomBytes(12).toString('base64url')` (~96 бит) для temp passwords | Deep audit 2026-05-12 |
| A-P0-7 | P0 | `apps/api/src/server.ts` | Нет `app.setErrorHandler()`. Default Fastify echo'ил `err.message` в проде, включая PG constraint text. Плюс request-id отсутствовал в response | Fixed (deep audit) — global error handler: 4xx forward as-is, 5xx → generic "Внутренняя ошибка сервера" в проде + `requestId` в каждом response | Deep audit 2026-05-12 |
| A-P0-13 | P0 | `apps/api/src/modules/onboarding/routes.ts:271-292` | Bulk-invite возвращал `{ email, tempPassword }` в response body. Браузер админа, history, любой monitoring proxy хранили пароли в plaintext | Fixed (deep audit) — response теперь `{ invitedCount, failedToEmail }`. Пароли только через email-delivery | Deep audit 2026-05-12 |
| A-P1-1 | P1 | `apps/api/src/server.ts:38-48` | Pino logger без `redact`. `/auth/login` body с plaintext password, `/integrations/credentials` POST с API ключами логировались на info уровне через default Fastify request logger | Fixed (deep audit) — `redact` paths: authorization/cookie/set-cookie headers, body.password/credentials/apiKey/token/tempPassword | Deep audit 2026-05-12 |

## Stats

- **Total IDs:** 49 B-* (UI walkthrough) + 40 A-* (deep audit P0/P1).
- **B- by severity:** P0×1, P1×14, P2×21, P3×13. **All B-* fixed.**
- **A- (deep audit):** P0×13 + P1×27 + P2/P3 cluster. **All P0, P1, and the actionable P2/P3 items from the deep audit are closed.** Remaining future-work (JWT refresh tokens, split trips.tsx 3K LOC, react-query migration, full mobile/web component-test coverage) is documented as architecture backlog in `docs/operations/audit-2026-05-12-deep.md`.
- Closure commits: `8bab538` (first P0 wave) → `3138a4b` (provider registry + multi-tenancy + 5 parallel agents) → `d949c25` (52 critical-path tests + CI gate hardening) → `b9addc8` (closure status) → post-P0/P1 P2/P3 wave (4 parallel agents). Total: 192/192 tests pass; tsc clean on api+web+mobile.
- **By discovery:**
  - Original audit (2026-05-10): B-16 partly.
  - UI walkthrough Round 5: B-1 → B-17 (16 issues).
  - Internal debt review Round 6: B-19, B-20, B-21, B-16 final.
  - Cockpit v2 walkthrough: B-22.
  - DataTable Phase 2 walkthrough: B-23 → B-33 (11 issues).
  - Wave-bugs-2 (post-Detail/Settings): B-34 → B-49 (16 issues, parallel-agent walkthrough of admin / operational / public-funnel clusters).

## Patterns observed

1. **English engine-emitted strings leaking to UI** — biggest single pattern, 12+ распространённых случаев (B-4, B-5, B-15, B-17, B-22, B-27, B-30, B-31, B-32, B-33, B-34, B-35, B-40, B-41, B-42). Mitigation: every new error path должна иметь RU label или mapping table; pre-merge grep for `English string` patterns in user-facing pages.
2. **Mojibake from cp1251 mis-encoding** — B-4, B-19. Likely from older spreadsheet imports. Mitigation: explicit `<meta charset>` + content-type checks at import boundaries.
3. **Long string truncation** — B-10, B-13, B-20, B-25, B-29. Mitigation: design tokens for typography + `title=` everywhere we shorten.
4. **No-organization edge cases** — B-14, B-30. Seed admin users без `org_id` хорошо обнажают плохо-обработанные null paths. Mitigation: synthetic-Free-plan pattern, audit все `requireOrgId()` calls.
5. **DB triggers vs feature add** — B-1. Append-only triggers conflict с новыми UPDATE-paths. Mitigation: triggers должны быть column-aware (`IS NOT DISTINCT FROM` per column) когда новые fields добавляются.
6. **PRNG predictability** — A-P0-3. `Math.random()` для email-verify кодов и bulk-invite temp паролей. V8 PRNG предсказуема. Mitigation: `crypto.randomInt` / `crypto.randomBytes` для всех security-sensitive значений; lint-правило против `Math.random()` в auth/onboarding paths.
7. **Multi-tenancy gaps в pre-multitenancy таблицах** — A-P0-12. Часть ранних таблиц (orders, vehicles, drivers, etc.) не имели `organization_id` и были до-исправлены позже. Mitigation: schema review checklist «у новой таблицы должен быть organization_id + индекс + RLS-like guard в сервисном слое».
