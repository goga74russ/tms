# Optimizer v1 Specification

Дата: 6 марта 2026  
Статус: Draft v1  
Область: `apps/api` + `apps/web` (диспетчерский контур)

## 1. Цель
Optimizer v1 должен автоматически строить и перепланировать план рейсов с учетом бизнес-ограничений и оптимизационной цели:
- выполнять hard constraints без нарушений,
- минимизировать операционные потери (опоздания, пустой пробег, простои, лишние рейсы),
- давать объяснимый результат для диспетчера.

## 2. Scope v1 / Out of Scope
### In Scope (v1)
1. Road-модель (собственный автопарк, без мультимодальности).
2. Планирование `Order -> Trip -> RoutePoints -> Assignment`.
3. Replan по событиям: отмена, недопуск, поломка, изменение окна доставки.
4. Explainability по каждому решению.
5. What-if режим для диспетчера.

### Out of Scope (v1)
1. Полноценный carrier tendering.
2. Международная мультимодальная оптимизация.
3. Глобальные транспортные сети со сквозными брокерскими торгами.

## 3. Термины
1. `Planning Job` — запуск оптимизатора на наборе заказов.
2. `Candidate Plan` — вариант плана до финального выбора.
3. `Hard Constraint` — обязательное ограничение, нарушение запрещено.
4. `Soft Constraint` — желательное ограничение, нарушение штрафуется.
5. `Score` — итоговая оценка плана (чем меньше, тем лучше).

## 4. Входные данные
Optimizer принимает нормализованный snapshot:

1. Orders:
- `id`, `weightKg`, `volumeM3`, `pickupWindow`, `dropoffWindow`, `priority`, `serviceTimeMin`, `contractorId`.

2. Fleet:
- `vehicleId`, `status`, `payloadCapacityKg`, `bodyType`, `fuelNorm`, `zonePermits`, `currentLocation`, `currentOdometerKm`.

3. Drivers:
- `driverId`, `status`, `licenseCategories`, `medClearance`, `rtoRemainingMin`, `currentLocation`.

4. Trip/Route context:
- активные рейсы, уже назначенные точки, locked сегменты, текущие ETA.

5. Operational parameters:
- матрица времени/дистанции,
- стоимость топлива/часа/штрафов,
- веса objective function.

## 5. Ограничения
### 5.1 Hard constraints (обязательные)
1. Грузоподъемность ТС >= суммарный вес заказов на сегменте.
2. Совместимость типа кузова и требований груза.
3. Наличие действующих допусков и документов ТС.
4. Водитель активен и имеет нужные категории.
5. Водитель имеет меддопуск на текущую смену.
6. РТО не нарушается в плане (по времени движения/работы).
7. Нельзя назначать archived/broken/maintenance ТС.
8. Нельзя ставить заказ вне жесткого окна, если окно помечено как strict.

### 5.2 Soft constraints (штрафуемые)
1. Опоздание относительно окна доставки.
2. Раннее прибытие с ожиданием > порога.
3. Пустой пробег между точками.
4. Избыточная фрагментация заказов (слишком много рейсов).
5. Нарушение предпочтений диспетчера/клиента (если заданы).

## 6. Целевая функция
Итоговый score:

```text
score =
  w_cost * transport_cost
  + w_late * late_minutes
  + w_empty * empty_km
  + w_idle * idle_minutes
  + w_split * split_penalty
  + w_risk * risk_penalty
```

Где:
1. `transport_cost` = топливо + зарплата + амортизация + платные участки.
2. `late_minutes` = суммарное опоздание по всем точкам.
3. `risk_penalty` = штраф за план с низким буфером по РТО/окнам.

Веса (`w_*`) конфигурируемые:
- глобально,
- по организации,
- опционально по контракту.

## 7. Алгоритм v1
Гибридный pipeline:

1. Pre-filter:
- отбрасывание невозможных назначений по hard constraints.

2. Initial Builder (быстрый):
- greedy insertion по приоритетам/окнам,
- формирование стартового feasible плана.

3. Improvement Phase (local search):
- `relocate`,
- `swap`,
- `2-opt` для маршрутов,
- ограниченное число итераций или лимит времени.

4. Replan mode:
- частичный пересчет затронутого подграфа,
- locked сегменты не двигаются (если уже в исполнении).

5. Candidate ranking:
- сравнение top-N планов по score,
- выбор минимального score.

## 8. Explainability (обязательно)
Для каждого назначения и отклонения формировать reason codes:

1. Assignment reasons:
- `BEST_SCORE`,
- `ONLY_FEASIBLE_VEHICLE`,
- `RTO_BUFFER_BETTER`,
- `LOWER_EMPTY_KM`.

2. Rejection reasons:
- `CAPACITY_EXCEEDED`,
- `LICENSE_MISMATCH`,
- `NO_MED_CLEARANCE`,
- `RTO_VIOLATION`,
- `WINDOW_VIOLATION`,
- `ZONE_PERMIT_MISSING`.

3. Плановые артефакты:
- breakdown score по компонентам,
- топ-3 альтернативы с причинами проигрыша.

## 9. API Contract (v1)
### 9.1 Create planning job
`POST /api/optimizer/jobs`

Request:
```json
{
  "orderIds": ["..."],
  "mode": "optimize|replan|what_if",
  "constraintsProfileId": "default",
  "weightsProfileId": "default",
  "timeLimitSec": 20
}
```

Response:
```json
{
  "jobId": "opt-job-001",
  "status": "queued"
}
```

### 9.2 Job status/result
`GET /api/optimizer/jobs/:jobId`

Response:
```json
{
  "jobId": "opt-job-001",
  "status": "completed",
  "score": 12345.67,
  "kpi": {
    "lateMinutes": 12,
    "emptyKm": 48.2,
    "idleMinutes": 30,
    "tripsCount": 8
  },
  "plan": {
    "trips": []
  },
  "explanations": []
}
```

### 9.3 Apply plan
`POST /api/optimizer/jobs/:jobId/apply`

Эффект:
- транзакционно создает/обновляет trips/routePoints/assignments,
- пишет события в journal.

### 9.4 What-if simulate
`POST /api/optimizer/what-if`

Без применения изменений в БД, только simulation result.

## 10. События и аудит
Обязательные события event journal:
1. `optimizer.job_created`
2. `optimizer.job_completed`
3. `optimizer.plan_applied`
4. `optimizer.plan_rejected`
5. `optimizer.replan_triggered`

Data payload минимум:
- `jobId`, `mode`, `inputSize`, `durationMs`, `score`, `authorId`.

## 11. Хранение данных (минимум v1)
Новые таблицы:
1. `optimizer_jobs`
- `id`, `status`, `mode`, `requestedBy`, `inputSnapshot`, `resultSnapshot`, `score`, `durationMs`, `createdAt`.

2. `optimizer_plans`
- `id`, `jobId`, `rank`, `score`, `kpi`, `planJson`, `createdAt`.

3. `optimizer_explanations`
- `id`, `jobId`, `entityType`, `entityId`, `reasonCode`, `details`, `createdAt`.

Индексы:
- `optimizer_jobs(status, created_at desc)`,
- `optimizer_plans(job_id, rank)`,
- `optimizer_explanations(job_id, entity_type)`.

## 12. Производительность и SLA
Цели v1:
1. До 300 заказов / 100 ТС: результат <= 20 сек.
2. Replan локального инцидента: <= 5 сек.
3. What-if (до 100 заказов): <= 3 сек.

Fallback:
- при таймауте возвращать best-known feasible plan + флаг `degraded=true`.

## 13. Тест-стратегия
### 13.1 Unit
1. Проверка каждого hard constraint.
2. Корректность score breakdown.
3. Deterministic behavior при фиксированном seed.

### 13.2 Property-based
1. Ни один принятый план не нарушает hard constraints.
2. При добавлении soft penalty итоговый score не улучшается искусственно.

### 13.3 Integration
1. `jobs -> completed -> apply` транзакционный happy path.
2. Replan по поломке ТС.
3. Replan по недопуску водителя.

### 13.4 Performance
1. Наборы 50/100/300 заказов.
2. Измерение latency, throughput, memory.

## 14. UI (Dispatcher)
Экран `/dispatcher/optimizer`:
1. Кнопка `Оптимизировать`.
2. Список candidate plans (rank + KPI).
3. Сравнение `current vs optimized`.
4. Панель объяснений “почему так”.
5. `What-if` sandbox (изменить окно/ТС/водителя, пересчитать).
6. Кнопка `Применить план`.

## 15. Rollout Plan
### Phase 0 (shadow)
- Оптимизатор считает параллельно, но не применяет.
- Сравниваются KPI текущего ручного плана и предложения.

### Phase 1 (assisted)
- Диспетчер вручную подтверждает применение.
- Доступ только для pilot-организаций.

### Phase 2 (default-on)
- Оптимизатор по умолчанию для выбранных типов рейсов.
- Ручной override остается.

## 16. Риски и меры
1. Низкое качество входных данных -> добавить data quality checks до запуска job.
2. Непредсказуемый replan в пике -> лимиты времени и fallback best-known.
3. Недоверие диспетчера к “черному ящику” -> explainability UI + reason codes.
4. Регресс по бизнес-правилам -> жёсткий regression suite и replay production cases.

## 17. Definition of Done (Optimizer v1)
1. Все hard constraints реализованы и покрыты тестами.
2. `POST /optimizer/jobs` + `GET /optimizer/jobs/:id` + `apply` работают стабильно.
3. Explainability доступна в API и UI.
4. Replan для 3 критичных триггеров реализован (поломка, недопуск, отмена).
5. На пилоте подтверждено улучшение минимум по 2 KPI:
- `emptyKm` не хуже текущего,
- `lateMinutes` не хуже текущего,
- `costPerTrip` снижен или стабилен.

