import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'server', 'app.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 2 AND 24),
  score INTEGER NOT NULL CHECK(score >= 0),
  total INTEGER NOT NULL CHECK(total > 0),
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attempts_leaderboard
ON attempts(score DESC, duration_ms ASC, created_at ASC);
`);

export function insertAttempt({ nickname, score, total, durationMs }) {
  const stmt = db.prepare(`
    INSERT INTO attempts (nickname, score, total, duration_ms)
    VALUES (@nickname, @score, @total, @durationMs)
  `);
  return stmt.run({ nickname, score, total, durationMs });
}

export function getLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT nickname, score, total, duration_ms AS durationMs, created_at AS createdAt
    FROM attempts
    ORDER BY score DESC, duration_ms ASC, created_at ASC
    LIMIT ?
  `).all(limit);
}
