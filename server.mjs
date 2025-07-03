// server.js
import express from "express";
import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";

const app = express();
const PORT = process.env.PORT || 3000;

console.log(process.env.DATABASE_URL);
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

// Session store using PostgreSQL (with fallback to memory store)
const PgSession = connectPgSimple(session);

app.use(
  session({
    // Use memory store initially, will fall back to database store when connected
    secret: process.env.SESSION_SECRET || "REPLACE-THIS-WITH-RANDOM-STRING",
    resave: false,
    saveUninitialized: false,
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

// HTML template
const html = (body) => `<!doctype html><title>🍺 Beer Tally</title>
<style>
 body{font-family:sans-serif;margin:2rem;line-height:1.4}
 h1{margin-top:0} table{border-collapse:collapse}
 td,th{padding:.4rem .8rem;border:1px solid #ccc;text-align:left}
 button{font-size:1.2rem;padding:.4rem 1.2rem}
</style>${body}`;

// Routes
app.get("/", async (req, res) => {
  try {
    // Check if database is connected
    if (!dbConnected) {
      return res.send(
        html(`<h1>🍺 Beer Tally</h1>
        <p>⏳ Setting up database connection... Please refresh in a moment.</p>
        <script>setTimeout(() => location.reload(), 3000);</script>`)
      );
    }

    const user = await getOrCreateUser(req.session.id);
    
    if (!user) {
      return res.send(
        html(`<h1>Your name?</h1>
        <form method="post" action="/setname">
          <input name="name" required autofocus>
          <button>OK</button>
        </form>`)
      );
    }

    const beerCount = await getBeerCount(user.id);
    const leaderboard = await getLeaderboard();
    
    const rankRows = leaderboard
      .map((d, i) => {
        const isCurrentUser = d.name === user.name;
        return `<tr${
          isCurrentUser ? ' style="font-weight:bold;background:#f5f5f5"' : ""
        }><td>${i + 1}</td><td>${escape(d.name)}</td><td>${d.count}</td></tr>`;
      })
      .join("");

    res.send(
      html(`<h1>🍺 Beer Tally</h1>
      <p>Hi, <strong>${escape(user.name)}</strong>! You've had <strong>${
        beerCount
      }</strong> beer${beerCount === 1 ? "" : "s"}.</p>
      <form method="post" action="/add" style="display:inline"><button>+1 Beer</button></form>
      <form method="post" action="/remove" style="display:inline;margin-left:10px"><button>-1 Beer</button></form>
      <h2>Leaderboard</h2>
      <table><tr><th>#</th><th>Name</th><th>Beers</th></tr>${rankRows}</table>`)
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

