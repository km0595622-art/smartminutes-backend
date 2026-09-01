CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(80) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_assistant_logs (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(100) NOT NULL,
    target_type VARCHAR(80),
    target_id BIGINT,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_logs_created
ON admin_assistant_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_assistant_logs_target
ON admin_assistant_logs(target_type, target_id);
