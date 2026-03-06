# Roadmap To Production (TMS)

Дата плана: 6 марта 2026  
Цель: вывести проект в production с контролируемым риском  
Целевой Go-Live: 30 апреля 2026

## Принципы запуска
- Без компромиссов по Gate A/B (критичный бизнес-поток и безопасность).
- Каждый спринт заканчивается измеримым `Verified` результатом.
- Нет Go-Live без dry-run деплоя, backup/restore и rollback drill.

## Sprint P0 (9-15 марта 2026): Stabilization Gate
Цель: закрыть красный Gate C (качество релиза).

Задачи:
1. Привести scripts во всех workspace к единому стандарту: `lint`, `typecheck`, `build`, `test` (включая `apps/mobile`).
2. Убрать интерактивность `next lint` (зафиксировать ESLint конфиг в репозитории).
3. Обновить CI: обязательные джобы `lint + typecheck + test + build`.
4. Исправить/обойти Windows symlink проблему сборки `next build` (или зафиксировать Linux-only release runner).

Definition of Done:
- `npm run lint --workspaces` = green.
- `npm run build --workspaces` = green в CI.
- `npm run test --workspaces --if-present` = green.
- Отчет в `docs/release-gate-p0.md` с логами прогонов.

## Sprint P1 (16-22 марта 2026): Production Infrastructure
Цель: подготовить боевую инфраструктуру и безопасный деплой.

Задачи:
1. Домен + DNS + SSL (Let's Encrypt) для web/api.
2. Production env hardening: секреты, ротация, fail-fast, доступы.
3. Наблюдаемость: логи, health/readiness, алерты по критичным сбоям.
4. Runbook деплоя: пошаговый deploy, rollback, smoke-check.

Definition of Done:
- Доступ по HTTPS.
- Runbook и rollback-инструкция проверены на staging.
- Алерты приходят на 5xx/падение API/Redis/DB.

## Sprint P2 (23-29 марта 2026): Real Integrations Cutover
Цель: убрать ключевые моки, необходимые для рыночного запуска.

Задачи:
1. GPS/Wialon: подключение реального API, хранение токенов, мониторинг ошибок интеграции.
2. Telegram: боевой bot token, webhook, retry policy, журнал доставки.
3. ЭДО/ЭПД: выбор оператора, пилотный контур, минимальный боевой сценарий обмена.

Definition of Done:
- Минимум 1 реальный рейс с живой GPS телеметрией.
- Telegram уведомления проходят end-to-end.
- Пилот ЭДО проведен на реальных документах (не мок).

## Sprint P3 (30 марта - 5 апреля 2026): Data Safety & Operations
Цель: доказать эксплуатационную устойчивость.

Задачи:
1. Бэкапы: расписание, хранение, шифрование.
2. Restore drill: полное восстановление БД на тестовом контуре.
3. Инцидент drill: отказ Redis/DB/API, проверка RTO/RPO.
4. Нагрузочный smoke: базовый профиль реального трафика.

Definition of Done:
- Подписанный протокол backup/restore drill.
- Подписанный протокол incident/rollback drill.
- Документ `docs/ops-readiness.md`.

## Sprint P4 (6-12 апреля 2026): UAT & Business Acceptance
Цель: подтвердить бизнес-готовность MVP.

Задачи:
1. UAT по golden path (заявка -> рейс -> осмотры -> ПЛ -> счет).
2. UAT по негативным сценариям (нет допуска, конфликт sync, отмена рейса).
3. Проверка ролей и разграничения данных (driver/client/medic/admin).
4. Обучение ключевых пользователей + регламент поддержки.

Definition of Done:
- Подписанный UAT протокол от бизнеса.
- Список дефектов P1/P2 закрыт.
- Решение Go/No-Go на steering meeting.

## Sprint P5 (13-19 апреля 2026): Pre-Prod Freeze
Цель: стабилизация перед боевым окном.

Задачи:
1. Freeze фичей, только bugfix.
2. Финальный regression + security regression.
3. Проверка миграций на production-like копии данных.
4. Финальный релиз-кандидат (`RC1`), затем `RC2` при необходимости.

Definition of Done:
- RC проходит полный pipeline без ручных вмешательств.
- Нет открытых P1.
- Не более 2 P2 с согласованным workaround.

## Sprint P6 (20-30 апреля 2026): Go-Live Window
Цель: безопасный выход в production.

План:
1. 20-22 апреля: cutover rehearsal на staging.
2. 23-24 апреля: финальная проверка чеклистов.
3. 25 апреля: решение Go/No-Go.
4. 28-30 апреля: production deployment (окно).

Definition of Done:
- Production доступен, smoke-поток пройден.
- Мониторинг зеленый первые 48 часов.
- Post-launch report в `docs/go-live-report-2026-04.md`.

## Критерии Go-Live (обязательные)
1. Все пункты Gate A/B/D = `Verified`.
2. Gate C = `Verified` на CI и на release runner.
3. Gate E: минимум GPS + Telegram + SSL в боевом режиме.
4. Подписанные UAT и Ops протоколы.

## Риски и буферы
- Риск: задержка по ЭДО оператору/КЭП.  
Буфер: доп. неделя (1-7 мая 2026), если Go-Live переносится.

- Риск: нестабильность mobile offline-синхронизации.  
Буфер: feature flag на расширенные offline-сценарии до стабилизации.

- Риск: интеграционные лимиты/таймауты внешних API.  
Буфер: retry + circuit breaker + деградационный режим.

## Минимальная команда на период вывода в прод
- Tech Lead / Release owner
- Backend engineer
- Frontend engineer
- DevOps/SRE
- QA (manual + regression)
- Business owner (UAT decision)

