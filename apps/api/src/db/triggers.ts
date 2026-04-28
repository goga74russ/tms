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

-- Аналогичная защита для med_inspections (неизменяемый журнал 3+ лет)
CREATE OR REPLACE FUNCTION prevent_inspection_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% запрещён на таблице % (неизменяемый журнал осмотров)', TG_OP, TG_TABLE_NAME;
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
