# 🍺 Beer Tally

A simple beer tracking app with PostgreSQL persistence, designed for deployment on Railway.

## Features

- Individual beer entry logging (each +1 creates a new database record)
- Remove most recent beer entry with -1 button
- Real-time leaderboard
- PostgreSQL database with persistent sessions
- Railway deployment ready

## Database Schema

- `users` table: Stores user information linked to session IDs
- `beer_entries` table: Individual beer consumption records
- `session` table: Session storage (auto-created by connect-pg-simple)

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up PostgreSQL database and create a `.env` file:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/beertally
   SESSION_SECRET=your-super-secret-session-key-here
   ```

3. Run the app:
   ```bash
   npm start
   ```

## Railway Deployment

1. **Create a Railway account** at [railway.app](https://railway.app)

2. **Create a new project** and add a PostgreSQL database service

3. **Deploy from GitHub:**
   - Connect your GitHub repository
   - Railway will automatically detect the Node.js app
   - Add the PostgreSQL service to your project

4. **Set environment variables:**
   - `DATABASE_URL` (automatically set by Railway PostgreSQL service)
   - `SESSION_SECRET` (set to a random string)
   - `NODE_ENV=production`

5. **Deploy:**
   - Railway will automatically build and deploy your app
   - The database tables will be created automatically on first run

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (provided by Railway)
- `SESSION_SECRET`: Secret key for session encryption
- `NODE_ENV`: Set to "production" for Railway deployment
- `PORT`: Port to run the server on (provided by Railway)

## How It Works

- Each beer addition creates a new record in the `beer_entries` table
- Beer removal deletes the most recent entry for that user
- The leaderboard counts total entries per user
- Sessions are stored in PostgreSQL for persistence across restarts 