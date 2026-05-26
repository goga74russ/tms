# Объединённый аудит TMS-prod — обновлено 2026-05-26 (ночь, после W3 T-13)

**Источники:** PM (продуктовый), TransPult (технический), Jurist (юридический).
**HEAD:** `2502963` (после W3 T-13 МЧД UI доводка).
**До 01.09.2026:** 97 календарных дней.
**Последнее обновление:** W3 partial — T-13 МЧД UI alignment с Jurist J-1 + demo seed. T-9/T-7 откладываются в отдельные фокус-сессии (T-9 требует wiring HTTP endpoints).

---

## §1 TL;DR — что изменилось после W1

После W1 Sprint (5 коммитов · 1 миграция · 0 откатов · all green в проде):

1. **🟡 Provider drought (PM)** — не изменилось: 0 real-провайдеров. Все throw `NotImplemented`. План реализации — поэтапно в W3+.
2. **🔴 Внешняя юр-инфраструктура** — не изменилось: ООО не зарегистрировано, РКН не уведомлён. Зависит от Founder F-1.
3. **🟢 Технические долги — частично закрыты в W1:**
   - ✅ AI-копилот за feature-flag (404 в проде → разблокировал Jurist J-3)
   - ✅ 5 FK indexes добавлены (миграция 0037 в проде)
   - ✅ PII redact для phone/passport/inn/snils/driverLicense
   - ✅ bulk-pdf N+1 → 3-4 batch queries
   - ✅ Wialon UI jurisdiction banner
   - ✅ Версионированный deploy flow (scripts/deploy.sh + .ps1)
   - ⏸ RBAC sweep (T-7) отложен в W2 — нужна role-by-role smoke-сессия

Готовность к платящему клиенту: **~45%** (юр-метрика). Технический контур и бизнес-логика — зрелые и безопаснее. **Внешние границы продукта** (провайдеры) + **внешняя юридическая регистрация** — по-прежнему главный gap.

---

## §2 Что закрыто (по зонам, кумулятивно)

### TransPult — за 2 недели + сегодня + W1 Sprint

| Категория | Закрыто |
|---|---|
| Security/Auth fixes (deep audit A-серии) | A3-A6, B1, B2, B4, C1, C3 + 7.18-7.20 (anti-spoofing, HMAC, cross-tenant, race) |
| Audit batches B/C/D + 7.x | 25+ findings |
| QA-cycle | F1+F2 (org-scoping seed, Playwright multi-role) |
| **G** (16ec4f3) | разморозка QA: lot_assignments auto-create + cold-chain URL + /orders page + sidebar wiring |
| **I** (d6fb8db) | проверка кубов (vehicle capacity) + override через journal |
| **J1+L** (fa5c18f + f3e014b) | tax_regime fundament (8 значений) + usn_vat_rate (244-ФЗ) + Carriers-0 foundation |
| **K** (0a6d547) | customer_price + carrier_cost + margin + RBAC по финансам |
| **M** (3d04e14) | invoice schema rebuild — 7-enum + invoice_orders junction + FSM + DB-triggers + invoice_history |
| **N** (3791fb2) | UI двусторонняя навигация invoice ↔ orders |
| **O** (371329d) | PDF-шаблоны СФ/УПД/КСФ/ИСФ по ПП РФ 1137 |
| **W1 Sprint** (f0ed26a → 7e23006) | AI flag · FK indexes 0037 · PII redact · bulk-pdf N+1 · Wialon banner · deploy.sh + deploy.ps1 |
| **W2 partial** (ac3c5d1 + 8ac3cc7) | **T-12** Unisender real (15 unit-тестов) · **T-5** DPA-step gate в StepEdi+StepSignature |
| **W2 drift fix** (e971441) | /legal/{privacy,terms} читают .md → MarkdownView · markdown-parser server-safe · Dockerfile COPY · .dockerignore exceptions |
| **W3 partial** (2502963) | **T-13** МЧД UI доводка: info-banner с КЭП-моделью per J-1 · подсказка в форме создания · seed 1 active + 1 expired МЧД |

**Накопительно за сессию: 19 коммитов, 5 миграций (0033-0037), 0 откатов, 5 деплоев в проде. Прод на `e971441` (W3 ожидает деплой).**

### Jurist — за неделю с deep-audit 23.05 + W1 (вечер 26.05)

| Артефакт | Статус |
|---|---|
| 6 DPA для провайдеров (`docs/legal/dpa/`) | ✅ |
| Privacy Policy v1.1 — §7 переписан | ✅ |
| Согласие водителя на Госключ | ✅ |
| `docs/legal/invoice-spec.md` | ✅ |
| Юр-пакет ЭТрН (10 файлов в `docs/legal/etrn/`) | ✅ |
| DPA «Клиент ↔ TMS» (документ 99) | ✅ |
| **W1 J-1** — Исправлены КЭП-формулировки в 05/08 + унификация МЧД normativki | ✅ (commit `4071930`) |
| **W1 J-2** — Terms of Service v1.1 (новые §2/§7/§8/§13, cap 1мес→12мес) | ✅ (commit `4071930`) |
| **W1 J-7** — Privacy Policy v1.2 — §6 переписан, 6 подразделов со сроками | ✅ (commit `4071930`) |
| **W1 J-8** — Acceptance подписи M+O batch'ей | ✅ (commit `4071930`) |

**Закрыто 8 из 12 P0 deep-audit + 6 self-discovered.** В W1 Jurist закрыл 4 блокера TransPult'а — разблокированы T-13 (МЧД UI) и T-5 (DPA-step UI).

### PM-аудит — что устарело (актуализация после W1)

| PM-аудит говорил | После моих G→O+W1 |
|---|---|
| GAP-LOT-SETUP открыт | ✅ закрыт G1 |
| GAP-COLD-CHAIN-ROUTES не работает | ✅ закрыт G2 |
| BUG-DISP-001 sidebar broken | ✅ закрыт H5 |
| Schema overshoot — invoices не структурирован | ✅ закрыт M (новый schema) |
| UI invoice ↔ orders отсутствует | ✅ закрыт N |
| PDF-шаблоны нет | ✅ закрыт O |
| tax_regime — gap | ✅ закрыт J1+L |
| Pricing нет | ✅ закрыт K |
| Этапы 3-6 из invoice-spec — backlog | ✅ закрыто M+N+O |
| **AI-копилот без DPA** | ✅ **W1 T-0** скрыт за фичефлагом (404 в проде) |
| **Missing FK indexes** | ✅ **W1 T-10** миграция 0037 |
| **bulk-pdf N+1** | ✅ **W1 T-8** batch fetch (~150 queries → 3-4) |
| **PII в логах** | ✅ **W1 T-3** pino redact |
| **Wialon юрисдикция UX** | ✅ **W1 T-23** banner в credential modal |

**Большая часть PM-product-gap'ов закрыта.** Главное что осталось: provider drought + email Unisender + Mobile (driver) + RBAC sweep + UI-полировки.

---

## §3 Не закрыто — единая дорожная карта

Объединил находки из всех трёх аудитов, убрал дубли. **3 категории по приоритету.**

### 🔴 P0 — блокеры платящего клиента (до 01.09.2026)

**Зона: Founder (не делегируется)**

| # | Долг | Часов | Кто | Зависимость |
|---|---|---|---|---|
| F-1 | **Регистрация ООО** — обращение к бухгалтеру/юристу, подача в ИФНС | 3 раб. дня | Гоша + бухгалтер | Гейт для всего платного flow |
| F-2 | **Уведомление РКН (форма Р-1)** | 0.5 дня | Гоша | После F-1 |
| F-3 | Решение о выборе УСН-режима для ООО | до F-1 | Гоша + Jurist | — |
| F-4 | PoL probes (15 звонков) | эта неделя | Гоша | — |

**Зона: Jurist (юридическая)**

| # | Долг | Часов | Кто | Статус |
|---|---|---|---|---|
| ~~J-1~~ | ~~Исправить документы 05/08 ЭТрН — формулировки КЭП физлица~~ | 1-2h | Jurist | ✅ **W1 done** (4071930) |
| ~~J-2~~ | ~~Update Terms of Service — ЭПД + AI disclaimer + cap 12 мес~~ | 1 день | Jurist | ✅ **W1 done** (4071930) |
| ~~J-3~~ | ~~AI-копилот DPA~~ | — | — | ⏸ Заморожен — W1 T-0 фичефлаг off |
| J-4 | **Внутренние документы оператора ПДн** — приказ, регламент, перечень мест хранения, журнал обращений | 2-3 дня | Jurist | W2 |
| J-5 | **Подготовка к регистрации ООО** — чек-лист, форма Р-1, mapping ИП→ООО, выбор УСН-режима | 1 день | Jurist | W2 — Founder F-1 blocker |
| J-6 | **Cookie-policy + согласие на маркетинг** | 0.5 дня | Jurist | P1 — если лендинг |
| ~~J-7~~ | ~~Privacy Policy §6 — сроки хранения МЧД, журналов подписаний~~ | 0.5 дня | Jurist | ✅ **W1 done** (4071930) v1.2 |
| ~~J-8~~ | ~~Acceptance подписи `invoice-spec-acceptance-M.md` + `-O.md`~~ | 0.5 дня | Jurist | ✅ **W1 done** (4071930) |

**Зона: TransPult (мои технические долги)**

| # | Долг | Часов | Статус |
|---|---|---|---|
| ~~T-0~~ | ~~AI-копилот state check + UI hide~~ | 30min | ✅ **W1 done** (f0ed26a) |
| T-2 | Cross-tenant event-leak fix (`events/journal.ts:100`) | 2h | ⏸ W3 — нужно расследование |
| ~~T-3~~ | ~~Pino redact для PII водителей~~ | 1h | ✅ **W1 done** (ec14b90) |
| T-4 | Alerting на `pending_review` документы | 4h | W3 |
| ~~T-5~~ | ~~DPA-step UI при подключении интеграций (StepEdi+StepSignature)~~ | 4h | ✅ **W2 done** (8ac3cc7) |
| T-6 | mailru SMTP — `requires_acceptance: false` info-banner | 1h | W3 (после T-5 готов) |
| T-7 | 50+ endpoints `requireAbility()` | 6-8h | ⏸ W3 — нужна role-by-role smoke session |
| ~~T-8~~ | ~~`/finance/invoices/bulk-pdf` N+1 → batch fetch~~ | 1h | ✅ **W1 done** (ec14b90) |
| T-9 | invoices unit-tests (createDraft/issue/correction/payment/cancel) | 4h | ⏸ W3 — мой долг, mock-pattern требует разбора |
| ~~T-10~~ | ~~Missing FK indexes — миграция 0037~~ | 30min | ✅ **W1 done** (f0ed26a + applied in prod) |
| ~~T-11~~ | ~~Full test suite~~ | 1h | ✅ **W1 done** (baseline: 705+199 tests, 8 skip с FIXME) |
| ~~T-12~~ | ~~Email-провайдер (Unisender real impl + 15 тестов)~~ | 1 день | ✅ **W2 done** (ac3c5d1) |
| ~~T-13~~ | ~~МЧД UI alignment с J-1 + seed demo~~ | 4-6h | ✅ **W3 done** (2502963) |

### 🟧 P1 — после пилота, но до коммерческого релиза

**Зона: TransPult**

| # | Долг | Часов |
|---|---|---|
| T-14 | **5-day SF warning** (spec §6) — BullMQ job + admin dashboard «СФ с просрочкой выпуска» | 6h |
| T-15 | `/finance/invoices/bulk-generate` без LIMIT — pagination/chunks | 1h |
| T-16 | N4 UI — модалы invoice workflow (issue/correction/payment/cancel) | 6h |
| T-17 | N5 — колонка «Маржа» в /trips таблице | 2h |
| T-18 | BUG-DISP-002 (vehicle auto-select UX) | 2h |
| T-19 | BUG-FINANCE-001 (кнопка «Создать счёт по рейсам» не открывает форму) | 2h |
| T-20 | forgot-password real flow — сейчас stub | 3h |
| T-21 | Мёртвые кнопки в UI — FinesTable, PermitsTable, billing, repair Kanban | 4h |
| T-22 | drivers HOS bulk endpoint — убрать N+1 | 2h |
| ~~T-23~~ | ~~Wialon UI — banner про юрисдикцию~~ | 1h | ✅ **W1 done** (ec14b90) |
| T-24 | XSD валидация через `xmllint-wasm` (вместо regex) | 1 день |
| T-25 | `/finance/kpi` aggregations — combine 5 SUM/COUNT queries в 1-2 | 2h |
| T-27 | E2E полный invoice flow smoke (issue→pay→correction) | 1h |

### 🟨 P2 — continuous improvement

| # | Долг | Часов |
|---|---|---|
| T-28 | 20+ provider скелетов — поэтапная реализация по 1-2 в спринт | 1-2 недели per провайдер |
| T-29 | Минимум 1 платёжный провайдер (ЮKassa первая) | 3-4 недели |
| T-30 | Минимум 1 ЭДО-оператор (Diadoc) — до 01.09 | 3-4 недели |
| T-31 | Минимум 1 КЭП-провайдер (Госключ для ИП) — до 01.09 | 3 недели |
| T-32 | Атракс (если у пилот-клиента) | 1 неделя |
| T-33 | СКЗИ tachograph reader (`ddd-parser.ts`) | 1-2 недели |
| T-34 | Type-safety — убирать 41× `as any` точечно | continuous |
| T-35 | Mobile тесты (0 сейчас) — smoke на login + ключевые экраны | 1 день |
| T-36 | operational-core тесты (9 файлов без покрытия) | 2 дня |
| T-37 | JWT refresh/revocation (24h hardcoded) | 1 день |
| T-38 | RepairKanban migration на `<KanbanBoard>` (1,397 LOC deprecated) | 1 день |
| T-39 | Mock telematics marker в `/dispatcher` — «demo data» | 30min |
| T-40 | DEPRECATED поля удалить в миграции 0040+: `trips.carrier_cost`, `invoices.contractor_id`, `invoices.tripIds[]` | 2h |
| T-41 | Mobile lint config добавить | 1h |
| T-42 | `docs/operations/monitoring/alert-rules.md` — 6 TODO для Prometheus | 1 день |
| T-43 | Carriers-1..4 UI (страница /carriers + переключатели) | 17h |
| T-44 | R1 Research — Диадок proxy-OAuth к Госключу | 1 день |
| T-46 | **Gosklyuch callback test mock** — починить 7 skipped (db.transaction mock pattern) | 2-4h |
| T-47 | **Login 401 redirect test** — fix jsdom navigation (api.ts:87) | 1h |
| T-48 | **docs/architecture/migrations.md** — правило BEGIN/COMMIT обёртка для атомарности | 30min |
| T-49 | **ALLOW_INITIAL_SCHEMA env** в deploy.sh — для clean dev/staging | 30min |

---

## §4 Зависимости между зонами

```
Founder F-1 (ООО)
  ├─→ Founder F-2 (РКН-уведомление)
  ├─→ Jurist J-5 (подготовка к ООО)
  └─→ TransPult mapping ИП→ООО в коде (1h, после регистрации)

Jurist J-1, J-7 (ЭТрН доки + retention)
  └─→ требует TransPult T-13 (МЧД UI) с правильными формулировками

TransPult T-5 (DPA-step UI)
  └─→ Jurist J-1, J-2 готовы (DPA-тексты уже есть)

Jurist J-8 (Acceptance M+O)
  └─→ требует Jurist review кода M-batch + O templates
```

**После W1 + Jurist sync главного риска (AI-копилот без DPA) больше нет** — флаг скрыт, J-3 заморожен.
**После Jurist sync** разблокированы у TransPult:
- T-13 МЧД UI (был блокирован J-1 + J-7 — оба готовы)
- T-5 DPA-step UI (DPA-99 + 6 текстов + J-2 ToS готовы)

**Текущий главный риск**: Founder F-1 не стартовал.

---

## §5 Что я (TransPult) беру на себя дальше

### ✅ W1 Sprint закрыт

| # | Задача | Коммит |
|---|---|---|
| T-0 | AI flag off | f0ed26a |
| T-10 | Migration 0037 (FK indexes) | f0ed26a |
| T-11 | Full test suite baseline | f0ed26a |
| T-3 | pino PII redact | ec14b90 |
| T-8 | bulk-pdf N+1 fix | ec14b90 |
| T-23 | Wialon RU banner | ec14b90 |
| — | docs/product/sprint-w1-acceptance.md | 3273dd5 |
| — | scripts/deploy.sh + deploy.ps1 | 9201c94, 7e23006 |

### ✅ W2 закрыт

| # | Задача | Коммит | Что внутри |
|---|---|---|---|
| T-12 | Unisender real impl | ac3c5d1 | Реальный fetch к api.unisender.com, 15 unit-тестов, env-фабрика, registry wiring, form-urlencoded body, error mapping |
| T-5 | DPA-step gate в онбординге | 8ac3cc7 | Helper `lib/dpa.ts` (fail-open). StepEdi + StepSignature: DPA-check перед persistChoice |
| — | Drift fix /legal страниц | e971441 | MarkdownView client + markdown-parser server-safe. Privacy/Terms pages теперь Server Components: fs.readFileSync .md → MarkdownView. Dockerfile COPY + .dockerignore exceptions. Verified на проде: v1.2/v1.1 контент рендерится. |

### ✅ W3 partial закрыт

| # | Задача | Коммит | Что внутри |
|---|---|---|---|
| T-13 | МЧД UI доводка | 2502963 | UI banner про КЭП-модель per Jurist J-1; подсказка в форме «Поверенный»; seed 1 active + 1 expired МЧД для демо |

### W4 Sprint — приоритеты

| # | Задача | Часов | Почему важно |
|---|---|---|---|
| T-9 | invoices unit-tests + HTTP wiring | 8-12h | M-batch service-layer готов, но не привязан к routes. Полный scope = endpoints + integration tests. Требует фокус-сессию. |
| T-7 | RBAC sweep (50+ endpoints) | 6-8h | Нужна role-by-role smoke session |
| T-2 | Cross-tenant event-leak | 2h | Нужно расследование scope-filter в /events |
| T-25 | KPI aggregation combine | 2h | Perf, не блокер |
| T-14 | 5-day SF warning | 6h | BullMQ job + dashboard |
| T-4 | Alerting pending_review | 4h | После DevOps coord |
| T-48 | docs/architecture/migrations.md | 30min | Правило BEGIN/COMMIT (по ревью партнёра) |

**Итого моя зона на W4: ~30-35 часов.**

---

## §6 Что нужно передать Jurist'у

| # | Задача | Зачем | Статус |
|---|---|---|---|
| ~~J-1~~ | ~~Исправить документы 05/08 ЭТрН (КЭП физлица формулировки)~~ | Юр-точность, блокер T-13 | ✅ **W1 done** (4071930) |
| ~~J-2~~ | ~~Update ToS — раздел ЭПД + AI disclaimer + cap 12 мес~~ | Синхронизация с DPA-99 | ✅ **W1 done** (4071930) v1.1 |
| ~~J-3~~ | ~~AI DPA~~ | ⏸ Заморожен (W1 T-0 — флаг off) | — |
| J-4 | Внутренние документы оператора ПДн (5 артефактов) | Регуляторный долг | **W2** |
| J-5 | Чек-лист регистрации ООО + форма Р-1 + mapping ИП→ООО | Подготовка для Founder | **W2** — приоритет, F-1 blocker |
| J-6 | Cookie-policy + согласие на маркетинг | Если будет лендинг | P1 |
| ~~J-7~~ | ~~Privacy Policy §6 — сроки хранения МЧД и журналов~~ | Блокер T-13 | ✅ **W1 done** (4071930) v1.2 |
| ~~J-8~~ | ~~Acceptance подписи `invoice-spec-acceptance-M.md` + `-O.md`~~ | Закрытие моего M+O долга | ✅ **W1 done** (4071930) |

---

## §7 Что нужно от Founder'а (не делегируется)

| # | Задача | Когда |
|---|---|---|
| F-1 | Регистрация ООО через бухгалтера/юриста | На этой неделе |
| F-2 | Подача формы Р-1 в РКН | После F-1 |
| F-3 | Решение о выборе УСН-режима для ООО | До F-1 (с Jurist) |
| F-4 | Запустить PoL probes (15 звонков) | Эта неделя |

**Без F-1+F-2 платящего клиента невозможно завести юридически.**

---

## §8 Главные риски (после W1 + Jurist sync)

| Риск | Severity | Митигация |
|---|---|---|
| ~~AI-копилот в проде без DPA~~ | ✅ Снят | W1 T-0 — фичефлаг off в проде, 404 на /api/copilot/* |
| ~~КЭП-формулировки в юр-доках устарели~~ | ✅ Снят | Jurist J-1 — модель КЭП обновлена под ФЗ-476 |
| ~~ToS без раздела ЭПД и AI~~ | ✅ Снят | Jurist J-2 — ToS v1.1 + cap 12мес |
| ~~Privacy Policy без сроков хранения МЧД~~ | ✅ Снят | Jurist J-7 — PP v1.2 §6 |
| ~~M+O batch без acceptance~~ | ✅ Снят | Jurist J-8 — подписи на M (3d04e14) + O (371329d) |
| **Provider drought** — pilot выяснит что real ЮKassa/Госключ/Диадок не работают | 🔴 P0 | T-12 (email) первым в W2, потом ЮKassa+Diadoc+Госключ параллельно |
| **Регистрация ООО не стартовала** — окно до 01.09 (97 дней) сужается | 🔴 P0 | F-1 на этой неделе обязателен; J-5 поможет с чек-листом |
| **0 unit-тестов на invoices service-методы** — регрессия проедет в pilot | 🟧 P1 | T-9 в W2, заодно разобрать mock-pattern (T-46, T-47) |
| **50+ endpoints без requireAbility** — privilege escalation при изменении CASL | 🟧 P1 | T-7 — большой блок, отдельная W2 session с per-role smoke |
| **Drift между .md юр-доками и /legal/*.tsx страницами** | 🟨 P2 | W2: либо MDX-render, либо hand-port |
| ~~bulk-pdf N+1~~ | ✅ Снят | W1 T-8 — 3-4 batch queries |
| ~~Missing FK indexes~~ | ✅ Снят | W1 T-10 — миграция 0037 в проде |

---

## §9 Календарь до 01.09.2026

**97 дней. Распределение (актуализировано после W1):**

- **~~Неделя 1 (26.05-01.06)~~ — W1 факт:**
  - ✅ TransPult: T-0, T-3, T-8, T-10, T-11, T-23 + scripts/deploy
  - ✅ Jurist: J-1, J-2, J-7, J-8 (вечером 26.05)
  - 🔴 Founder: F-1 (старт ООО), F-4 (PoL probes) — **не стартовали**

- **~~Неделя 2 (02.06-08.06)~~ — W2 факт + deployed:**
  - ✅ TransPult: T-12 (Unisender real), T-5 (DPA-step в онбординге), drift fix /legal pages
  - ✅ Deploy в прод: e971441 — Jurist v1.2 PP и v1.1 ToS теперь видны на transpult.ru/legal/*
  - 🔴 Founder: F-1 — **не стартовал** (главный блокер календаря)
  - 🟡 Jurist: ждёт сигнал на W3 (J-5 ООО prep, J-4 внутренние доки)

- **Неделя 3 (09.06-15.06) — W3 partial факт:**
  - ✅ TransPult: T-13 МЧД UI доводка + seed (commit 2502963, ожидает deploy)
  - 🟡 T-9 invoices tests + wiring — обнаружено что service-layer не привязан
    к HTTP routes. Полный scope = 8-12h, требует фокус-сессию. → W4.
  - 🔴 Founder: F-1 — **не стартовал**
  - 🟡 Jurist: ждёт сигнал на J-5 (ООО prep)

- **Неделя 4 (16.06-22.06) — W4 (план):**
  - Founder: F-1 (срочно), F-3, F-4 (PoL probes)
  - Jurist: J-5 (ООО prep), J-4 (внутренние доки), J-6
  - TransPult: T-9 (invoice service tests + HTTP wiring), T-7 (RBAC sweep), T-2 (event-leak)

- **Неделя 3-4:**
  - TransPult: T-13 (МЧД UI), T-14 (5-day SF), T-2 (event-leak), ЮKassa или Diadoc первый
  - Jurist: J-4 (внутренние документы)
  - Founder: F-2 (РКН)

- **Недели 5-12:**
  - Параллельная реализация провайдеров
  - Pilot onboarding (5-10 клиентов)

**Оценка готовности к первому платящему:** конец июня — середина июля 2026 (~35-50 дней) — если Founder F-1+F-2 на этой неделе.

---

## §10 Метрики (обновлено после W1)

| Метрика | До W1 | W1 | Jurist | W2 | W2 deploy | **W3 partial** |
|---|---|---|---|---|---|---|
| Готовность к платящему клиенту (юр) | ~40% | ~45% | ~55% | ~60% | ~62% | **~65%** |
| P0 deep-audit закрыто | 4/12 | 4/12 | 8/12 | 9/12 | 9/12 | **9/12 (75%)** |
| P0 TransPult из списка | 0/13 | 6/13 | 6/13 | 8/13 | 8/13 | **9/13 (69%)** |
| P0 Jurist из списка | 0/7 | 0/7 | 4/7 | 4/7 | 4/7 | 4/7 |
| Тестов в проекте | 904 | 904 | 904 | 919 | 919 | **919** |
| Тестов в мобильном | 0 | 0 | 0 | 0 | 0 | 0 |
| Миграций в проде | 36 | 37 | 37 | 37 | 37 | **37** |
| Real-провайдеров работает | 0/28 | 0/28 | 0/28 | 1/28 | 1/28 | **1/28** |
| Commits в main за сессию | 8 | 13 | 14 | 16 | 17 | **19** |
| Deploy'ев в проде | 4 | 4 | 4 | 4 | 5 | **5** (W3 pending) |
| Rollback'ов | 0 | 0 | 0 | 0 | 0 | 0 |
| Юр-документы (markdown) | 6 | 6 | 17 | 17 | 17 | 17 |
| ToS версия | 1.0 | 1.0 | 1.1 | 1.1 | **1.1 prod** | 1.1 prod |
| Privacy Policy версия | 1.1 | 1.1 | 1.2 | 1.2 | **1.2 prod** | 1.2 prod |
| /legal source of truth | hardcoded | hardcoded | drift | drift | **single (md)** | single (md) |
| МЧД demo seed | 0 | 0 | 0 | 0 | 0 | **2 (1 active + 1 expired)** |
| МЧД UI per J-1 | drift | drift | drift | drift | drift | **aligned** |

**bulk-pdf queries (50 invoices):** было ~150 → стало 3-4
**FK indexes coverage:** было 5 hot FK без индексов → стало 0
**pino redact paths:** было 16 → стало 30+ (driver PII)
**AI exposure:** было live → 404

---

## §11 Что прошу решить от Founder'а (после W1)

**Q1 (срочно — на этой неделе).** Начинаешь регистрацию ООО (F-1)? Без неё календарь до 01.09 сужается. Бухгалтер/юрист на связи? Jurist подготовил `docs/legal/etrn/` + ждёт сигнал на J-5 (чек-лист ООО + форма Р-1).

**Q2 (срочно).** PoL probes (F-4) — 15 звонков. Согласен запустить параллельно техдолгам, или edge-кейс «по списку»?

**Q3 (W4 порядок).** W3 partial закрыл T-13 (МЧД доводка). Что первым в W4:
- (a) **T-9 invoice tests + wiring** (8-12h) — service-layer M-batch не привязан к HTTP routes, нужен полный scope: endpoints + integration tests. Фокус-сессия.
- (b) **T-7 RBAC sweep** (6-8h) — нужна role-by-role smoke session
- (c) **T-2 event-leak fix** (2h) — нужно расследование scope-filter
- (d) **T-25 KPI combine** (2h) — perf-win, не блокер
- (e) **T-48 migrations.md** (30min) — BEGIN/COMMIT правило по ревью партнёра

Рекомендую: (a) → (b) → (c). T-9 — закрытие моего M-batch долга, самое продуктивное. T-7 после — большой блок отдельной сессии. T-2 быстрый аудит-fix. T-48 в любой свободный окно.

**Q4 (Jurist W2).** Передать Jurist'у задачи W2: J-5 (приоритет — ООО чек-лист), J-4 (внутренние доки оператора), J-6 (cookie если лендинг)?

**Q5 (drift).** /legal/privacy и /legal/terms на web — hardcoded JSX (не пулят .md). Сейчас md = source of truth (для юр-актов это OK), но в W2: либо MDX-render, либо hand-port. Какой подход выбираешь?
