-- ============================================================
-- 0027 — Multi-tenancy backfill (audit A-P0-12)
-- ============================================================
-- Two tables predate multitenancy and have no organization_id:
--
--   1. events (audit log) — any tenant admin can read every other
--      tenant's audit trail (event_type / entity_id / data JSON
--      with PII + business diffs).
--
--   2. checklist_templates — any tenant admin can read/edit other
--      tenants' inspection templates. Editing silently changes
--      inspection criteria for every org using a shared template.
--
-- This migration:
--   - Adds nullable organization_id FK on both tables.
--   - Backfills events.organization_id from authoring user's org.
--   - Adds an index for tenant-scoped queries.
--   - NOTE: NOT NULL is NOT enforced yet — backfill may leave rows
--     with null org_id if an author user has been deleted. App
--     code is updated in this commit to filter `IS NOT NULL` and
--     scope by request.orgId; a follow-up migration can tighten
--     to NOT NULL once orphan rows are addressed (one-time review).
-- ============================================================

-- ---- events: org column + backfill + index ----
ALTER TABLE events
ADD COLUMN IF NOT EXISTS organization_id uuid
REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill: copy author's organization at the time of the event.
-- Users without an org_id are left null; the app scopes queries by
-- request.orgId so null-org events are invisible to every tenant.
UPDATE events e
SET organization_id = u.organization_id
FROM users u
WHERE e.organization_id IS NULL
  AND e.author_id = u.id
  AND u.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_organization
ON events (organization_id, timestamp DESC);

-- ---- checklist_templates: org column ----
-- Templates were previously global. Backfill is impossible without
-- a "first seed" hint, so existing templates stay org-less and act
-- as system defaults available to all tenants (read-only). New
-- templates created via /admin/checklists/* land with the creator's
-- org_id and are tenant-scoped.
ALTER TABLE checklist_templates
ADD COLUMN IF NOT EXISTS organization_id uuid
REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_organization
ON checklist_templates (organization_id);
