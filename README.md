# � Room System

A real-time room system where users can create and join rooms using short, memorable room codes. Perfect for team collaboration, group chats, or any scenario where you need instant, organized communication.

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