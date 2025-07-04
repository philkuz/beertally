# 🍺 Beer Tally with Rooms

A beer tracking app with PostgreSQL persistence and room support, designed for deployment on Railway. Now supports multiple rooms using short room codes!

## Features

- Individual beer entry logging (each +1 creates a new database record)
- Remove most recent beer entry with -1 button
- Real-time leaderboard
- **NEW: Room support** - Create and join rooms using short codes (e.g., BEER01)
- Room-specific leaderboards and tallies
- PostgreSQL database with persistent sessions
- Flappy Bird mini-game with scoring
- Railway deployment ready

## Database Schema

- `users` table: Stores user information linked to session IDs with room support
- `beer_entries` table: Individual beer consumption records
- `rooms` table: Room information with unique short codes
- `flappy_bird_scores` table: Game scores
- `session` table: Session storage (auto-created by connect-pg-simple)

## Room Functionality

### Using Rooms
- All existing users are automatically assigned to the default room "BEER01" (Roy's Bachelor Party)
- Users can create new rooms or join existing ones using short codes
- Each room has its own leaderboard and beer tallies
- Room codes are 6 characters (letters/numbers, e.g., ABC123)

### Room Features
- Create rooms with custom names
- Join rooms using short, memorable codes
- Room-specific beer tallies and leaderboards
- Existing users migrated to default room automatically

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
   - Existing users will be migrated to Roy's Bachelor Party room

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (provided by Railway)
- `SESSION_SECRET`: Secret key for session encryption
- `NODE_ENV`: Set to "production" for Railway deployment
- `PORT`: Port to run the server on (provided by Railway)

## How It Works

- Each beer addition creates a new record in the `beer_entries` table
- Beer removal deletes the most recent entry for that user
- The leaderboard counts total entries per user within their current room
- Sessions are stored in PostgreSQL for persistence across restarts
- Users can switch between rooms or create new ones
- Room tallies are isolated - each room has its own leaderboard

## Migration Notes

- Existing users are automatically assigned to room "BEER01" (Roy's Bachelor Party) on first startup
- All existing beer entries remain intact and associated with users
- No data loss during the room migration process

## ✨ Features

- **Short Room Codes**: Generate and join rooms using 6-character alphanumeric codes (e.g., ABC123)
- **Real-time Chat**: Instant messaging with Socket.IO for seamless communication
- **User Management**: Simple name-based user system with session persistence
- **Room Participants**: See who's currently in each room
- **Modern UI**: Clean, responsive design that works on all devices
- **Database Persistence**: All rooms, messages, and users are stored in PostgreSQL

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your database:
   - Create a PostgreSQL database named `roomsystem`
   - Run the initialization script: `psql -d roomsystem -f init-db.sql`
   - Or set the `DATABASE_URL` environment variable

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser and go to `http://localhost:3000`

## 🎯 How to Use

### Creating a Room
1. Enter your name when prompted
2. Click "Create New Room"
3. Give your room a name
4. Share the generated room code with others

### Joining a Room
1. Enter your name when prompted
2. Click "Join Room"
3. Enter the room code someone shared with you
4. Start chatting!

## 🛠 Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (default: `postgresql://localhost:5432/roomsystem`)
- `SESSION_SECRET`: Secret key for session management (default: auto-generated)
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (set to `production` for SSL)

### Database Schema

The system uses four main tables:
- `users`: User profiles with session management
- `rooms`: Room information and metadata
- `room_messages`: Chat messages within rooms
- `room_participants`: Track who's in each room

## 🔧 Technical Stack

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.IO
- **Database**: PostgreSQL with connection pooling
- **Session**: Express sessions with PostgreSQL store
- **Frontend**: Vanilla JavaScript with modern CSS

## 📱 Mobile Support

The room system is fully responsive and works great on:
- Desktop computers
- Tablets
- Mobile phones
- Touch devices

## 🔒 Security Features

- Session-based authentication
- SQL injection protection with parameterized queries
- XSS protection with input sanitization
- CSRF protection via session management

## 🚀 Deployment

### Railway (Recommended)
The project includes a `railway.toml` configuration file for easy deployment to Railway.

### Other Platforms
The app works on any platform that supports Node.js and PostgreSQL:
- Heroku
- Vercel
- DigitalOcean
- AWS
- Google Cloud

## 📝 API Endpoints

### Web Routes
- `GET /` - Home page / dashboard
- `GET /create-room` - Create room form
- `POST /create-room` - Create a new room
- `GET /join-room` - Join room form
- `POST /join-room` - Join existing room
- `GET /room/:code` - Room chat interface
- `POST /set-name` - Set user name
- `GET /logout` - Clear session

### Socket.IO Events
- `join-room` - Join a room
- `send-message` - Send chat message
- `room-joined` - Room join confirmation
- `new-message` - Receive new message
- `user-joined` - User joined notification
- `user-left` - User left notification
- `participants-updated` - Updated participant list

## 🤝 Contributing

Feel free to contribute to this project! Areas for improvement:
- Add emoji reactions to messages
- Implement file sharing
- Add room permissions/moderation
- Support for video/voice chat
- Message search functionality
- Room themes and customization

## 📄 License

This project is open source and available under the ISC License. 