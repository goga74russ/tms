-- ============================================================
-- 0052 — P1 (код-аудит 2026-06-14): repair_part_catalog UNIQUE(code) → per-org.
--
-- idx_repair_part_catalog_code был глобально уникален по одному code (0007),
-- а code детерминированно генерится из name-category-unit. Следствия:
--   • createRepairPartCatalogItem тенанта B падал unique-violation, если код
--     уже занят тенантом A (раскрытие чужих данных + невозможность завести
--     свою позицию);
--   • syncRepairCatalogFromParts/гидрация (onConflictDoNothing) молча теряли
--     позицию тенанта B при совпадении code (silent data loss).
-- Переводим на composite (organization_id, code) + частичный unique для
-- глобальных сид-позиций (organization_id IS NULL).
--
-- Данные: глобальный unique сейчас запрещает любые дубли code, поэтому и
-- per-org, и частичный global-индекс строятся без конфликтов.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

DROP INDEX IF EXISTS idx_repair_part_catalog_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_part_catalog_org_code
    ON repair_part_catalog (organization_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_part_catalog_global_code
    ON repair_part_catalog (code)
    WHERE organization_id IS NULL;

COMMIT;
