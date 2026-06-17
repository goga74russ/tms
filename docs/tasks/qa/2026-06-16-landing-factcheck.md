# QA fact-check — лендинг-копи v2.3 (публикация-gate §10.2.bis)

- **Роль:** QA
- **Дата:** 2026-06-16
- **HEAD:** `f5194a9` (main)
- **Контекст:** ТЗ `docs/tasks/transpult/2026-06-16-landing-rework.md` §8 строка `/qa` + §10.2.bis. Три claim'а на лендинге зависят от факта; без проверки = риск недостоверной рекламы (38-ФФ «О рекламе», ФАС).
- **Метод:** проверка по коду/конфигам/миграциям (read-only). Живой БД-дифф недоступен — Docker-стек на момент проверки остановлен (демон недоступен); там, где нужна БД, использован миграционный след как прокси (миграции = то, что применяется к БД).

## Итог: 2 закрыто, 1 закрыто с оговоркой по формулировке. **RBAC — НЕ закрыт.**

> ⚠️ Поправка к ТЗ: строка `/qa` в §8 как сплошной «✅ fact-check» — **неточна**. Корректно: **Q1 ✅, Q2 ❌ (RBAC sweep открыт), Q3 ✅ по дрейфу + ⚠️ по слову «append-only».** Строку §8 правит TransPult/Partner (не трогаю чужой ТЗ).

| # | Вопрос | Вердикт | Что писать в копи |
|---|---|---|---|
| 1 | iOS — только Android в проде? | ✅ **Да, Android-only** | §2.3 «только Android, iOS — в дорожной карте» достоверно |
| 2 | RBAC sweep закрыт? | ❌ **Нет** | §2.4 — RBAC НЕ упоминать до закрытия sweep'а |
| 3 | events schema-drift закрыт? | ✅ **Дрейфа нет** | §2.4 «журнал событий» — OK; «append-only / неизменяемый / крипто-версионность» — НЕ писать |

---

## Q1 — iOS только Android в проде? → ✅ ПОДТВЕРЖДЕНО (Android-only)

**Доказательство:**
- `apps/mobile/eas.json`: профили `preview` и `production` содержат **только `android`** (production → `app-bundle`, `distribution: store`). iOS присутствует ТОЛЬКО в профиле `development` (`ios.simulator:false` — локальная разработка), submit-конфиг `production: {}` пуст.
- `apps/mobile/app.json`: есть блок `ios` (bundleId `ru.transpult.driver`, buildNumber 1) — но это конфиг, не релиз; в прод-сборку (eas preview/production) iOS не входит.

**Вывод:** iOS в прод НЕ собирается. Копи §2.3 «только Android, iOS в дорожной карте» — **достоверно**.

**⚠️ Вторичная оговорка (для Marketing):** `version: 0.1.0`, `versionCode: 1`, `submit.production: {}` пуст — даже Android, вероятно, ещё не опубликован в Google Play. Не писать «уже доступно в Google Play» / «скачайте в Play Market», если публичного релиза нет. Формулировка «мобильное приложение водителя (Android)» — безопасна.

## Q2 — RBAC sweep закрыт? → ❌ НЕ ЗАКРЫТ

**Доказательство (`docs/qa/remediation-tracker.md`):**
- `:164` `[ ] P1` cold-chain/routes.ts:44-188 — нет RBAC-гейта вообще.
- `:171` `[ ] P1` orders/routes.ts — driver видит все заявки орг (within-org over-exposure) → «Вынести в отдельный RBAC-проход».
- `:178` `[ ] P1` repair/page.tsx — полный список юзеров орг в браузер → «Вынести в RBAC-проход».
- Плюс `docs/qa/code-audit-2026-06-14.md`: P1 `server.ts:221` (обход rate-limit на auth), находки web/admin.

**Вывод:** выделенный RBAC sweep (Опция 2) открыт. Бриф-⚠️ верен. §2.4 — **RBAC из копи убрать**, вернуть только после закрытия sweep'а и повторного fact-check.

## Q3 — events schema-drift закрыт? → ✅ ДРЕЙФА НЕ НАЙДЕНО (с оговоркой по «append-only»)

**Доказательство:**
- `drizzle-kit check` → «Everything's fine» (журнал миграций консистентен).
- Миграционный след `events` полностью сходится со `apps/api/src/db/schema.ts:1144-1171`:
  - `drizzle/0000_full_schema.sql:144` CREATE TABLE events (+ external_id, unique idx_events_external_id),
  - `drizzle/0027_multitenancy_backfill.sql:26` ALTER events ADD organization_id,
  - `drizzle/0030_cascade_to_restrict.sql:33-35` org FK → RESTRICT (= комментарий schema.ts «B7.1 migration 0030»),
  - `drizzle/0039_...sql:26-28` DROP idx_events_external_id → CREATE per-org `(organization_id, external_id)` (= комментарий schema.ts «C9 синхрон с 0039»).
- `drizzle-kit generate` показывает diff, но это **невалидный сигнал** здесь: meta-снапшоты заморожены на 0027, миграции 0028+ пишутся вручную (BEGIN/COMMIT, русские шапки) — drizzle-kit meta-workflow не ведётся. Не считать за дрейф.

**Вывод:** дрейфа на `events` нет; бриф-⚠️ устарел (к HEAD `f5194a9` реконсиляция мигрирована).

**⚠️ Оговорка по «append-only»:** на таблице `events` НЕТ DB-триггера запрета UPDATE/DELETE — append-only-триггер существует только для инспекций (`drizzle/0025_inspection_decision_trigger.sql`, bug-tracker B-1). Неизменяемость журнала держится на конвенции приложения + `onDelete:restrict`, не на жёстком DB-enforce. Хеш-цепочки («криптографическая версионность») в схеме нет (есть только `version int`). → §2.4: «журнал событий» писать можно; «**append-only / неизменяемый журнал / криптографическая версионность**» — **overclaim, не писать** (если нужно — отдельная задача TransPult на DB-триггер + повторный fact-check).

---

## Остаточная проверка (не блокер)
- Живой БД-дифф `\d events` ↔ schema.ts не выполнен (Docker-стек остановлен на момент проверки). Миграционный след — достаточный прокси. При желании добить одной командой `psql -c "\d events"` после подъёма стека.

## Влияние на публикация-gate
- Gate по §2.3 (мобила) — **снят** (Q1 ✅), при условии что Marketing не пишет «в Google Play» без релиза.
- Gate по §2.4 (безопасность): «журнал событий» + «серверы в РФ» + «шифрование TLS» (если TLS подтверждён отдельно) — OK; **RBAC и «append-only/неизменяемый» — исключить из копи**.
- Оставшийся публикация-блокер (не QA): Marketing §4.3 (FAQ про конкурентов).

## Cross-role
- [x] QA — 2026-06-16, fact-check выполнен (этот файл — источник истины)
- [ ] TransPult — учесть в копи §2.3/§2.4; поправить строку §8 ТЗ на Q1✅/Q2❌/Q3✅⚠️
- [ ] Marketing — §2.3 без «в Google Play»; §2.4 без RBAC/«append-only»
