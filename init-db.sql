-- Database initialization for Beer Tally app

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(30) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create beer_entries table
CREATE TABLE IF NOT EXISTS beer_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_beer_entries_user_id ON beer_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_beer_entries_created_at ON beer_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id); 