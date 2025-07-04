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
    
    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_user_id ON beer_entries(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_created_at ON beer_entries(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_flappy_bird_scores_user_id ON flappy_bird_scores(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_flappy_bird_scores_score ON flappy_bird_scores(score DESC)`);
    
    // Add user_type column if it doesn't exist (migration)
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) DEFAULT 'participant' NOT NULL`);
    } catch (error) {
      // Column might already exist, continue
      console.log("user_type column already exists or error adding it:", error.message);
    }
    
    dbConnected = true;
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    dbConnected = false;
    // Don't exit, let the server start anyway
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
    "SELECT id, name, user_type FROM users WHERE session_id = $1",
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

async function getLeaderboard() {
  const participants = await pool.query(`
    SELECT u.name, COUNT(be.id) as count
    FROM users u
    LEFT JOIN beer_entries be ON u.id = be.user_id
    WHERE u.user_type = 'participant'
    GROUP BY u.id, u.name
    ORDER BY count DESC
  `);
  
  const observers = await pool.query(`
    SELECT u.name, COUNT(be.id) as count
    FROM users u
    LEFT JOIN beer_entries be ON u.id = be.user_id
    WHERE u.user_type = 'observer'
    GROUP BY u.id, u.name
    ORDER BY count DESC
  `);
  
  return {
    participants: participants.rows,
    observers: observers.rows
  };
}

async function getTotalBeerCount() {
  const result = await pool.query(`
    SELECT COUNT(*) as total 
    FROM beer_entries be
    JOIN users u ON be.user_id = u.id
    WHERE u.user_type = 'participant'
  `);
  return parseInt(result.rows[0].total);
}

async function saveFlappyBirdScore(userId, score) {
  await pool.query(
    "INSERT INTO flappy_bird_scores (user_id, score) VALUES ($1, $2)",
    [userId, score]
  );
}

async function getFlappyBirdLeaderboard() {
  const result = await pool.query(`
    SELECT u.name, MAX(fbs.score) as best_score, COUNT(fbs.id) as games_played
    FROM users u
    JOIN flappy_bird_scores fbs ON u.id = fbs.user_id
    GROUP BY u.id, u.name
    ORDER BY best_score DESC
    LIMIT 10
  `);
  return result.rows;
}

async function getUserBestFlappyScore(userId) {
  const result = await pool.query(
    "SELECT MAX(score) as best_score FROM flappy_bird_scores WHERE user_id = $1",
    [userId]
  );
  return result.rows[0]?.best_score || 0;
}

// HTML template
const html = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🍺 Beer Tally</title>
  <style>
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      margin: 0;
      padding: 1rem;
      line-height: 1.6;
      background-color: #f7fafc;
      color: #2d3748;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .header {
      padding: 1.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    
    .header h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
    }
    
    .content {
      padding: 1.5rem;
    }
    
    .total-counter {
      background: linear-gradient(135deg, #e8f4f8 0%, #d4edda 100%);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
      text-align: center;
      border: 2px solid #bee5eb;
    }
    
    .total-counter h2 {
      margin: 0;
      color: #2c5282;
      font-size: 1.25rem;
      font-weight: 600;
    }
    
    .total-number {
      font-size: 3rem;
      font-weight: 800;
      color: #d53f8c;
      display: block;
      margin-top: 0.5rem;
    }
    
    .user-info {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      text-align: center;
    }
    
    .user-info p {
      margin: 0;
      font-size: 1.1rem;
      color: #495057;
    }
    
    .button-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin: 1rem 0;
      flex-wrap: wrap;
    }
    
    button {
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 120px;
      min-height: 48px;
    }
    
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    
    button:active {
      transform: translateY(0);
    }
    
    .remove-btn {
      background: linear-gradient(135deg, #fc8181 0%, #e53e3e 100%);
      padding: 0.5rem 0.75rem;
      font-size: 0.9rem;
      min-width: 80px;
      min-height: 36px;
      opacity: 0.8;
    }
    
    .remove-btn:hover {
      opacity: 1;
    }
    
    .submit-btn {
      background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
    }
    
    .form-section {
      text-align: center;
      padding: 2rem;
    }
    
    .form-section h1 {
      color: #2d3748;
      margin-bottom: 1.5rem;
      font-size: 1.8rem;
    }
    
    input[type="text"] {
      padding: 0.75rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1.1rem;
      width: 100%;
      max-width: 300px;
      margin-bottom: 1rem;
    }
    
    input[type="text"]:focus {
      outline: none;
      border-color: #4299e1;
      box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
    }
    
    .leaderboard {
      margin-top: 2rem;
    }
    
    .leaderboard h2 {
      color: #2d3748;
      font-size: 1.5rem;
      margin-bottom: 1rem;
      text-align: center;
    }
    
    .table-container {
      overflow-x: auto;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    
    th {
      background: #f7fafc;
      font-weight: 600;
      color: #4a5568;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    tr:hover {
      background: #f8f9fa;
    }
    
    .current-user {
      background: #e6fffa !important;
      font-weight: 600;
    }
    
    .current-user:hover {
      background: #b2f5ea !important;
    }
    
    .loading {
      text-align: center;
      padding: 2rem;
      color: #718096;
    }
    
    /* Mobile optimizations */
    @media (max-width: 768px) {
      body {
        padding: 0.5rem;
      }
      
      .header h1 {
        font-size: 1.5rem;
      }
      
      .total-number {
        font-size: 2.5rem;
      }
      
      .content {
        padding: 1rem;
      }
      
      .button-group {
        flex-direction: column;
        gap: 0.75rem;
      }
      
      button {
        width: 100%;
        min-height: 52px;
        font-size: 1rem;
      }
      
      .remove-btn {
        min-height: 42px;
        font-size: 0.85rem;
      }
      
      th, td {
        padding: 0.5rem;
        font-size: 0.9rem;
      }
      
      .total-counter {
        padding: 1rem;
      }
      
      .total-counter h2 {
        font-size: 1.1rem;
      }
    }
    
    @media (max-width: 480px) {
      .header h1 {
        font-size: 1.3rem;
      }
      
      .total-number {
        font-size: 2rem;
      }
      
      th, td {
        padding: 0.4rem;
        font-size: 0.8rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${body}
  </div>
</body>
</html>`;

// Routes
app.get("/", async (req, res) => {
  try {
    // Check if database is connected
    if (!dbConnected) {
      return res.send(
        html(`<div class="header">
          <h1>🍺 Beer Tally</h1>
        </div>
        <div class="content">
          <div class="total-counter">
            <h2>Total Beers Consumed</h2>
            <span class="total-number">0</span>
          </div>
          <div class="loading">
            <p>⏳ Setting up database connection... Please refresh in a moment.</p>
          </div>
        </div>
        <script>setTimeout(() => location.reload(), 3000);</script>`)
      );
    }

    const user = await getOrCreateUser(req.session.id);
    
    if (!user) {
      return res.send(
        html(`<div class="header">
          <h1>🍺 Beer Tally</h1>
        </div>
        <div class="content">
          <div class="form-section">
            <h1>What's your name?</h1>
            <form method="post" action="/setname">
              <input type="text" name="name" placeholder="Enter your name" required autofocus>
              <br>
              <div style="margin: 1rem 0;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Role:</label>
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="user_type" value="participant" checked>
                    <span>🍺 Participant</span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="user_type" value="observer">
                    <span>👀 Observer</span>
                  </label>
                </div>
                <p style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">Observers can track beers but appear in a separate section</p>
              </div>
              <button type="submit" class="submit-btn">Let's Start! 🚀</button>
            </form>
          </div>
        </div>`)
      );
    }

    const beerCount = await getBeerCount(user.id);
    const totalBeerCount = await getTotalBeerCount();
    const leaderboard = await getLeaderboard();
    
    const participantRows = leaderboard.participants
      .map((d, i) => {
        const isCurrentUser = d.name === user.name;
        return `<tr${
          isCurrentUser ? ' class="current-user"' : ""
        }><td>${i + 1}</td><td>${escape(d.name)}</td><td>${d.count}</td></tr>`;
      })
      .join("");
      
    const observerRows = leaderboard.observers
      .map((d, i) => {
        const isCurrentUser = d.name === user.name;
        return `<tr${
          isCurrentUser ? ' class="current-user"' : ""
        }><td>${i + 1}</td><td>${escape(d.name)}</td><td>${d.count}</td></tr>`;
      })
      .join("");

    res.send(
      html(`<div class="header">
        <h1>🍺 Beer Tally</h1>
      </div>
      <div class="content">
        <div class="total-counter">
          <h2>Total Beers Consumed</h2>
          <span class="total-number">${totalBeerCount}</span>
        </div>
        <div class="user-info">
          <p>Hi, <strong>${escape(user.name)}</strong>${user.user_type === 'observer' ? ' 👀' : ' 🍺'}! You've had <strong>${
        beerCount
      }</strong> beer${beerCount === 1 ? "" : "s"}.</p>
        </div>
        <div class="button-group">
          <form method="post" action="/add" style="display:inline">
            <button type="submit">+1 Beer 🍺</button>
          </form>
          <form method="post" action="/remove" style="display:inline">
            <button type="submit" class="remove-btn">undo</button>
          </form>
          <a href="/game" style="display:inline-block; margin-left:10px; padding:10px 20px; background:#FF6B6B; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">🐦 Play Flappy Bird!</a>
          <a href="/flappy-leaderboard" style="display:inline-block; margin-left:10px; padding:10px 20px; background:#9B59B6; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">🏆 Bird Scores</a>
        </div>
        <div class="leaderboard">
          <h2>🏆 Participants</h2>
          <div class="table-container">
            <table><tr><th>#</th><th>Name</th><th>Beers</th></tr>${participantRows}</table>
          </div>
          ${observerRows.length > 0 ? `
          <h2 style="margin-top: 2rem;">👀 Observers</h2>
          <div class="table-container">
            <table><tr><th>#</th><th>Name</th><th>Beers</th></tr>${observerRows}</table>
          </div>` : ''}
        </div>
      </div>`)
    );
  } catch (error) {
    console.error("Error in GET /:", error);
    res.status(500).send("Server error");
  }
});

// Set name
app.post("/setname", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.redirect("/");
    }
    const name = req.body.name.trim().slice(0, 30);
    const userType = req.body.user_type === 'observer' ? 'observer' : 'participant';
    
    if (name) {
      await pool.query(
        "INSERT INTO users (session_id, name, user_type) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO UPDATE SET name = $2, user_type = $3",
        [req.session.id, name, userType]
      );
    }
    res.redirect("/");
  } catch (error) {
    console.error("Error in POST /setname:", error);
    res.status(500).send("Server error");
  }
});

// Add beer
app.post("/add", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.redirect("/");
    }
    const user = await getOrCreateUser(req.session.id);
    if (user) {
      await pool.query(
        "INSERT INTO beer_entries (user_id) VALUES ($1)",
        [user.id]
      );
    }
    res.redirect("/");
  } catch (error) {
    console.error("Error in POST /add:", error);
    res.status(500).send("Server error");
  }
});

// Remove beer
app.post("/remove", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.redirect("/");
    }
    const user = await getOrCreateUser(req.session.id);
    if (user) {
      // Remove the most recent beer entry
      await pool.query(
        "DELETE FROM beer_entries WHERE id = (SELECT id FROM beer_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)",
        [user.id]
      );
    }
    res.redirect("/");
  } catch (error) {
    console.error("Error in POST /remove:", error);
    res.status(500).send("Server error");
  }
});

// Submit Flappy Bird score
app.post("/submit-score", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ error: "Database not connected" });
    }
    
    const user = await getOrCreateUser(req.session.id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    const { score } = req.body;
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: "Invalid score" });
    }
    
    await saveFlappyBirdScore(user.id, score);
    const bestScore = await getUserBestFlappyScore(user.id);
    
    res.json({ 
      success: true, 
      score,
      bestScore,
      isNewBest: score === bestScore
    });
  } catch (error) {
    console.error("Error in POST /submit-score:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Flappy Bird Game Route
app.get("/game", (req, res) => {
  const gameHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐦 Flappy Bird Game</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #87CEEB 0%, #98D8E8 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      overflow: hidden;
    }
    
    .game-container {
      text-align: center;
      position: relative;
    }
    
    canvas {
      border: 4px solid #333;
      border-radius: 10px;
      background: linear-gradient(to bottom, #87CEEB 0%, #98D8E8 70%, #90EE90 100%);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    
    .score {
      position: absolute;
      top: 20px;
      left: 20px;
      font-size: 24px;
      font-weight: bold;
      color: white;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    }
    
    .game-over {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      display: none;
    }
    
    .controls {
      margin-top: 20px;
      color: white;
      font-size: 18px;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    }
    
    .home-btn {
      margin-top: 15px;
      padding: 10px 20px;
      font-size: 16px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    
    .home-btn:hover {
      background: #45a049;
    }
  </style>
</head>
<body>
  <div class="game-container">
    <canvas id="gameCanvas" width="400" height="600"></canvas>
    <div class="score" id="score">Score: 0</div>
    <div class="game-over" id="gameOver">
      <h2>Game Over!</h2>
      <p>Your Score: <span id="finalScore">0</span></p>
      <button onclick="restartGame()">Play Again</button>
    </div>
    <div class="controls">
      <p>Click or Press SPACE to Flap!</p>
      <a href="/" class="home-btn">🍺 Back to Beer Tally</a>
      <a href="/flappy-leaderboard" class="home-btn" style="background: #9B59B6; margin-left: 10px;">🏆 Leaderboard</a>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const gameOverElement = document.getElementById('gameOver');
    const finalScoreElement = document.getElementById('finalScore');

    // Game variables
    let bird = {
      x: 50,
      y: 300,
      width: 40,
      height: 40,
      velocity: 0,
      gravity: 0.5,
      jump: -10
    };

    let pipes = [];
    let score = 0;
    let gameRunning = true;
    let gameStarted = false;

    // Face emoji as the bird
    const birdEmoji = '😄';

    // Game loop
    function gameLoop() {
      if (!gameRunning) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update bird
      if (gameStarted) {
        bird.velocity += bird.gravity;
        bird.y += bird.velocity;

        // Check boundaries
        if (bird.y <= 0 || bird.y >= canvas.height - bird.height) {
          gameOver();
        }

        // Update pipes
        updatePipes();
      }

      // Draw bird (face emoji)
      ctx.font = '40px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(birdEmoji, bird.x + bird.width/2, bird.y + bird.height/2 + 12);

      // Draw pipes
      drawPipes();

      // Draw ground
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, canvas.height - 50, canvas.width, 50);

      // Update score display
      scoreElement.textContent = 'Score: ' + score;

      // Show start message
      if (!gameStarted) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click or Press SPACE to Start!', canvas.width/2, canvas.height/2);
      }

      requestAnimationFrame(gameLoop);
    }

    function updatePipes() {
      // Add new pipe
      if (pipes.length === 0 || pipes[pipes.length - 1].x < canvas.width - 200) {
        const gap = 150;
        const pipeHeight = Math.random() * (canvas.height - gap - 100) + 50;
        pipes.push({
          x: canvas.width,
          topHeight: pipeHeight,
          bottomY: pipeHeight + gap,
          bottomHeight: canvas.height - pipeHeight - gap - 50,
          passed: false
        });
      }

      // Update pipe positions
      for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= 2;

        // Check collision
        if (pipes[i].x < bird.x + bird.width && pipes[i].x + 50 > bird.x) {
          if (bird.y < pipes[i].topHeight || bird.y + bird.height > pipes[i].bottomY) {
            gameOver();
          }
        }

        // Check if bird passed pipe
        if (!pipes[i].passed && pipes[i].x + 50 < bird.x) {
          pipes[i].passed = true;
          score++;
        }

        // Remove off-screen pipes
        if (pipes[i].x + 50 < 0) {
          pipes.splice(i, 1);
        }
      }
    }

    function drawPipes() {
      ctx.fillStyle = '#228B22';
      ctx.strokeStyle = '#006400';
      ctx.lineWidth = 2;

      pipes.forEach(pipe => {
        // Top pipe
        ctx.fillRect(pipe.x, 0, 50, pipe.topHeight);
        ctx.strokeRect(pipe.x, 0, 50, pipe.topHeight);

        // Bottom pipe
        ctx.fillRect(pipe.x, pipe.bottomY, 50, pipe.bottomHeight);
        ctx.strokeRect(pipe.x, pipe.bottomY, 50, pipe.bottomHeight);
      });
    }

    function jump() {
      if (!gameStarted) {
        gameStarted = true;
      }
      if (gameRunning) {
        bird.velocity = bird.jump;
      }
    }

    function gameOver() {
      gameRunning = false;
      finalScoreElement.textContent = score;
      gameOverElement.style.display = 'block';
      
      // Submit score to server
      if (score > 0) {
        submitScore(score);
      }
    }
    
    async function submitScore(gameScore) {
      try {
        const response = await fetch('/submit-score', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ score: gameScore })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.isNewBest) {
            // Show new best score notification
            const gameOverDiv = document.getElementById('gameOver');
            const newBestMsg = document.createElement('p');
            newBestMsg.style.color = '#FFD700';
            newBestMsg.style.fontWeight = 'bold';
            newBestMsg.textContent = '🎉 New Best Score! 🎉';
            gameOverDiv.insertBefore(newBestMsg, gameOverDiv.querySelector('button'));
          }
        }
      } catch (error) {
        console.error('Error submitting score:', error);
      }
    }

    function restartGame() {
      bird = {
        x: 50,
        y: 300,
        width: 40,
        height: 40,
        velocity: 0,
        gravity: 0.5,
        jump: -10
      };
      pipes = [];
      score = 0;
      gameRunning = true;
      gameStarted = false;
      gameOverElement.style.display = 'none';
      
      // Clean up any new best score notifications
      const gameOverDiv = document.getElementById('gameOver');
      const newBestMsg = gameOverDiv.querySelector('p[style*="color: rgb(255, 215, 0)"]');
      if (newBestMsg) {
        newBestMsg.remove();
      }
      
      gameLoop(); // Restart the game loop
    }

    // Event listeners
    canvas.addEventListener('click', jump);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    });

    // Start game loop
    gameLoop();
  </script>
</body>
</html>`;

  res.send(gameHtml);
});

// Flappy Bird Leaderboard Route
app.get("/flappy-leaderboard", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.send(
        html(`<div class="header">
          <h1>🐦 Flappy Bird Leaderboard</h1>
        </div>
        <div class="content">
          <div class="loading">
            <p>⏳ Setting up database connection... Please refresh in a moment.</p>
          </div>
        </div>
        <script>setTimeout(() => location.reload(), 3000);</script>`)
      );
    }

    const leaderboard = await getFlappyBirdLeaderboard();
    const user = await getOrCreateUser(req.session.id);
    
    const leaderboardRows = leaderboard
      .map((player, i) => {
        const isCurrentUser = user && player.name === user.name;
        return `<tr${
          isCurrentUser ? ' class="current-user"' : ""
        }><td>${i + 1}</td><td>${escape(player.name)}</td><td>${player.best_score}</td><td>${player.games_played}</td></tr>`;
      })
      .join("");

    const currentUserBest = user ? await getUserBestFlappyScore(user.id) : 0;

    res.send(
      html(`<div class="header">
        <h1>🐦 Flappy Bird Leaderboard</h1>
      </div>
      <div class="content">
        ${user ? `<div class="user-info">
          <p>Hi, <strong>${escape(user.name)}</strong>! Your best score: <strong>${currentUserBest}</strong></p>
        </div>` : ''}
        <div class="button-group">
          <a href="/" class="home-btn" style="display:inline-block; padding:10px 20px; background:#4CAF50; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">🍺 Back to Beer Tally</a>
          <a href="/game" style="display:inline-block; margin-left:10px; padding:10px 20px; background:#FF6B6B; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">🐦 Play Again!</a>
        </div>
        <div class="leaderboard">
          <h2>🏆 Top Scores</h2>
          <div class="table-container">
            <table>
              <tr><th>#</th><th>Player</th><th>Best Score</th><th>Games Played</th></tr>
              ${leaderboardRows.length > 0 ? leaderboardRows : '<tr><td colspan="4" style="text-align: center; color: #666;">No scores yet! Be the first to play!</td></tr>'}
            </table>
          </div>
        </div>
      </div>`)
    );
  } catch (error) {
    console.error("Error in GET /flappy-leaderboard:", error);
    res.status(500).send("Server error");
  }
});

// Helper function
const escape = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Start server
app.listen(PORT, () => {
  console.log(`🍻 Beer Tally server running on port ${PORT}`);
  console.log(`🔗 Open http://localhost:${PORT}`);
});

