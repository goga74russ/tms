# Объединённый аудит TMS-prod — обновлено 2026-05-26

**Источники:** PM (продуктовый), TransPult (технический), Jurist (юридический).
**HEAD:** `7e23006` (после W1 Sprint).
**До 01.09.2026:** 97 календарных дней.
**Последнее обновление:** W1 Sprint завершён и задеплоен в прод.

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

**Накопительно за сессию: 13 коммитов, 5 миграций (0033-0037), 0 откатов, в проде сейчас 4 деплоя.**

### Jurist — за неделю с deep-audit 23.05

| Артефакт | Статус |
|---|---|
| 6 DPA для провайдеров (`docs/legal/dpa/`) | ✅ |
| Privacy Policy v1.1 — §7 переписан | ✅ |
| Согласие водителя на Госключ | ✅ |
| `docs/legal/invoice-spec.md` | ✅ |
| Юр-пакет ЭТрН (10 файлов в `docs/legal/etrn/`) | ✅ |
| DPA «Клиент ↔ TMS» (документ 99) | ✅ |

**Закрыто 4 из 12 P0 deep-audit + 6 self-discovered Jurist'ом.** В W1 Jurist не вызывали — T-0 разблокировал J-3 (AI DPA откладывается пока флаг off), остальные пункты ждут.

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

| # | Долг | Часов | Кто | Зависимость |
|---|---|---|---|---|
| J-1 | **Исправить документы 05/08 ЭТрН** — формулировки про КЭП физлица (Jurist §4.1 свою ошибку признал) | 1-2h | Jurist | — |
| J-2 | **Update Terms of Service** — раздел ЭПД + AI disclaimer + cap 12 мес (синхронизация с DPA-99) | 1 день | Jurist | — |
| ~~J-3~~ | ~~AI-копилот DPA~~ | — | — | ⏸ **отложен** — W1 T-0 скрыл AI за фичефлагом, DPA нужен только при включении |
| J-4 | **Внутренние документы оператора ПДн** — приказ, регламент, перечень мест хранения, журнал обращений | 2-3 дня | Jurist | — |
| J-5 | **Подготовка к регистрации ООО** — чек-лист, форма Р-1, mapping ИП→ООО, выбор УСН-режима | 1 день | Jurist | F-1 на стороне Founder |
| J-6 | **Cookie-policy + согласие на маркетинг** | 0.5 дня | Jurist | Если запуск лендинга |
| J-7 | **Privacy Policy §6** — сроки хранения МЧД, журналов подписаний | 0.5 дня | Jurist | (P1 фактически) |
| J-8 | **Acceptance подписи** `invoice-spec-acceptance-M.md` + `-O.md` | 0.5 дня | Jurist | После W1 деплоя готово — материал на столе |

**Зона: TransPult (мои технические долги)**

| # | Долг | Часов | Статус |
|---|---|---|---|
| ~~T-0~~ | ~~AI-копилот state check + UI hide~~ | 30min | ✅ **W1 done** (f0ed26a) |
| T-2 | Cross-tenant event-leak fix (`events/journal.ts:100`) | 2h | ⏸ W2 — нужно расследование |
| ~~T-3~~ | ~~Pino redact для PII водителей~~ | 1h | ✅ **W1 done** (ec14b90) |
| T-4 | Alerting на `pending_review` документы | 4h | W2 |
| T-5 | DPA-step UI при подключении интеграций | 4h | W2 — есть базовая логика от E batch |
| T-6 | mailru SMTP — `requires_acceptance: false` info-banner | 1h | W2 (после T-5) |
| T-7 | 50+ endpoints `requireAbility()` | 6-8h | ⏸ W2 — нужна role-by-role smoke session |
| ~~T-8~~ | ~~`/finance/invoices/bulk-pdf` N+1 → batch fetch~~ | 1h | ✅ **W1 done** (ec14b90) |
| T-9 | invoices unit-tests (createDraft/issue/correction/payment/cancel) | 4h | ⏸ W2 — мой долг, mock-pattern требует разбора |
| ~~T-10~~ | ~~Missing FK indexes — миграция 0037~~ | 30min | ✅ **W1 done** (f0ed26a + applied in prod) |
| ~~T-11~~ | ~~Full test suite~~ | 1h | ✅ **W1 done** (baseline: 705+199 tests, 8 skip с FIXME) |
| T-12 | Email-провайдер (Unisender или sendpulse / mailgun) | 1 день | W2 — блокер pilot |
| T-13 | МЧД UI — создать/прикрепить через UI | 2 дня | W2 — нужны Jurist J-1 + J-7 готовые |

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

**После W1 главного риска (AI-копилот без DPA) больше нет** — флаг скрыт, J-3 заморожен.
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

### W2 Sprint — приоритеты (ожидание твоей команды)

| # | Задача | Часов | Почему важно |
|---|---|---|---|
| T-12 | **Email-провайдер** (Sendgrid/Mailgun fallback к Unisender) | 1 день | Блокер pilot signup |
| T-9 | invoices unit-tests | 4h | Мой долг M-batch + разобрать mock-pattern (заодно T-46, T-47) |
| T-13 | МЧД UI workflow | 2 дня | Зависит от Jurist J-1 + J-7 |
| T-7 | RBAC sweep (50+ endpoints) | 6-8h | Нужна role-by-role smoke session |
| T-2 | Cross-tenant event-leak | 2h | Нужно расследование sсope-filter в /events |
| T-25 | KPI aggregation combine | 2h | Perf, не блокер |
| T-14 | 5-day SF warning | 6h | После T-12 |
| T-5 | DPA-step UI | 4h | После Jurist готов с DPA-текстами |
| T-4 | Alerting pending_review | 4h | После DevOps coord |
| T-48 | docs/architecture/migrations.md | 30min | Правило BEGIN/COMMIT (по ревью партнёра) |

**Итого моя зона на W2: ~30 часов** (без provider integrations — те в W3+).

---

## §6 Что нужно передать Jurist'у

| # | Задача | Зачем | Срок |
|---|---|---|---|
| J-1 | Исправить документы 05/08 ЭТрН (КЭП физлица формулировки) | Юр-точность | Эта неделя (блокер T-13 МЧД UI) |
| J-2 | Update ToS — раздел ЭПД + AI disclaimer + cap 12 мес | Синхронизация с DPA-99 | Эта неделя |
| ~~J-3~~ | ~~AI DPA~~ | ⏸ Заморожен (W1 T-0 — флаг off) | — |
| J-4 | Внутренние документы оператора ПДн (5 артефактов) | Регуляторный долг | Следующая неделя |
| J-5 | Чек-лист регистрации ООО + форма Р-1 + mapping ИП→ООО | Подготовка для Founder | Эта неделя |
| J-6 | Cookie-policy + согласие на маркетинг | Если будет лендинг | (P1) |
| J-7 | Privacy Policy §6 — сроки хранения МЧД и журналов | Блокер T-13 | Эта неделя |
| J-8 | **Acceptance подписи** `invoice-spec-acceptance-M.md` + `-O.md` | Закрытие моего M+O долга | Эта неделя |

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

## §8 Главные риски (после W1)

| Риск | Severity | Митигация |
|---|---|---|
| ~~AI-копилот в проде без DPA~~ | ✅ Снят | W1 T-0 — фичефлаг off в проде, 404 на /api/copilot/* |
| **Provider drought** — pilot выяснит что real ЮKassa/Госключ/Диадок не работают | 🔴 P0 | T-12 (email) первым в W2, потом ЮKassa+Diadoc+Госключ параллельно |
| **Регистрация ООО не стартовала** — окно до 01.09 (97 дней) сужается | 🔴 P0 | F-1 на этой неделе обязателен |
| **0 unit-тестов на invoices service-методы** — регрессия проедет в pilot | 🟧 P1 | T-9 в W2, заодно разобрать mock-pattern (T-46, T-47) |
| **50+ endpoints без requireAbility** — privilege escalation при изменении CASL | 🟧 P1 | T-7 — большой блок, отдельная W2 session с per-role smoke |
| ~~bulk-pdf N+1~~ | ✅ Снят | W1 T-8 — 3-4 batch queries |
| ~~Missing FK indexes~~ | ✅ Снят | W1 T-10 — миграция 0037 в проде |

---

## §9 Календарь до 01.09.2026

**97 дней. Распределение (актуализировано после W1):**

- **~~Неделя 1 (26.05-01.06)~~ — W1 закрыта частично:**
  - ✅ TransPult: T-0, T-3, T-8, T-10, T-11, T-23 + scripts/deploy
  - 🔴 Founder: F-1 (старт ООО), F-4 (PoL probes) — **не стартовали**
  - 🔴 Jurist: J-1, J-2, J-5 — **не стартовали**

- **Неделя 2 (02.06-08.06) — W2:**
  - Founder: F-1 (если не сделано), F-3 (УСН выбор)
  - Jurist: J-1, J-2, J-5, J-7, J-8 (acceptance подписи M+O)
  - TransPult: T-12 (email), T-9 (invoice tests), T-7 (RBAC sweep)

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

| Метрика | Было до W1 | После W1 |
|---|---|---|
| Готовность к платящему клиенту (юр) | ~40% | ~45% |
| P0 deep-audit закрыто | 4/12 (33%) | 4/12 (33%) |
| P0 TransPult из списка | 0/13 | 6/13 (T-0, T-3, T-8, T-10, T-11, T-23) |
| Тестов в проекте | 904 | 904 (697+201 with 8 FIXME-skip) |
| Тестов в мобильном | 0 | 0 |
| Миграций в проде | 36 | **37** (0037 deployed) |
| Real-провайдеров работает | 0 / 28 | 0 / 28 |
| Mocks в проде | 4 | 4 |
| Commits в prod за сессию | 8 | **13** (+5 W1) |
| Rollback'ов | 0 | 0 |
| Deploy infra | manual ssh paste | **scripts/deploy.{sh,ps1}** |
| **Snags выявлены ревью партнёра** | — | 1 ($Host PS reserved, fixed) |

**bulk-pdf queries (50 invoices):** было ~150 → стало 3-4
**FK indexes coverage:** было 5 hot FK без индексов → стало 0
**pino redact paths:** было 16 → стало 30+ (driver PII)
**AI exposure:** было live → 404

---

## §11 Что прошу решить от Founder'а (после W1)

**Q1 (срочно — на этой неделе).** Начинаешь регистрацию ООО (F-1)? Без неё календарь до 01.09 сужается. Бухгалтер/юрист на связи?

**Q2 (срочно).** PoL probes (F-4) — 15 звонков. Согласен запустить параллельно техдолгам, или edge-кейс «по списку»?

**Q3 (W2 порядок).** Что первым в моей W2 очереди:
- (a) **T-12 email-провайдер** (1 день) — блокер pilot signup
- (b) **T-9 invoice unit-tests** (4h) — мой долг M-batch
- (c) **T-7 RBAC sweep** (6-8h) — нужна role-by-role smoke session

Рекомендую (a) → (b) → (c).

**Q4 (Jurist синк).** Передать Jurist'у список из §6? Особенно J-8 — acceptance подписи M+O чтобы закрыть формальный долг.

**Q5 (deploy hygiene).** После ревью партнёра — оформить `docs/architecture/migrations.md` с правилом `BEGIN/COMMIT` обёртки (30min, T-48)? Или отложить?
