// ============================================================
// SQL для append-only триггера на таблицу events
// Выполняется при первой миграции
// ============================================================

/**
 * Возвращает SQL для создания триггера,
 * запрещающего UPDATE и DELETE на таблице events.
 * (Приложение Б.1 ТЗ — неизменяемый журнал)
 */
export const APPEND_ONLY_TRIGGER_SQL = `
-- Функция, блокирующая UPDATE/DELETE
CREATE OR REPLACE FUNCTION prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE запрещён на таблице events (append-only journal)';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Разрешаем только пометку конфликта
    IF NEW.conflict IS DISTINCT FROM OLD.conflict AND
       NEW.id = OLD.id AND
       NEW.timestamp = OLD.timestamp AND
       NEW.author_id = OLD.author_id AND
       NEW.event_type = OLD.event_type AND
       NEW.entity_id = OLD.entity_id AND
       NEW.data = OLD.data AND
       NEW.author_role = OLD.author_role AND
       NEW.entity_type = OLD.entity_type AND
       NEW.version = OLD.version AND
       NEW.offline_created_at IS NOT DISTINCT FROM OLD.offline_created_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'UPDATE запрещён на таблице events (append-only journal). Допускается только изменение поля conflict.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер
DROP TRIGGER IF EXISTS trg_events_append_only ON events;
CREATE TRIGGER trg_events_append_only
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_modification();

-- Аналогичная защита для tech_inspections / med_inspections (неизменяемый журнал 3+ лет).
-- Разрешаем UPDATE только если изменились исключительно поля decision и/или comment
-- (нужно для quick-approve UI диспетчера / медика). Все остальные колонки иммутабельны.
-- DELETE запрещён всегда. med_access_log — полностью append-only.
CREATE OR REPLACE FUNCTION prevent_inspection_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE запрещён на таблице % (неизменяемый журнал осмотров)', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'tech_inspections' THEN
      IF NEW.id = OLD.id
         AND NEW.vehicle_id = OLD.vehicle_id
         AND NEW.mechanic_id = OLD.mechanic_id
         AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
         AND NEW.inspection_type = OLD.inspection_type
         AND NEW.checklist_version = OLD.checklist_version
         AND NEW.items::text = OLD.items::text
         AND NEW.signature = OLD.signature
         AND NEW.created_at = OLD.created_at
         AND (NEW.decision IS DISTINCT FROM OLD.decision
              OR NEW.comment IS DISTINCT FROM OLD.comment)
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'UPDATE запрещён на таблице tech_inspections (допускаются только decision и comment)';
    ELSIF TG_TABLE_NAME = 'med_inspections' THEN
      IF NEW.id = OLD.id
         AND NEW.driver_id = OLD.driver_id
         AND NEW.medic_id = OLD.medic_id
         AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id
         AND NEW.inspection_type = OLD.inspection_type
         AND NEW.checklist_version = OLD.checklist_version
         AND NEW.systolic_bp = OLD.systolic_bp
         AND NEW.diastolic_bp = OLD.diastolic_bp
         AND NEW.heart_rate = OLD.heart_rate
         AND NEW.temperature = OLD.temperature
         AND NEW.condition = OLD.condition
         AND NEW.alcohol_test = OLD.alcohol_test
         AND NEW.complaints IS NOT DISTINCT FROM OLD.complaints
         AND NEW.signature = OLD.signature
         AND NEW.created_at = OLD.created_at
         AND (NEW.decision IS DISTINCT FROM OLD.decision
              OR NEW.comment IS DISTINCT FROM OLD.comment)
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'UPDATE запрещён на таблице med_inspections (допускаются только decision и comment)';
    ELSE
      -- med_access_log и прочие: полностью append-only
      RAISE EXCEPTION 'UPDATE запрещён на таблице % (append-only journal)', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tech_inspections_immutable ON tech_inspections;
CREATE TRIGGER trg_tech_inspections_immutable
  BEFORE UPDATE OR DELETE ON tech_inspections
  FOR EACH ROW
  EXECUTE FUNCTION prevent_inspection_modification();

DROP TRIGGER IF EXISTS trg_med_inspections_immutable ON med_inspections;
CREATE TRIGGER trg_med_inspections_immutable
  BEFORE UPDATE OR DELETE ON med_inspections
  FOR EACH ROW
  EXECUTE FUNCTION prevent_inspection_modification();

-- Защита лога доступа к медданным
DROP TRIGGER IF EXISTS trg_med_access_log_immutable ON med_access_log;
CREATE TRIGGER trg_med_access_log_immutable
  BEFORE UPDATE OR DELETE ON med_access_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_inspection_modification();
`;
