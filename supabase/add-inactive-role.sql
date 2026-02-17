-- Add 'inactive' to the users role check constraint
-- Inactive members retain all data but don't appear in members list or active member selections
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member', 'playing_guest', 'non_playing_guest', 'inactive'));
