-- Feedback table for bug reports, feature requests, and general feedback
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature_request', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_response TEXT,
  responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

-- Auto-update updated_at
CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback" ON feedback
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update any feedback (for responses and status changes)
CREATE POLICY "Admins can update feedback" ON feedback
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can delete feedback
CREATE POLICY "Admins can delete feedback" ON feedback
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Storage bucket for feedback attachments (run this separately if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-attachments', 'feedback-attachments', false);

-- Storage policies for feedback-attachments bucket
-- Authenticated users can upload to their own folder
-- CREATE POLICY "Users can upload feedback attachments"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'feedback-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read their own attachments, admins can read all
-- CREATE POLICY "Users and admins can read feedback attachments"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'feedback-attachments' AND (
--       (storage.foldername(name))[1] = auth.uid()::text OR
--       EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
--     )
--   );

-- Admins can delete feedback attachments
-- CREATE POLICY "Admins can delete feedback attachments"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'feedback-attachments' AND
--     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
--   );
