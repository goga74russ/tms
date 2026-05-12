-- ============================================================
-- Migration 0025: Loosen the inspection-immutability trigger so
-- decision/comment can be flipped post-hoc (B-1 fix for the new
-- POST /api/inspections/{tech,med}/:id/decision routes added in
-- Round 3A). Everything else on tech_inspections / med_inspections
-- stays append-only. DELETE remains forbidden. med_access_log is
-- still fully append-only.
-- Date: 2026-05-12
-- ============================================================

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
      RAISE EXCEPTION 'UPDATE запрещён на таблице % (append-only journal)', TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
