-- Event Recaps table for storing AI-generated recaps posted to Slack
CREATE TABLE IF NOT EXISTS event_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recap_text TEXT NOT NULL,
  commissioner_notes TEXT,
  event_net_image_url TEXT,
  event_scratch_image_url TEXT,
  season_net_image_url TEXT,
  season_scratch_image_url TEXT,
  posted_to_slack BOOLEAN DEFAULT FALSE,
  slack_message_ts TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_recaps_event_id ON event_recaps(event_id);

-- RLS
ALTER TABLE event_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage event_recaps"
  ON event_recaps FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Members can view event_recaps"
  ON event_recaps FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid())
  );
