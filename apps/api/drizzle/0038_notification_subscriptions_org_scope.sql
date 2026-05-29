-- P0-S2: org-scope для уведомлений.
-- notification_subscriptions не имел organization_id → notification.worker
-- рассылал события КАЖДОЙ орг всем подписчикам бота (cross-tenant утечка).
BEGIN;

ALTER TABLE notification_subscriptions
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Бэкфилл по организации пользователя, к которому привязана подписка.
UPDATE notification_subscriptions ns
SET organization_id = u.organization_id
FROM users u
WHERE ns.user_id = u.id AND ns.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS notification_subs_org_idx
    ON notification_subscriptions (organization_id, is_active);

COMMIT;
