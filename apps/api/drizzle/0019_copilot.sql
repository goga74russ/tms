-- Phase 7: AI dispatcher co-pilot MVP
-- Stores conversations + messages for the chat panel.

DO $$ BEGIN
    CREATE TYPE copilot_message_role AS ENUM ('user', 'assistant', 'tool', 'system');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS copilot_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    message_count integer NOT NULL DEFAULT 0,
    last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user
    ON copilot_conversations (user_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_org
    ON copilot_conversations (organization_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS copilot_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
    role copilot_message_role NOT NULL,
    content text NOT NULL DEFAULT '',
    tool_name text,
    tool_input jsonb,
    tool_output jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_conv_created
    ON copilot_messages (conversation_id, created_at);
