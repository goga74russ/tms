# Project status — TMS «ТрансПульт»

Last updated: 2026-05-23 (по итогам code inventory + 6 audit-runs)
Owner of this file: partner (PM-like) + TransPult sync.

---

## Активные документы сегодня

| Документ | Статус | Owner |
|---|---|---|
| `docs/tasks/transpult/2026-05-23-code-inventory.md` | **готов** | TransPult |
| 6 audit-отчётов от 2026-05-23 (security/multi-tenancy/ЭТрН/frontend/perf/ops) | в контексте текущей сессии, не выгружены в файл | TransPult — могу собрать в `_audit-2026-05-23.md` по запросу |
| `docs/tasks/_audit-2026-05-23.md` | **не существует** (партнёр ссылался как на готовое) | — |

---

## Сводка состояния кода до launch 01.09.2026

**Critical path (Pilot-blocker)**: 19 задач, ~10-11 недель backend-работы + 2 недели юр-работы параллельно. Запас тонкий.

**Главные блокеры**:
1. Provider registry (A-P0-4) — клиент сохраняет API keys, backend возвращает mock
2. ЭТрН XML генератор не соответствует ФНС-словарю
3. Ни один реальный EDI-оператор не подключён (все 3 throws)
4. Госключ — stub deeplink без real OAuth
5. 152-ФЗ — нет согласия на signup, нет права на удаление, не уведомлён РКН
6. Security P0 — signup hijack для unverified users (auth.ts:1183)
7. Mobile sync — игнорирует updated/deleted events, нет tombstones

**Что закрыто за последние 2 недели** (history):
- 21 находка из 4 audit-батчей (A-D + 7.x)
- Sign endpoint + GET endpoint + transaction wrapping в /me/organization
- 24 integration-теста для /sign + callback
- ЭТрН trust chain (B1-B4)
- INN-hijack closed (7.18)
- Госключ deeplink scheme aligned (7.19)
- signerRole propagation (7.20)

**Что в проде сегодня**: commit `37e31ee`, healthy на 135.106.152.23. API healthy с первой попытки на каждом из 5 деплоев.

---

## Распределение по ролям

| Роль | Текущая загрузка | Зависимости |
|---|---|---|
| **TransPult** | Code inventory готов. Ждёт приоретизации от PM. | Не блокирует, может начать любую из 19 critical-задач |
| **Jurist** | 152-ФЗ блок (consent text, localактn, РКН-нотификация, пилотный SLA). | Может работать параллельно с кодом |
| **PM** | Должен приоретизировать 19 critical задач в 14-недельный план. Sandbox-sequencing (Диадок/Госключ заявки). | Нужен от партнёра |
| **Desing** | UI-полировка stub-in-prod банеров, 401-handler UX, mobile EAS profiles | Триггерится после PM-плана |
| **QA** | Стратегия unit-тестов для apps/web (0 покрытие). | Не критично до alpha |
| **DevOps** | Backup encryption, DR-drill, uptime monitor, rollback-prod.sh fix | P0, может начать сразу |
| **Marketing** | roadmap vs landing sync (что реально продаём в pilot) | После решения «mock-mode-disclaimer» |

---

## Следующий шаг для партнёра

1. Решить, делать ли `_audit-2026-05-23.md` (выгрузить 6 audit-отчётов в файл) — стоит, чтобы closed findings было fixed reference.
2. Прочитать `docs/tasks/transpult/2026-05-23-code-inventory.md`.
3. Раскидать 19 critical-задач по приоритетам + по ролям (TransPult / Jurist / DevOps работают параллельно).
4. Подать заявки на sandbox-доступы (Диадок, Госуслуги-Госключ) — это календарные недели вне нашего контроля.
