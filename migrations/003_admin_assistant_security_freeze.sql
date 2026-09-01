ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_frozen BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_freeze_reason TEXT;

ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_frozen_at TIMESTAMPTZ;

ALTER TABLE user_security
ADD COLUMN IF NOT EXISTS assistant_freeze_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_security_assistant_frozen
ON user_security(assistant_frozen)
WHERE assistant_frozen = TRUE;
