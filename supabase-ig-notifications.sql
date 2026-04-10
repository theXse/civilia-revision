-- Add columns to deliveries table
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS problem_notes TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS facebook_link TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS client_notified_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS approval_token UUID DEFAULT gen_random_uuid();

-- Notification queue table for batched emails
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('link_approval', 'subido_ig')),
  items JSONB NOT NULL DEFAULT '[]',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying of pending notifications
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
  ON notification_queue(region, type, scheduled_at)
  WHERE sent_at IS NULL;
