-- Add commissioner flag to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_commissioner BOOLEAN DEFAULT false;

-- Set Robby Dewling as commissioner
UPDATE users SET is_commissioner = true WHERE full_name = 'Robby Dewling';
