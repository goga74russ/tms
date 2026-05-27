# SQL migrations — правила и атомарность

**Создан:** 2026-05-27 (W3.5, после партнёрского ревью deploy.sh)
**Применяется к:** `apps/api/drizzle/*.sql`

---

## 1. Имя и порядок

Миграции в `apps/api/drizzle/` нумеруются 4 цифрами: `0036_invoice_schema_rebuild.sql`. Применяются по алфавиту через `scripts/deploy.sh` → `psql -v ON_ERROR_STOP=1`. Применённые тэги хранятся в таблице `tms_schema_migrations(tag)`.

## 2. Атомарность — **BEGIN / COMMIT обязательны**

`psql -v ON_ERROR_STOP=1 < file.sql` останавливается на первой ошибке, **но не откатывает уже выполненные statement'ы**. Если в миграции 3 statement'а и второй упал — первый применён, тэг НЕ записан, следующий запуск deploy.sh попробует ещё раз и упадёт на `duplicate-create`.

**Правило:** каждый SQL-файл миграции **должен** оборачивать своё содержимое в транзакцию.

```sql
-- ============================================================
-- Migration 00XX — название
-- Date: YYYY-MM-DD
-- ============================================================

BEGIN;

-- statement 1
ALTER TABLE foo ADD COLUMN bar TEXT;

-- statement 2
CREATE INDEX idx_foo_bar ON foo (bar);

-- statement 3
UPDATE foo SET bar = 'default' WHERE bar IS NULL;

COMMIT;
```

Тогда:
- Любая ошибка → весь файл откатывается → `tms_schema_migrations.tag` НЕ записан → следующий запуск повторит чисто
- Успех → COMMIT фиксирует всё атомарно → deploy.sh пишет тэг

### Исключения

1. **`CREATE INDEX CONCURRENTLY`** не может быть внутри транзакции. Это PostgreSQL-ограничение. Для таких миграций — отдельный файл без BEGIN/COMMIT с комментарием:

```sql
-- Migration 00XX — CONCURRENT index (no transaction)
-- Этот файл специально без BEGIN/COMMIT: CREATE INDEX CONCURRENTLY
-- не работает внутри транзакции (Postgres docs).
-- Идемпотентность — через IF NOT EXISTS.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_huge_table_field ON huge_table (field);
```

2. **`ALTER TYPE ... ADD VALUE`** к enum также имеет ограничения в транзакции (Postgres 12+). Делать в отдельном файле либо использовать `IF NOT EXISTS`.

3. **DEFERRED CHECK** триггеры в начале файла — должны работать в транзакции, но check выполняется на COMMIT, не на statement.

## 3. Идемпотентность

Используй `IF NOT EXISTS` / `IF EXISTS` для безопасности повторного запуска:

```sql
CREATE INDEX IF NOT EXISTS idx_foo ON foo (bar);
ALTER TABLE foo ADD COLUMN IF NOT EXISTS baz INT;
DROP INDEX IF EXISTS idx_old;
```

## 4. Backfill — отдельный statement, не часть DDL

Плохо:
```sql
ALTER TABLE orders ADD COLUMN customer_price NUMERIC NOT NULL DEFAULT 0;
```
(блокирует таблицу при больших объёмах)

Хорошо:
```sql
BEGIN;
ALTER TABLE orders ADD COLUMN customer_price NUMERIC;
UPDATE orders SET customer_price = COALESCE(legacy_price, 0);
ALTER TABLE orders ALTER COLUMN customer_price SET NOT NULL;
ALTER TABLE orders ALTER COLUMN customer_price SET DEFAULT 0;
COMMIT;
```

## 5. Drop columns — два деплоя

Удаление колонки = breaking change для API кода. Никогда не делай в одной миграции с удалением кода — будет downtime.

**Правильный порядок:**
1. **Spr 1:** добавить новую колонку, скопировать данные, обновить API чтобы читало из новой.
2. **Spr 2:** убедиться что API больше не использует старую колонку (несколько недель).
3. **Spr 3:** миграция `DROP COLUMN old_column;`.

См. также T-40 (Migration 0040) — drop `trips.carrier_cost`, `invoices.contractor_id`, `invoices.tripIds[]`. Эти deprecated с W1+W2, API уже не использует — можно дропать в Spr 3.

## 6. Чек-лист автору миграции

- [ ] Файл оборачивает содержимое в `BEGIN; ... COMMIT;` (если нет — комментарий-объяснение)
- [ ] Все DDL через `IF [NOT] EXISTS`
- [ ] Backfill в отдельном `UPDATE` после `ADD COLUMN`
- [ ] `SET NOT NULL` после backfill, не сразу
- [ ] Имя файла `00XX_short_description.sql` (4 цифры, snake_case)
- [ ] Header-комментарий: ссылка на задачу (T-NN или PR), что/почему/как rollback
- [ ] Проверил на локальной БД через `docker compose exec postgres psql -f file.sql`
- [ ] Учёл DEPRECATED поля, удаляемые в Spr 3 (см. §5)
- [ ] Если CONCURRENTLY — отдельный файл, no transaction (см. §2 исключения)

## 7. Связанные файлы

- `apps/api/drizzle/*.sql` — миграции
- `apps/api/src/db/schema.ts` — Drizzle ORM схема (обновляй вместе)
- `scripts/deploy.sh` — runner на проде (читает `tms_schema_migrations`)
- `scripts/apply-local-migrations.ps1` — runner для локальной dev-БД
- `scripts/rollback-prod.sh` — rollback миграций (требует backup)

## 8. История правил (changelog)

| Дата | Правило | Триггер |
|---|---|---|
| 2026-05-27 | BEGIN/COMMIT обёртка обязательна (§2) | Партнёрское ревью deploy.sh после W1 — обнаружено что atomicity не гарантирована при сбое в середине файла |
| 2026-05-27 | Drop columns в 3 спринта (§5) | T-40 в W3.5 — необходимость убрать DEPRECATED поля после M+L batch'ей |
