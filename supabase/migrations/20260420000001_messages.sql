-- Messages table for direct parent↔admin/coach communication
-- Structured messaging (not open-ended chat)

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       uuid NOT NULL REFERENCES auth.users(id),
  recipient_role  text NOT NULL DEFAULT 'admin',  -- 'admin', 'coach'
  recipient_id    uuid REFERENCES auth.users(id), -- specific coach user, null for admin inbox
  family_id       uuid REFERENCES families(id),   -- sender's family (for parent messages)
  category        text NOT NULL DEFAULT 'general', -- 'question_program', 'scheduling', 'payment', 'general'
  subject         text NOT NULL,
  body            text NOT NULL,
  player_id       uuid REFERENCES players(id),    -- optional context
  program_id      uuid REFERENCES programs(id),   -- optional context
  read_at         timestamptz,                     -- when recipient read it
  admin_reply     text,                            -- admin/coach reply text
  replied_at      timestamptz,                     -- when reply was sent
  replied_by      uuid REFERENCES auth.users(id),
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_family ON messages(family_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_unread_admin ON messages(read_at) WHERE recipient_role = 'admin' AND read_at IS NULL;
CREATE INDEX idx_messages_unread_coach ON messages(recipient_id, read_at) WHERE recipient_role = 'coach' AND read_at IS NULL;

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Parents can see their own messages
CREATE POLICY messages_parent_select ON messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid());

-- Parents can insert messages (as sender)
CREATE POLICY messages_parent_insert ON messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Admins can see all messages
CREATE POLICY messages_admin_select ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Admins can update messages (mark read, reply)
CREATE POLICY messages_admin_update ON messages FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Coaches can see messages directed to them
CREATE POLICY messages_coach_select ON messages FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid() AND recipient_role = 'coach'
  );

-- Coaches can update messages directed to them (mark read, reply)
CREATE POLICY messages_coach_update ON messages FOR UPDATE TO authenticated
  USING (
    recipient_id = auth.uid() AND recipient_role = 'coach'
  );

-- Parents can see replies to their messages (already covered by messages_parent_select)
-- But they also need to see the reply content, which is on the same row

-- Audit trigger
CREATE TRIGGER messages_audit
  AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
