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
    
    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_user_id ON beer_entries(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_beer_entries_created_at ON beer_entries(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_session_id ON users(session_id)`);
    
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

// Helper functions
async function getOrCreateUser(sessionId) {
  const result = await pool.query(
    "SELECT id, name FROM users WHERE session_id = $1",
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
  const result = await pool.query(`
    SELECT u.name, COUNT(be.id) as count
    FROM users u
    LEFT JOIN beer_entries be ON u.id = be.user_id
    GROUP BY u.id, u.name
    ORDER BY count DESC
  `);
  return result.rows;
}

async function getTotalBeerCount() {
  const result = await pool.query(
    "SELECT COUNT(*) as total FROM beer_entries"
  );
  return parseInt(result.rows[0].total);
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
              <button type="submit" class="submit-btn">Let's Start! 🚀</button>
            </form>
          </div>
        </div>`)
      );
    }

    const beerCount = await getBeerCount(user.id);
    const totalBeerCount = await getTotalBeerCount();
    const leaderboard = await getLeaderboard();
    
    const rankRows = leaderboard
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
          <p>Hi, <strong>${escape(user.name)}</strong>! You've had <strong>${
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
        </div>
        <div class="leaderboard">
          <h2>🏆 Leaderboard</h2>
          <div class="table-container">
            <table><tr><th>#</th><th>Name</th><th>Beers</th></tr>${rankRows}</table>
          </div>
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
    if (name) {
      await pool.query(
        "INSERT INTO users (session_id, name) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET name = $2",
        [req.session.id, name]
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

// Helper function
const escape = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Start server
app.listen(PORT, () => {
  console.log(`🍻 Beer Tally server running on port ${PORT}`);
  console.log(`🔗 Open http://localhost:${PORT}`);
});

