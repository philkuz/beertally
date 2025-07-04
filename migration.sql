-- Migration script for adding room support to existing beer tally installation
-- This script safely adds room functionality without breaking existing data

-- Step 1: Add room_id column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS room_id INTEGER DEFAULT NULL;

-- Step 2: Create rooms table if it doesn't exist
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 3: Create default room for existing users
INSERT INTO rooms (room_code, name, creator_id) 
SELECT 'BEER01', 'Roy''s Bachelor Party', (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE room_code = 'BEER01');

-- Step 4: Migrate all existing users to Roy's Bachelor Party room
UPDATE users 
SET room_id = (SELECT id FROM rooms WHERE room_code = 'BEER01') 
WHERE room_id IS NULL;

-- Step 5: Add index for better performance
CREATE INDEX IF NOT EXISTS idx_users_room_id ON users(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);

-- Verification queries (uncomment to run)
-- SELECT 'Users migrated to default room:' as status, COUNT(*) as count FROM users WHERE room_id IS NOT NULL;
-- SELECT 'Default room created:' as status, room_code, name FROM rooms WHERE room_code = 'BEER01';
-- SELECT 'Users in default room:' as status, COUNT(*) as count FROM users u JOIN rooms r ON u.room_id = r.id WHERE r.room_code = 'BEER01';