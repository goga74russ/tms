-- ============================================================
-- 0043 — mchd_number: глобальный UNIQUE → per-org UNIQUE.
--
-- Аудит C9 (P2 security, mchd/routes.ts): глобальная уникальность mchd_number
-- → admin орг B перебором номеров (формат ФНС предсказуем) ловил 409 на чужой
-- номер = existence-oracle по МЧД других тенантов. Делаем уникальность per-org
-- (organization_id у mchd — NOT NULL, поэтому NULL-distinct проблемы нет).
--
-- Loosening: глобальный unique СТРОЖЕ per-org → существующие (глобально
-- уникальные) номера композит удовлетворяют автоматически, миграция упасть
-- на данных НЕ может. Имя старого констрейнта (inline UNIQUE из 0029)
-- определяем динамически по pg_constraint — не зависим от автогенерированного
-- имени и от того, дропнут ли он уже (идемпотентно).
--
-- Прод — демо одного тенанта. BEGIN/COMMIT — атомарность (ON_ERROR_STOP откатит).
-- ============================================================
BEGIN;

-- Дропаем существующий глобальный UNIQUE на mchd_number (любое имя констрейнта).
DO $$
DECLARE c text;
BEGIN
    SELECT conname INTO c
      FROM pg_constraint
     WHERE conrelid = 'mchd'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%(mchd_number)%';
    IF c IS NOT NULL THEN
        EXECUTE format('ALTER TABLE mchd DROP CONSTRAINT %I', c);
    END IF;
END $$;

-- Per-org уникальность номера МЧД (organization_id NOT NULL → без NULL-distinct).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mchd_org_number ON mchd (organization_id, mchd_number);

COMMIT;
