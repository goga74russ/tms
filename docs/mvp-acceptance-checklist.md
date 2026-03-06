# MVP Acceptance Checklist (TMS)

Дата: 6 марта 2026  
Источник: `docs/roadmap.md`, `TZ_TMS.MD`

## Правило статусов
- `Implemented`: код/функция реализованы.
- `Configured`: настроены окружение, ключи, домен, интеграции.
- `Verified`: подтверждено тестом/прогоном/UAT.

## Gate A. Критичный бизнес-поток (обязателен)
Поток: заявка -> рейс -> техосмотр -> медосмотр -> путевой лист -> выполнение -> закрытие -> счет.

| Критерий | Implemented | Configured | Verified | Доказательство |
|---|---|---|---|---|
| Создание и смена статусов заявки/рейса | ☐ | ☐ | ☐ | API e2e + unit |
| Блокировка рейса без допусков механика/медика | ☐ | ☐ | ☐ | negative e2e |
| Формирование путевого листа с уникальным номером | ☐ | ☐ | ☐ | waybills tests |
| Закрытие рейса/ПЛ и генерация счета | ☐ | ☐ | ☐ | finance tests + smoke |
| Роль-ограниченный доступ (RBAC/RLS) | ☐ | ☐ | ☐ | rbac/security tests |

## Gate B. Безопасность и комплаенс (обязателен)
| Критерий | Implemented | Configured | Verified | Доказательство |
|---|---|---|---|---|
| JWT через httpOnly cookie, без утечек токена в body | ☐ | ☐ | ☐ | auth/security tests |
| RLS для driver/client на чувствительных эндпоинтах | ☐ | ☐ | ☐ | security/regression |
| Append-only event journal (без update/delete) | ☐ | ☐ | ☐ | DB trigger check |
| 152-ФЗ: ограничение медданных по ролям + access log | ☐ | ☐ | ☐ | inspections tests |
| Валидация входных данных (Zod) на ключевых роутерах | ☐ | ☐ | ☐ | route tests/manual |

## Gate C. Качество релиза (обязателен)
| Критерий | Implemented | Configured | Verified | Доказательство |
|---|---|---|---|---|
| `test` зеленый (все пакеты) | ☐ | ☐ | ☐ | CI/local run |
| `typecheck` зеленый | ☐ | ☐ | ☐ | CI/local run |
| `lint` зеленый | ☐ | ☐ | ☐ | CI/local run |
| Сборка `api` и `web` проходит | ☐ | ☐ | ☐ | CI/local build |
| Smoke после деплоя (логин, ключевые страницы, 1 бизнес-поток) | ☐ | ☐ | ☐ | runbook/protocol |

## Gate D. Эксплуатационная готовность (обязателен)
| Критерий | Implemented | Configured | Verified | Доказательство |
|---|---|---|---|---|
| Прод compose/deploy сценарий документирован и воспроизводим | ☐ | ☐ | ☐ | deploy runbook |
| Health/readiness endpoint и проверка зависимостей | ☐ | ☐ | ☐ | `/api/health*` |
| Бэкап/restore БД протестирован | ☐ | ☐ | ☐ | drill protocol |
| Secrets fail-fast, без дефолтных prod-паролей | ☐ | ☐ | ☐ | env review |
| Логи структурированы + correlation id | ☐ | ☐ | ☐ | runtime logs |

## Gate E. Интеграции (условно-обязательный для market-ready)
| Критерий | Implemented | Configured | Verified | Доказательство |
|---|---|---|---|---|
| GPS/телематика (не мок) | ☐ | ☐ | ☐ | vendor API live |
| Telegram-уведомления (реальный bot token/webhook) | ☐ | ☐ | ☐ | delivery logs |
| EDO/ЭПД (боевой оператор, КЭП) | ☐ | ☐ | ☐ | pilot documents |
| SSL/TLS + домен в прод | ☐ | ☐ | ☐ | cert/domain check |

## Go/No-Go правила
- `Go (MVP Internal)`: все критерии Gate A-D отмечены `Verified`.
- `Go (MVP Market)`: Gate A-D `Verified` + минимум 2 пункта из Gate E `Verified`, включая SSL/TLS.
- `No-Go`: хотя бы один пункт Gate A или Gate B не `Verified`.

## Протокол фиксации
- Для каждого пункта указывать: дата, ответственный, ссылка на PR/коммит, ссылка на тест/лог/скрин.
- Формат отметки: `Implemented [дата]`, `Configured [дата]`, `Verified [дата]`.

## Текущий снимок (аудит 2026-03-06)
- Детальный отчет: [mvp-audit-2026-03-06.md](D:/Ai/TMS/docs/mvp-audit-2026-03-06.md)
- Сводно:
- Gate A: `PASS (test-level)`
- Gate B: `PASS (частично без runtime-доказательств)`
- Gate C: `FAIL`
- Gate D: `PARTIAL`
- Gate E: `FAIL`
