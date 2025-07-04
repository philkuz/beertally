// server.js
import express from "express";
import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/beertally",
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Database connection status
let dbConnected = false;

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(30) NOT NULL,
        user_type VARCHAR(20) DEFAULT 'participant' NOT NULL,
        room_id INTEGER DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create beer_entries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beer_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create flappy_bird_scores table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flappy_bird_scores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create rooms table (NEW - for room functionality)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(6) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        creator_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_user_id ON beer_entries(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_created_at ON beer_entries(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_flappy_bird_scores_user_id ON flappy_bird_scores(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_flappy_bird_scores_score ON flappy_bird_scores(score DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_room_id ON users(room_id)`);
    
    // Add room_id column if it doesn't exist (migration for existing users)
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS room_id INTEGER DEFAULT NULL`);
    } catch (error) {
      console.log("room_id column already exists or error adding it:", error.message);
    }
    
    // Add user_type column if it doesn't exist (migration)
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) DEFAULT 'participant' NOT NULL`);
    } catch (error) {
      console.log("user_type column already exists or error adding it:", error.message);
    }
    
    // Create default room and migrate existing users
    await createDefaultRoomAndMigrate();
    
    dbConnected = true;
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    dbConnected = false;
    // Don't exit, let the server start anyway
  }
}

// Migration function to create default room and assign existing users
async function createDefaultRoomAndMigrate() {
  try {
    // Check if default room exists
    const existingRoom = await pool.query("SELECT id FROM rooms WHERE room_code = $1", ['BEER01']);
    
    let defaultRoomId;
    if (existingRoom.rows.length === 0) {
      // Create default room
      const defaultRoom = await pool.query(
        "INSERT INTO rooms (room_code, name, creator_id) VALUES ($1, $2, (SELECT id FROM users LIMIT 1)) RETURNING id",
        ['BEER01', 'Default Beer Room']
      );
      defaultRoomId = defaultRoom.rows[0]?.id;
      console.log("Created default room BEER01");
    } else {
      defaultRoomId = existingRoom.rows[0].id;
    }
    
    if (defaultRoomId) {
      // Migrate existing users without room_id to default room
      await pool.query(
        "UPDATE users SET room_id = $1 WHERE room_id IS NULL",
        [defaultRoomId]
      );
      console.log("Migrated existing users to default room");
    }
  } catch (error) {
    console.error("Error in migration:", error);
  }
}

// Initialize database on startup (non-blocking)
initializeDatabase();

// Session store using PostgreSQL
const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: "session",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "REPLACE-THIS-WITH-RANDOM-STRING",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
  })
);

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Helper functions
async function getOrCreateUser(sessionId) {
  const result = await pool.query(
    "SELECT id, name, user_type, room_id FROM users WHERE session_id = $1",
    [sessionId]
  );
  return result.rows[0] || null;
}

async function getBeerCount(userId) {
  const result = await pool.query(
    "SELECT COUNT(*) as count FROM beer_entries WHERE user_id = $1",
    [userId]
  );
  return parseInt(result.rows[0].count);
}

async function getLeaderboard(roomId = null) {
  let whereClause = "";
  let params = [];
  
  if (roomId) {
    whereClause = "WHERE u.room_id = $1";
    params = [roomId];
  }
  
  const participants = await pool.query(`
    SELECT u.name, COUNT(be.id) as count
    FROM users u
    LEFT JOIN beer_entries be ON u.id = be.user_id
    ${whereClause}
    ${roomId ? "" : "AND"} u.user_type = 'participant'
    GROUP BY u.id, u.name
    ORDER BY count DESC
  `, params);
  
  const observers = await pool.query(`
    SELECT u.name, COUNT(be.id) as count
    FROM users u
    LEFT JOIN beer_entries be ON u.id = be.user_id
    ${whereClause}
    ${roomId ? "" : "AND"} u.user_type = 'observer'
    GROUP BY u.id, u.name
    ORDER BY count DESC
  `, params);
  
  return {
    participants: participants.rows,
    observers: observers.rows
  };
}

async function getTotalBeerCount(roomId = null) {
  let whereClause = "";
  let params = [];
  
  if (roomId) {
    whereClause = "WHERE u.room_id = $1 AND";
    params = [roomId];
  } else {
    whereClause = "WHERE";
  }
  
  const result = await pool.query(`
    SELECT COUNT(*) as total 
    FROM beer_entries be
    JOIN users u ON be.user_id = u.id
    ${whereClause} u.user_type = 'participant'
  `, params);
  return parseInt(result.rows[0].total);
}

// Room helper functions
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createRoom(userId, roomName) {
  let roomCode;
  let attempts = 0;
  
  // Generate unique room code
  do {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate unique room code");
  } while (await pool.query("SELECT id FROM rooms WHERE room_code = $1", [roomCode]).then(r => r.rows.length > 0));
  
  const result = await pool.query(
    "INSERT INTO rooms (room_code, name, creator_id) VALUES ($1, $2, $3) RETURNING *",
    [roomCode, roomName, userId]
  );
  
  return result.rows[0];
}

async function joinRoom(userId, roomCode) {
  const roomResult = await pool.query(
    "SELECT * FROM rooms WHERE room_code = $1 AND is_active = true",
    [roomCode.toUpperCase()]
  );
  
  if (roomResult.rows.length === 0) {
    throw new Error("Room not found");
  }
  
  const room = roomResult.rows[0];
  
  // Update user's room_id
  await pool.query(
    "UPDATE users SET room_id = $1 WHERE id = $2",
    [room.id, userId]
  );
  
  return room;
}

async function getUserRoom(userId) {
  const result = await pool.query(`
    SELECT r.* FROM rooms r
    JOIN users u ON u.room_id = r.id
    WHERE u.id = $1 AND r.is_active = true
  `, [userId]);
  
  return result.rows[0] || null;
}

async function createRoom(userId, roomName) {
  let roomCode;
  let attempts = 0;
  
  // Generate unique room code
  do {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate unique room code");
  } while (await pool.query("SELECT id FROM rooms WHERE room_code = $1", [roomCode]).then(r => r.rows.length > 0));
  
  const result = await pool.query(
    "INSERT INTO rooms (room_code, name, creator_id) VALUES ($1, $2, $3) RETURNING *",
    [roomCode, roomName, userId]
  );
  
  // Add creator as participant
  await pool.query(
    "INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)",
    [result.rows[0].id, userId]
  );
  
  return result.rows[0];
}

async function joinRoom(userId, roomCode) {
  const roomResult = await pool.query(
    "SELECT * FROM rooms WHERE room_code = $1 AND is_active = true",
    [roomCode.toUpperCase()]
  );
  
  if (roomResult.rows.length === 0) {
    throw new Error("Room not found");
  }
  
  const room = roomResult.rows[0];
  
  // Check if user is already in room
  const existingParticipant = await pool.query(
    "SELECT * FROM room_participants WHERE room_id = $1 AND user_id = $2",
    [room.id, userId]
  );
  
  if (existingParticipant.rows.length === 0) {
    await pool.query(
      "INSERT INTO room_participants (room_id, user_id) VALUES ($1, $2)",
      [room.id, userId]
    );
  } else {
    // Reactivate participant if they were inactive
    await pool.query(
      "UPDATE room_participants SET is_active = true WHERE room_id = $1 AND user_id = $2",
      [room.id, userId]
    );
  }
  
  return room;
}

async function getRoomMessages(roomId, limit = 50) {
  const result = await pool.query(`
    SELECT rm.*, u.name as user_name 
    FROM room_messages rm
    JOIN users u ON rm.user_id = u.id
    WHERE rm.room_id = $1
    ORDER BY rm.created_at DESC
    LIMIT $2
  `, [roomId, limit]);
  
  return result.rows.reverse();
}

async function getRoomParticipants(roomId) {
  const result = await pool.query(`
    SELECT u.id, u.name
    FROM room_participants rp
    JOIN users u ON rp.user_id = u.id
    WHERE rp.room_id = $1 AND rp.is_active = true
    ORDER BY rp.joined_at ASC
  `, [roomId]);
  
  return result.rows;
}

async function saveMessage(roomId, userId, message) {
  const result = await pool.query(
    "INSERT INTO room_messages (room_id, user_id, message) VALUES ($1, $2, $3) RETURNING *",
    [roomId, userId, message]
  );
  
  const user = await pool.query("SELECT name FROM users WHERE id = $1", [userId]);
  
  return {
    ...result.rows[0],
    user_name: user.rows[0].name
  };
}

// HTML template
const html = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🏠 Room System</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: #2d3748;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1rem;
    }
    
    .header {
      text-align: center;
      color: white;
      margin-bottom: 2rem;
    }
    
    .header h1 {
      font-size: 3rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .header p {
      font-size: 1.2rem;
      opacity: 0.9;
    }
    
    .main-content {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    
    .welcome-section {
      padding: 3rem 2rem;
      text-align: center;
    }
    
    .welcome-section h2 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #2d3748;
    }
    
    .welcome-section p {
      font-size: 1.1rem;
      color: #718096;
      margin-bottom: 2rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #4a5568;
    }
    
    input[type="text"] {
      width: 100%;
      max-width: 300px;
      padding: 0.75rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1.1rem;
      transition: border-color 0.2s;
    }
    
    input[type="text"]:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .button-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin: 2rem 0;
      flex-wrap: wrap;
    }
    
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
      min-width: 150px;
    }
    
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }
    
    .btn:active {
      transform: translateY(0);
    }
    
    .btn-secondary {
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #fc8181 0%, #e53e3e 100%);
    }
    
    .room-info {
      background: #f7fafc;
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      text-align: center;
    }
    
    .room-code {
      font-size: 2rem;
      font-weight: 800;
      color: #667eea;
      letter-spacing: 2px;
      margin: 0.5rem 0;
      font-family: 'Courier New', monospace;
    }
    
    .error {
      background: #fed7d7;
      color: #c53030;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      text-align: center;
    }
    
    .success {
      background: #c6f6d5;
      color: #2f855a;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      text-align: center;
    }
    
    /* Chat room styles */
    .chat-container {
      display: flex;
      height: 600px;
    }
    
    .participants-panel {
      width: 250px;
      background: #f7fafc;
      padding: 1rem;
      border-right: 1px solid #e2e8f0;
    }
    
    .participants-panel h3 {
      margin-bottom: 1rem;
      color: #4a5568;
    }
    
    .participant {
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background: white;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    
    .participant.current-user {
      background: #e6fffa;
      color: #2c7a7b;
      font-weight: 600;
    }
    
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .messages-container {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      background: #fafafa;
    }
    
    .message {
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .message.own-message {
      background: #e6fffa;
      margin-left: 2rem;
    }
    
    .message-author {
      font-weight: 600;
      color: #4a5568;
      font-size: 0.9rem;
      margin-bottom: 0.25rem;
    }
    
    .message-content {
      color: #2d3748;
    }
    
    .message-time {
      font-size: 0.8rem;
      color: #a0aec0;
      margin-top: 0.25rem;
    }
    
    .message-input-container {
      padding: 1rem;
      background: white;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 0.5rem;
    }
    
    .message-input {
      flex: 1;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1rem;
    }
    
    .send-btn {
      padding: 0.75rem 1.5rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    
    .send-btn:hover {
      background: #5a6fd8;
    }
    
    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .header h1 {
        font-size: 2rem;
      }
      
      .welcome-section {
        padding: 2rem 1rem;
      }
      
      .chat-container {
        flex-direction: column;
        height: auto;
        min-height: 500px;
      }
      
      .participants-panel {
        width: 100%;
        max-height: 150px;
        overflow-y: auto;
      }
      
      .button-group {
        flex-direction: column;
        align-items: center;
      }
      
      .btn {
        width: 100%;
        max-width: 300px;
      }
    }
  </style>
</head>
<body>
  ${body}
  <script src="/socket.io/socket.io.js"></script>
</body>
</html>`;

// Socket.IO middleware to share session
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Socket.IO connection handling
io.on('connection', async (socket) => {
  const session = socket.request.session;
  
  if (!session.userId) {
    socket.disconnect();
    return;
  }
  
  const user = await getOrCreateUser(session.id);
  if (!user) {
    socket.disconnect();
    return;
  }
  
  socket.userId = user.id;
  socket.userName = user.name;
  
  socket.on('join-room', async (roomCode) => {
    try {
      const room = await joinRoom(user.id, roomCode);
      socket.roomId = room.id;
      socket.roomCode = room.room_code;
      
      socket.join(room.room_code);
      
      // Send room data
      const messages = await getRoomMessages(room.id);
      const participants = await getRoomParticipants(room.id);
      
      socket.emit('room-joined', {
        room: room,
        messages: messages,
        participants: participants
      });
      
      // Notify others
      socket.to(room.room_code).emit('user-joined', {
        id: user.id,
        name: user.name
      });
      
      // Update participants list for all users
      const updatedParticipants = await getRoomParticipants(room.id);
      io.to(room.room_code).emit('participants-updated', updatedParticipants);
      
    } catch (error) {
      socket.emit('error', error.message);
    }
  });
  
  socket.on('send-message', async (messageData) => {
    if (!socket.roomId) return;
    
    try {
      const savedMessage = await saveMessage(socket.roomId, user.id, messageData.message);
      
      io.to(socket.roomCode).emit('new-message', {
        id: savedMessage.id,
        message: savedMessage.message,
        user_name: savedMessage.user_name,
        user_id: savedMessage.user_id,
        created_at: savedMessage.created_at
      });
      
    } catch (error) {
      socket.emit('error', 'Failed to send message');
    }
  });
  
  socket.on('disconnect', async () => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('user-left', {
        id: user.id,
        name: user.name
      });
      
      if (socket.roomId) {
        const updatedParticipants = await getRoomParticipants(socket.roomId);
        socket.to(socket.roomCode).emit('participants-updated', updatedParticipants);
      }
    }
  });
});

// Routes
app.get("/", async (req, res) => {
  if (!dbConnected) {
    return res.send(html(`
      <div class="container">
        <div class="header">
          <h1>🏠 Room System</h1>
          <p>Connecting rooms in real-time</p>
        </div>
        <div class="main-content">
          <div class="welcome-section">
            <h2>Setting up...</h2>
            <p>Please wait while we initialize the database connection.</p>
          </div>
        </div>
      </div>
      <script>setTimeout(() => location.reload(), 3000);</script>
    `));
  }

  const user = await getOrCreateUser(req.session.id);
  
  if (!user) {
    return res.send(html(`
      <div class="container">
        <div class="header">
          <h1>🏠 Room System</h1>
          <p>Create and join rooms with short room codes</p>
        </div>
        <div class="main-content">
          <div class="welcome-section">
            <h2>Welcome! What's your name?</h2>
            <form action="/set-name" method="POST">
              <div class="form-group">
                <input type="text" name="name" placeholder="Enter your name" required maxlength="30">
              </div>
              <button type="submit" class="btn">Get Started</button>
            </form>
          </div>
        </div>
      </div>
    `));
  }
  
  const message = req.session.message;
  const error = req.session.error;
  delete req.session.message;
  delete req.session.error;
  
  res.send(html(`
    <div class="container">
      <div class="header">
        <h1>🏠 Room System</h1>
        <p>Create and join rooms with short room codes</p>
      </div>
      <div class="main-content">
        <div class="welcome-section">
          <h2>Hello, ${user.name}! 👋</h2>
          <p>Create a new room or join an existing one using a room code.</p>
          
          ${error ? `<div class="error">${error}</div>` : ''}
          ${message ? `<div class="success">${message}</div>` : ''}
          
          <div class="button-group">
            <a href="/create-room" class="btn">Create New Room</a>
            <a href="/join-room" class="btn btn-secondary">Join Room</a>
          </div>
          
          <p style="margin-top: 2rem; color: #718096; font-size: 0.9rem;">
            <a href="/logout" style="color: #667eea;">Change Name</a>
          </p>
        </div>
      </div>
    </div>
  `));
});

app.post("/set-name", async (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim().length === 0) {
    return res.redirect("/");
  }
  
  try {
    const user = await getOrCreateUser(req.session.id, name.trim());
    req.session.userId = user.id;
    req.session.message = "Welcome! You're all set.";
    res.redirect("/");
  } catch (error) {
    req.session.error = "Failed to create user profile.";
    res.redirect("/");
  }
});

app.get("/create-room", async (req, res) => {
  const user = await getOrCreateUser(req.session.id);
  if (!user) return res.redirect("/");
  
  res.send(html(`
    <div class="container">
      <div class="header">
        <h1>🏠 Create Room</h1>
      </div>
      <div class="main-content">
        <div class="welcome-section">
          <h2>Create a New Room</h2>
          <p>Give your room a name and get a short room code to share.</p>
          
          <form action="/create-room" method="POST">
            <div class="form-group">
              <label for="roomName">Room Name:</label>
              <input type="text" name="roomName" id="roomName" placeholder="Enter room name" required maxlength="100">
            </div>
            <div class="button-group">
              <button type="submit" class="btn">Create Room</button>
              <a href="/" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `));
});

app.post("/create-room", async (req, res) => {
  const user = await getOrCreateUser(req.session.id);
  if (!user) return res.redirect("/");
  
  const { roomName } = req.body;
  
  if (!roomName || roomName.trim().length === 0) {
    req.session.error = "Room name is required.";
    return res.redirect("/create-room");
  }
  
  try {
    const room = await createRoom(user.id, roomName.trim());
    res.redirect(`/room/${room.room_code}`);
  } catch (error) {
    req.session.error = "Failed to create room. Please try again.";
    res.redirect("/create-room");
  }
});

app.get("/join-room", async (req, res) => {
  const user = await getOrCreateUser(req.session.id);
  if (!user) return res.redirect("/");
  
  res.send(html(`
    <div class="container">
      <div class="header">
        <h1>🏠 Join Room</h1>
      </div>
      <div class="main-content">
        <div class="welcome-section">
          <h2>Join a Room</h2>
          <p>Enter the room code shared with you.</p>
          
          <form action="/join-room" method="POST">
            <div class="form-group">
              <label for="roomCode">Room Code:</label>
              <input type="text" name="roomCode" id="roomCode" placeholder="Enter room code" required maxlength="6" style="text-transform: uppercase;">
            </div>
            <div class="button-group">
              <button type="submit" class="btn">Join Room</button>
              <a href="/" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  `));
});

app.post("/join-room", async (req, res) => {
  const user = await getOrCreateUser(req.session.id);
  if (!user) return res.redirect("/");
  
  const { roomCode } = req.body;
  
  if (!roomCode || roomCode.trim().length === 0) {
    req.session.error = "Room code is required.";
    return res.redirect("/join-room");
  }
  
  try {
    await joinRoom(user.id, roomCode.trim());
    res.redirect(`/room/${roomCode.trim().toUpperCase()}`);
  } catch (error) {
    req.session.error = error.message;
    res.redirect("/join-room");
  }
});

app.get("/room/:roomCode", async (req, res) => {
  const user = await getOrCreateUser(req.session.id);
  if (!user) return res.redirect("/");
  
  const { roomCode } = req.params;
  
  try {
    const roomResult = await pool.query(
      "SELECT * FROM rooms WHERE room_code = $1 AND is_active = true",
      [roomCode.toUpperCase()]
    );
    
    if (roomResult.rows.length === 0) {
      req.session.error = "Room not found.";
      return res.redirect("/");
    }
    
    const room = roomResult.rows[0];
    
    res.send(html(`
      <div class="container">
        <div class="header">
          <h1>🏠 ${room.name}</h1>
        </div>
        <div class="main-content">
          <div style="padding: 1rem;">
            <div class="room-info">
              <h3>Room Code:</h3>
              <div class="room-code">${room.room_code}</div>
              <p>Share this code with others to join the room</p>
            </div>
            
            <div class="chat-container">
              <div class="participants-panel">
                <h3>Participants</h3>
                <div id="participants-list"></div>
              </div>
              
              <div class="chat-main">
                <div class="messages-container" id="messages-container">
                  <div style="text-align: center; color: #a0aec0; padding: 2rem;">
                    Loading messages...
                  </div>
                </div>
                
                <div class="message-input-container">
                  <input type="text" id="message-input" class="message-input" placeholder="Type your message..." maxlength="500">
                  <button id="send-btn" class="send-btn">Send</button>
                </div>
              </div>
            </div>
            
            <div style="text-align: center; margin-top: 1rem;">
              <a href="/" class="btn btn-danger">Leave Room</a>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        const socket = io();
        const messagesContainer = document.getElementById('messages-container');
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const participantsList = document.getElementById('participants-list');
        
        let currentUserId = ${user.id};
        let currentUserName = '${user.name}';
        
        // Join room
        socket.emit('join-room', '${roomCode.toUpperCase()}');
        
        // Room joined event
        socket.on('room-joined', (data) => {
          displayMessages(data.messages);
          updateParticipants(data.participants);
        });
        
        // New message event
        socket.on('new-message', (message) => {
          addMessage(message);
        });
        
        // Participants updated event
        socket.on('participants-updated', (participants) => {
          updateParticipants(participants);
        });
        
        // User joined event
        socket.on('user-joined', (user) => {
          addSystemMessage(user.name + ' joined the room');
        });
        
        // User left event
        socket.on('user-left', (user) => {
          addSystemMessage(user.name + ' left the room');
        });
        
        // Error event
        socket.on('error', (error) => {
          alert('Error: ' + error);
        });
        
        // Send message
        function sendMessage() {
          const message = messageInput.value.trim();
          if (message) {
            socket.emit('send-message', { message: message });
            messageInput.value = '';
          }
        }
        
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            sendMessage();
          }
        });
        
        function displayMessages(messages) {
          messagesContainer.innerHTML = '';
          messages.forEach(addMessage);
        }
        
        function addMessage(message) {
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message' + (message.user_id === currentUserId ? ' own-message' : '');
          
          const time = new Date(message.created_at).toLocaleTimeString();
          
          messageDiv.innerHTML = \`
            <div class="message-author">\${message.user_name}</div>
            <div class="message-content">\${escapeHtml(message.message)}</div>
            <div class="message-time">\${time}</div>
          \`;
          
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        function addSystemMessage(text) {
          const messageDiv = document.createElement('div');
          messageDiv.style.textAlign = 'center';
          messageDiv.style.color = '#a0aec0';
          messageDiv.style.fontSize = '0.9rem';
          messageDiv.style.margin = '1rem 0';
          messageDiv.textContent = text;
          
          messagesContainer.appendChild(messageDiv);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        function updateParticipants(participants) {
          participantsList.innerHTML = '';
          participants.forEach(participant => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant' + (participant.id === currentUserId ? ' current-user' : '');
            participantDiv.textContent = participant.name + (participant.id === currentUserId ? ' (You)' : '');
            participantsList.appendChild(participantDiv);
          });
        }
        
        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }
      </script>
    `));
    
  } catch (error) {
    req.session.error = "Failed to load room.";
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Start server
server.listen(PORT, () => {
  console.log(`Room System server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to get started`);
});

