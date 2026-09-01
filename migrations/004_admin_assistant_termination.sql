ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_terminated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_termination_reason TEXT;

ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_terminated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_security_assistant_terminated
ON user_security(assistant_terminated)
WHERE assistant_terminated = TRUE;
