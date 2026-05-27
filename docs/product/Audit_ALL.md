# Объединённый аудит TMS-prod — обновлено 2026-05-27 (после W3.5 deployed)

**Источники:** PM (продуктовый), TransPult (технический), Jurist (юридический) + честная самооценка.
**HEAD:** `5599601` (W3.5 deployed в прод).
**До 01.09.2026:** **96 дней.**
**Что нового в этой итерации:** W3.5 batch — закрыто 10 quick wins за одну сессию (T-48, T-49, T-41, T-39, T-47, T-6, T-15, T-22, T-25, T-17). 3 deferred с обоснованием (T-18, T-19, T-40).

---

## §1 Главное в одной таблице

| Зона | Прогресс | Главный риск |
|---|---|---|
| Core security + auth | ~95% (W1 закрыл AI flag, PII redact, FK indexes) | rbac sweep ещё не сделан (T-7) |
| Бизнес-логика (orders / trips / invoices / MCHD) | ~85% | T-9 invoice service не привязан к routes (M-batch висит) |
| Юр-документы | ~80% (Jurist J-1/2/7/8 done; J-3 заморожен; J-4/5/6 ждут) | J-5 (ООО prep) блокирует Founder F-1 |
| **Real-провайдеры** | **1/28 (Unisender)** | 🔴 **Главный pre-pilot блокер** |
| Mobile app (driver) | 0 тестов / 10 экранов | T-13 МЧД UI готов, но водитель в мобиле не пилотируется |
| **Founder side (ООО + PoL)** | 0/4 (F-1..F-4) | 🔴 Календарь до 01.09 без F-1 невозможен |
| Pre-PMF (PoL probes, real пилоты) | 0 / 15 звонков, 0 пилотов | 🔴 Edge-кейс: продукт без users |
| Внешний security/perf/a11y audit | 0 (никогда не проводился) | 🟧 Может вылезть на пилоте |

**Готовность к платящему клиенту (юр+тех):** **~60%** (после W3.5 quick wins).
**Готовность к продукт-маркет-fit'у:** **~15%** (PoL probes не запускались).

---

## §2 Что закрыто (за всю историю + текущая сессия)

### Технический контур (TransPult)

| Категория | Закрыто |
|---|---|
| Security/Auth fixes (deep audit A-серии) | A3-A6, B1-B4, C1-C3 + 7.18-7.20 (anti-spoofing, HMAC, cross-tenant, race) |
| Audit batches B/C/D + 7.x | 25+ findings |
| QA-cycle | F1+F2 (org-scoping seed, Playwright multi-role) |
| G (16ec4f3) | разморозка QA: lot_assignments + cold-chain URL + /orders + sidebar |
| I (d6fb8db) | проверка кубов (capacity_volume_m3) + журнал |
| J1+L (fa5c18f + f3e014b) | tax_regime (8 enum) + usn_vat_rate (244-ФЗ) + Carriers-0 |
| K (0a6d547) | customer_price + carrier_cost + margin + RBAC |
| M (3d04e14) | invoice schema rebuild — 7-enum + invoice_orders + FSM + DB-triggers |
| N (3791fb2) | UI invoice ↔ orders двусторонняя навигация |
| O (371329d) | PDF-шаблоны СФ/УПД/КСФ/ИСФ по ПП РФ 1137 |
| **W1** (f0ed26a → 7e23006) | AI flag · 0037 FK indexes · PII redact · bulk-pdf N+1 · Wialon banner · deploy.{sh,ps1} |
| **W2** (ac3c5d1 + 8ac3cc7 + e971441) | Unisender real (15 тестов) · DPA-step онбординг · drift fix /legal страниц |
| **W3 partial** (2502963) | МЧД UI alignment с J-1 + seed (1 active + 1 expired) |
| **W3.5 batch** (a054da0 → 5599601) | 10 quick wins за сессию: T-48 migrations.md · T-49 ALLOW_INITIAL_SCHEMA · T-41 mobile lint · T-39 demo banner · T-47 fix login 401 test · T-15 bulk-generate LIMIT · T-22 HOS N+1 · T-25 KPI parallel · T-17 «Стоимость» в /trips · T-6 SMTP info-banner verified |

### Юр-документы (Jurist)

| Артефакт | Статус |
|---|---|
| 6 DPA для провайдеров | ✅ |
| Юр-пакет ЭТрН (10 файлов etrn/) | ✅ |
| DPA «Клиент ↔ TMS» (99) | ✅ |
| **W1 J-1** Исправлены КЭП-формулировки 05/08 + унификация МЧД normativki | ✅ (4071930) |
| **W1 J-2** ToS v1.1 (§2 разграничение / §6 cap 12мес / §7 ЭПД / §8 AI) | ✅ |
| **W1 J-7** Privacy Policy v1.2 — §6 retention для МЧД/dpa_acceptances/finance | ✅ |
| **W1 J-8** Acceptance подписи M+O batch'ей | ✅ |

**Накопительно: 21 commit за сессию, 5 миграций (0033-0037), 0 rollback'ов, 6 deploy'ев в проде.**

---

## §3 Долги — единая дорожная карта (передраконено)

### 🔴 P0 — блокеры платящего клиента

#### Зона: Founder (не делегируется)

| # | Долг | Часов | Статус |
|---|---|---|---|
| F-1 | Регистрация ООО (бухгалтер/юрист → ИФНС) | 3 дня | 🔴 Не стартовал |
| F-2 | Уведомление РКН (форма Р-1) | 0.5 дня | После F-1 |
| F-3 | Выбор УСН-режима для ООО | До F-1 | С Jurist J-5 |
| F-4 | PoL probes (15 звонков) | 1 неделя | 🔴 Не стартовал |

#### Зона: Jurist (юридическая)

| # | Долг | Часов | Статус |
|---|---|---|---|
| ~~J-1~~ | КЭП-формулировки 05/08 | — | ✅ W1 (4071930) |
| ~~J-2~~ | ToS v1.1 | — | ✅ W1 (4071930) |
| ~~J-3~~ | AI DPA | — | ⏸ Заморожен (W1 T-0) |
| J-4 | Внутренние документы оператора ПДн (5 артефактов) | 2-3 дня | W4 |
| J-5 | ООО prep — чек-лист, форма Р-1, mapping ИП→ООО | 1 день | **W4, разблокирует F-1** |
| J-6 | Cookie-policy + согласие на маркетинг | 0.5 дня | После лендинга |
| ~~J-7~~ | Privacy Policy §6 retention | — | ✅ W1 (4071930) |
| ~~J-8~~ | Acceptance M+O | — | ✅ W1 (4071930) |

#### Зона: TransPult (мои технические долги, P0)

| # | Долг | Часов | Статус |
|---|---|---|---|
| ~~T-0~~ | AI flag off | 30min | ✅ W1 (f0ed26a) |
| T-2 | Cross-tenant event-leak (`events/journal.ts`) | 2h | ⏸ W4 — нужно расследование |
| ~~T-3~~ | pino redact PII | 1h | ✅ W1 (ec14b90) |
| T-4 | Alerting pending_review (Telegram webhook) | 4h | W4 |
| ~~T-5~~ | DPA-step UI в онбординг | 4h | ✅ W2 (8ac3cc7) |
| ~~T-6~~ | ~~mailru SMTP info-banner~~ | 1h | ✅ W3.5 verified (E7 уже сделал) |
| T-7 | 50+ endpoints `requireAbility()` | 6-8h | ⏸ W4 — нужна role-by-role smoke |
| ~~T-8~~ | bulk-pdf N+1 → batch fetch | 1h | ✅ W1 (ec14b90) |
| T-9 | **invoice service tests + HTTP wiring** | **8-12h** | ⏸ W4 — M-batch service не привязан к routes |
| ~~T-10~~ | FK indexes 0037 | 30min | ✅ W1 (f0ed26a) |
| ~~T-11~~ | test suite baseline | 1h | ✅ W1 (f0ed26a) |
| ~~T-12~~ | Email Unisender real | 1 день | ✅ W2 (ac3c5d1) |
| ~~T-13~~ | МЧД UI alignment с J-1 | 4-6h | ✅ W3 (2502963) |

### 🟧 P1 — после пилота, но до коммерческого релиза

#### UI/UX полировки

| # | Долг | Часов |
|---|---|---|
| T-14 | 5-day SF warning (BullMQ + dashboard) — spec §6 | 6h |
| ~~T-15~~ | bulk-generate LIMIT 1000 + hasMore | 1h | ✅ W3.5 (df1083b) |
| T-16 | N4 invoice workflow modals (issue/correction/payment/cancel) | 6h |
| ~~T-17~~ | Колонка «Стоимость» в /trips (RBAC) — full margin = W4 | 2h | ✅ W3.5 (2d98d9a + 5599601) |
| T-18 | BUG-DISP-002 (vehicle auto-select UX) — **needs QA repro** | 2h | ⏸ W4 |
| T-19 | BUG-FINANCE-001 («Создать счёт по рейсам») — **needs QA repro** | 2h | ⏸ W4 |
| T-20 | forgot-password real flow (stub) | 3h |
| T-21 | Мёртвые кнопки (Fines/Permits/Billing/Repair Kanban) | 4h |
| ~~T-22~~ | drivers HOS bulk endpoint — N+1 → Promise.all | 2h | ✅ W3.5 (df1083b) |
| ~~T-23~~ | Wialon RU jurisdiction banner | 1h | ✅ W1 (ec14b90) |
| T-24 | XSD validation через `xmllint-wasm` (для ФНС) | 1 день |
| ~~T-25~~ | KPI 7 sequential → Promise.all | 2h | ✅ W3.5 (df1083b) |
| T-27 | E2E полный invoice flow (issue→pay→correction) | 1h |

### 🟨 P2 — continuous improvement

#### Provider реализации (см. §13 ниже — отдельная карта)

| # | Долг | Часов |
|---|---|---|
| T-28 | 20+ provider скелетов — поэтапно | 1-2 нед per |
| T-29 | ЮKassa real (1-й платёжный) | 3-4 нед |
| T-30 | Diadoc real (1-й ЭДО) | 3-4 нед |
| T-31 | Госключ real (1-й КЭП) | 3 нед |
| T-32 | Атракс (опц для пилот-клиента) | 1 нед |
| T-33 | СКЗИ tachograph reader (ddd-parser) | 1-2 нед |

#### Tech debt

| # | Долг | Часов |
|---|---|---|
| T-34 | Type-safety — 41× `as any` | continuous |
| T-35 | Mobile тесты (0/10 экранов) | 1 день |
| T-36 | operational-core тесты (9 файлов) | 2 дня |
| T-37 | JWT refresh/revocation (24h hardcoded) | 1 день |
| T-38 | RepairKanban (1397 LOC) → shared KanbanBoard | 1 день |
| ~~T-39~~ | Mock telematics demo banner | 30min | ✅ W3.5 (a054da0) |
| T-40 | DEPRECATED поля → миграция 0040+ (carrier_cost, contractor_id, tripIds) — **per migrations.md §5 в 3 спринта: W4 убрать writes, потом drop** | 2h |
| ~~T-41~~ | Mobile lint config (.eslintrc.json + expo lint) | 1h | ✅ W3.5 (a054da0) |
| T-42 | Prometheus exporters (6 TODO в alert-rules.md) | 1 день |
| T-43 | Carriers-1..4 UI (страница /carriers) | 17h |
| T-44 | R1 Research — Diadoc proxy-OAuth к Госключу | 1 день |
| T-46 | Fix gosklyuch-callback test skip (7 тестов) | 2-4h |
| ~~T-47~~ | Fix login 401 test (api.ts /auth/* exception) | 1h | ✅ W3.5 (a054da0) |
| ~~T-48~~ | docs/architecture/migrations.md (BEGIN/COMMIT) | 30min | ✅ W3.5 (a054da0) |
| ~~T-49~~ | ALLOW_INITIAL_SCHEMA env в deploy.sh | 30min | ✅ W3.5 (a054da0) |

---

## §4 Зависимости

```
Founder F-1 (ООО) — главный гейт
  ├─ Jurist J-5 (чек-лист) ускоряет
  ├─ Founder F-2 (РКН) после
  └─ TransPult mapping ИП→ООО в коде (1h, после F-1)

Pilot launch
  ├─ T-9 invoice tests + wiring (моя ответственность)
  ├─ Минимум 1 платёжный провайдер (T-29 ЮKassa)
  ├─ Минимум 1 ЭДО (T-30 Diadoc)
  ├─ Минимум 1 КЭП (T-31 Госключ)
  └─ Founder F-4 PoL probes (доказать спрос)

Mobile pilot (если)
  └─ Требует GAP-DRIVER-WEB (не в нашей зоне сейчас)
```

---

## §5 Зона TransPult — W4-W8 backlog

| W4 (16-22.06) | W5 (23-29.06) | W6 (30.06-06.07) | W7 (07-13.07) | W8 (14-20.07) |
|---|---|---|---|---|
| T-9 invoice wiring (8-12h) | T-7 RBAC sweep (6-8h) | T-29 ЮKassa real (3-4 нед) ► | ► продолжение | T-31 Госключ real (3 нед) ► |
| T-2 event-leak (2h) | T-14 5-day SF warning (6h) | | T-30 Diadoc real (3-4 нед) ► | ► продолжение |
| T-40 убрать carrierCost writes (Spr 2) | T-46 fix gosklyuch skipped (3-4h) | | | |
| T-18/T-19 (после QA repro) | T-4 alerting (4h) | | | |
| T-16 invoice modals (6h) | T-37 JWT refresh (1d) | | | |

После W8 — есть 5 недель до 01.09 на P1 UI/UX полировки + любые внешние audits.

---

## §6 Что нужно от Jurist'а в W4-W5

| # | Задача | Срок |
|---|---|---|
| J-5 | ООО prep — приоритет | W4 (16-22.06) |
| J-4 | Внутренние документы оператора ПДн | W4-W5 |
| J-6 | Cookie + согласие маркетинг (если лендинг) | W6 |
| Review | Sprint W4 acceptance после T-9 | W4 end |

---

## §7 Что нужно от Founder'а

| # | Задача | Когда | Блокирует |
|---|---|---|---|
| F-1 | Регистрация ООО | **W4** (срочно) | Календарь до 01.09 |
| F-2 | Подача Р-1 в РКН | После F-1 | Юр-инфраструктура |
| F-3 | Выбор УСН-режима | До F-1 (с Jurist) | Налоговая модель |
| F-4 | PoL probes (15 звонков) | **W4 параллельно** | Pre-PMF metric |

**Главный риск:** без F-1 в W4 окно сужается до 70 дней.

---

## §8 Главные риски (после W3 deployed)

| Риск | Severity | Митигация |
|---|---|---|
| ~~AI-копилот без DPA~~ | ✅ Снят | W1 T-0 |
| ~~КЭП-формулировки устарели~~ | ✅ Снят | Jurist J-1 |
| ~~ToS без ЭПД / AI / cap 12мес~~ | ✅ Снят | Jurist J-2 |
| ~~Privacy Policy без retention МЧД~~ | ✅ Снят | Jurist J-7 |
| ~~M+O acceptance~~ | ✅ Снят | Jurist J-8 |
| ~~/legal pages drift с .md~~ | ✅ Снят | W2 e971441 |
| ~~МЧД UI не отражает J-1~~ | ✅ Снят | W3 T-13 |
| **Provider drought (27/28)** | 🔴 P0 | T-29/30/31 параллельно в W6-W8 |
| **F-1 (ООО) не начат** | 🔴 P0 | Партнёрский вопрос Гоше |
| **0 PoL probes** | 🔴 P0 | F-4 параллельно |
| **0 real пилот-клиентов** | 🔴 P0 | Pre-PMF — главная риск-метрика |
| **T-9 M-batch service не wired** | 🟧 P1 | W4 первым приоритетом |
| **50+ endpoints без requireAbility** | 🟧 P1 | T-7 в W4-W5 |
| **Mobile app почти без тестов** | 🟧 P1 | T-35 в W6+ |
| **Внешний security pen-test не было** | 🟧 P1 | Нужен подрядчик в W7+ |

---

## §9 Календарь до 01.09.2026 — **96 дней**

| Период | Founder | Jurist | TransPult | Главная цель |
|---|---|---|---|---|
| Неделя 0 факт | (не стартовал) | J-1/2/7/8 ✅ | W1+W2+W3 ✅ | Технический контур закрыт |
| W4 (16-22.06) | F-1 + F-4 | J-5 | T-9 + T-2 + T-25 + T-48 + T-6 | M-batch wired |
| W5 (23-29.06) | F-2 после F-1 | J-4 | T-7 + T-14 + T-46/47 + T-4 | RBAC чисто + alerting |
| W6 (30.06-06.07) | пилот-фидбек | J-6 | ЮKassa real (старт) | 1-й провайдер платежей |
| W7 (07-13.07) | пилот-фидбек | review | Diadoc real (старт) | 1-й ЭДО |
| W8 (14-20.07) | пилот-фидбек | | Госключ real (старт) | 1-й КЭП |
| Недели 9-12 | масштаб | | UI/UX P1 полировка | Pilot → 5 клиентов |
| Недели 13-14 | масштаб | | Security pen-test + perf audit | Внешние проверки |

**Реалистичный пилотный launch:** середина июля при условии F-1 в W4.
**Коммерческий relase:** конец августа при условии 3 real-провайдеров.

---

## §10 Метрики (полный snapshot)

### Прогресс

| Метрика | Значение |
|---|---|
| Готовность к платящему клиенту (юр) | ~65% |
| **Готовность к платящему клиенту (тех + юр + провайдеры)** | **~55%** |
| **Готовность к продукт-маркет-fit (PoL probes + пилоты)** | **~15%** |
| P0 deep-audit закрыто | 9/12 (75%) |
| P0 TransPult из списка | 9/13 (69%) |
| P0 Jurist | 4/7 |
| P0 Founder | 0/4 |

### Код

| Метрика | Значение |
|---|---|
| Tests в проекте | 919 (713 api + 198 web + 18 shared FSM) |
| Тестов в мобильном | 0 |
| Skipped с FIXME | 8 (7 gosklyuch + 1 login 401) |
| Миграций в проде | 37 |
| `as any` в API | 41 |
| Console.log в production | 5 файлов |

### Deploy

| Метрика | Значение |
|---|---|
| Commits в main за сессию | 21 |
| Deploy'ев в проде | 6 |
| Rollback'ов | 0 |
| Прод HEAD | 08ddbac |

### Провайдеры (см. §13)

| Метрика | Значение |
|---|---|
| Real working | 1/28 (Unisender, при наличии env vars) |
| Mocks в проде | 4 (dadata, wialon, gibdd-alias, fuel-card) |
| Stubs throwing NotImplemented | 22 |
| Удалены deprecated | 4 (kontur, tinkoff, cloudpayments, gibdd-direct) |

### Юр-инфраструктура

| Метрика | Значение |
|---|---|
| Юр-документы (markdown) | 17 |
| ToS версия | 1.1 (на проде) |
| Privacy Policy версия | 1.2 (на проде) |
| /legal source of truth | markdown |
| МЧД demo seed | 2 (1 active + 1 expired) |

---

## §11 Pre-PMF метрика (откровенно)

| Что | Значение | Норма для pilot launch |
|---|---|---|
| PoL probes | 0 / 15 | ≥ 10 |
| Договоры намерения / LOI | 0 | ≥ 3 |
| Активные пилотники | 0 | ≥ 1 |
| Платящие клиенты | 0 | ≥ 1 (после pilot 2-3 мес) |
| Negative validation (отказы с причинами) | 0 | ≥ 5 |
| Distinct ИНН в demo signups | 1 (только seed) | ≥ 20 |

**Что это значит:** мы строим продукт под гипотезу, но **спрос не валидирован**. Партнёрское правило «PoL before code» нарушено для последних 6 спринтов (M, N, O, W1, W2, W3 ушли в код, не в звонки).

---

## §12 Слепые пятна (зоны где аудита нет)

| Зона | Текущее состояние | Что не известно | Когда нужно проверить |
|---|---|---|---|
| **Web Core Vitals** | Lighthouse не запускали | INP / LCP / CLS на проде | До pilot launch (W7) |
| **Bundle size / load perf** | Next.js bundle audit не делали | Размер vendor chunks, lazy boundaries | W7 |
| **Accessibility (a11y)** | ARIA не аудировали, контраст частично | Клавиатурная навигация, screen reader | W8 |
| **i18n** | Всё на русском | Цена локализации, RTL не нужен | Отложено (международка — после РФ-релиза) |
| **Security pen-test** | Внешний тест не было | XSS/CSRF/IDOR не верифицированы извне | W7 (нужен подрядчик) |
| **Backup / DR drill** | backup-restore-drill.ps1 есть, не запускался | RTO/RPO реальные | W6 |
| **Capacity planning** | Load testing нет | Лимит запросов / секунду | После pilot |
| **GDPR/152-ФЗ end-to-end audit** | Документы есть, flow не верифицирован | Реальное соответствие в коде | W5 (после T-7 RBAC) |
| **Outbound webhook reliability** | Retry / dead-letter queue нет | Что если ЮKassa webhook упадёт? | После T-29 |
| **DB index hit rate в проде** | Не мониторим | Реальная польза от 0037 indexes | W6 (через Prometheus после T-42) |
| **Mobile crash reporting** | Sentry не подключён | Краши в продакшене не видны | После T-35 |

---

## §13 Провайдер-карта (28 интеграций)

### По типам

| Тип | Названия | Real / Mock / Stub |
|---|---|---|
| **signature** (6) | gosklyuch, kontur_sign, sbis_sign, cadesplugin, mock | mock real / 4 stub |
| **edi** (4) | diadoc, sbis, kaluga_astral, taxcom | 0 real / 4 stub |
| **telematics** (3) | wialon, omnicomm, glonasssoft | 0 real / 3 stub (mock в dispatcher) |
| **fuel_card** (5) | rosneft, lukoil, gazprom, ppr_card, mock | 0 real / 4 stub |
| **fines** (3) | gis_gmp, traffic, mock | 0 real / 2 stub |
| **marking** (1) | crpt | 0 real / 1 stub |
| **payment** (3) | yookassa, mock, …(дубли удалены) | 0 real / 1 stub |
| **email** (3) | console, mailru_smtp, unisender | **1 real (Unisender), SMTP работает через env** |
| **osago** (1) | rsa | 0 real / 1 stub |
| **ofd** (1) | mock | 0 real / 1 mock |

**Итого: 1 real, 4 mock в проде, 22 stub throwing NotImplemented.**

### Приоритет реализации

1. 🔴 **ЮKassa** (T-29) — без него платежи невозможны
2. 🔴 **Diadoc** (T-30) — без него ЭПД не выпустить (нужен до 01.09)
3. 🔴 **Госключ** (T-31) — подписание Титула 4 ЭТрН водителем
4. 🟧 **CRPT** (маркировка) — для перевозок маркированных товаров
5. 🟧 **GIS GMP** (штрафы) — после первых пилотов

Остальные — после пилота по запросу клиентов.

---

## §14 Известные баги UI (P1, не блокеры)

| # | Что | Severity |
|---|---|---|
| BUG-DISP-002 | Vehicle auto-select UX | P1 |
| BUG-FINANCE-001 | «Создать счёт по рейсам» кнопка не открывает форму | P1 |
| Мёртвые кнопки | FinesTable / PermitsTable / Billing payment-method / Repair Kanban assignedTo | P1 |
| forgot-password | Stub с amber-banner вместо real flow | P1 |
| Mobile GPS hardcoded ±5м | CheckpointScreen.tsx | P1 |

---

## §15 Что прошу от тебя

**Q1 (срочно — W4).** Стартуешь F-1 (регистрация ООО)? Без неё календарь до 01.09 нереалистичен. Jurist готов помочь с J-5 (чек-лист) как только дашь сигнал.

**Q2 (срочно — W4).** Запускаешь F-4 PoL probes (15 звонков)? Параллельно техдолгам — займёт 1 неделю. Без них едем в pilot launch вслепую.

**Q3 (W4 порядок TransPult).** Что первым:
- (a) **T-9 invoice wiring** (8-12h) — мой долг M-batch, разблокирует invoice workflow
- (b) **T-7 RBAC sweep** (6-8h) — безопасность 50+ endpoint'ов
- (c) **T-29 ЮKassa real** (3-4 нед) — главный pre-pilot блокер

Рекомендую (a) — закрытие моего долга. После — (b). (c) стартует в W6 параллельно.

**Q4 (внешние проверки).** Заказывать pen-test и Web Vitals audit к pilot launch (~$2-5k каждое)? Или едем на «good enough» до первой жалобы?

**Q5 (стратегия).** **Партнёрское правило «PoL before code» нарушено.** Делаешь ставку:
- (1) Сейчас пауза в коде → F-4 PoL probes → решение по pivot/proceed
- (2) Продолжаем код параллельно, PoL probes на полскорости
- (3) Идём в pilot вслепую к 01.09

Моя рекомендация: **(1)** — PoL probes 1 неделя, и после них решение. Иначе риск построить продукт на гипотезе.
