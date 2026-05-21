import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");
const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
const dbDir = path.dirname(dbPath);

console.log("[DB] version: 4-station-final");
console.log("[DB] DB_PATH:", process.env.DB_PATH || "(not set)");
console.log("[DB] dbPath:", dbPath);
console.log("[DB] dbDir:", dbDir);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    station_results_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quiz_sessions (
    session_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    started_at_ms INTEGER NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '{}',
    results_json TEXT NOT NULL DEFAULT '{}',
    session_questions_json TEXT NOT NULL DEFAULT '[]',
    submitted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(table, column, ddl) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((col) => col.name);

  if (!columns.includes(column)) {
    db.exec(ddl);
  }
}

ensureColumn(
  "attempts",
  "station_results_json",
  "ALTER TABLE attempts ADD COLUMN station_results_json TEXT NOT NULL DEFAULT '[]'"
);

ensureColumn(
  "quiz_sessions",
  "answers_json",
  "ALTER TABLE quiz_sessions ADD COLUMN answers_json TEXT NOT NULL DEFAULT '{}'"
);

ensureColumn(
  "quiz_sessions",
  "results_json",
  "ALTER TABLE quiz_sessions ADD COLUMN results_json TEXT NOT NULL DEFAULT '{}'"
);

ensureColumn(
  "quiz_sessions",
  "session_questions_json",
  "ALTER TABLE quiz_sessions ADD COLUMN session_questions_json TEXT NOT NULL DEFAULT '[]'"
);

ensureColumn(
  "quiz_sessions",
  "submitted",
  "ALTER TABLE quiz_sessions ADD COLUMN submitted INTEGER NOT NULL DEFAULT 0"
);

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDisplayName(displayName) {
  return String(displayName || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 30);
}

export function createSession({
  sessionId,
  displayName,
  startedAtMs,
  sessionQuestions
}) {
  const safeName = normalizeDisplayName(displayName);

  if (!sessionId) throw new Error("sessionId is required");
  if (!safeName) throw new Error("displayName is required");

  db.prepare(`
    INSERT INTO quiz_sessions (
      session_id,
      display_name,
      started_at_ms,
      answers_json,
      results_json,
      session_questions_json,
      submitted
    )
    VALUES (?, ?, ?, '{}', '{}', ?, 0)
  `).run(
    sessionId,
    safeName,
    Number(startedAtMs),
    JSON.stringify(Array.isArray(sessionQuestions) ? sessionQuestions : [])
  );
}

export function getSession(sessionId) {
  const row = db.prepare(`
    SELECT
      session_id AS sessionId,
      display_name AS displayName,
      started_at_ms AS startedAtMs,
      answers_json AS answersJson,
      results_json AS resultsJson,
      session_questions_json AS sessionQuestionsJson,
      submitted
    FROM quiz_sessions
    WHERE session_id = ?
  `).get(sessionId);

  if (!row) return null;

  return {
    sessionId: row.sessionId,
    displayName: row.displayName,
    startedAtMs: Number(row.startedAtMs),
    answers: safeJsonParse(row.answersJson, {}),
    results: safeJsonParse(row.resultsJson, {}),
    sessionQuestions: safeJsonParse(row.sessionQuestionsJson, []),
    submitted: Number(row.submitted) === 1
  };
}

export function saveSessionProgress({ sessionId, answers, results }) {
  if (!sessionId) throw new Error("sessionId is required");

  db.prepare(`
    UPDATE quiz_sessions
    SET answers_json = ?, results_json = ?
    WHERE session_id = ?
  `).run(
    JSON.stringify(answers || {}),
    JSON.stringify(results || {}),
    sessionId
  );
}

export function markSessionSubmitted(sessionId) {
  if (!sessionId) throw new Error("sessionId is required");

  db.prepare(`
    UPDATE quiz_sessions
    SET submitted = 1
    WHERE session_id = ?
  `).run(sessionId);
}

export function insertAttempt({
  displayName,
  score,
  total,
  durationSeconds,
  stationResults
}) {
  const safeName = normalizeDisplayName(displayName);

  if (!safeName) throw new Error("displayName is required");

  const safeScore = Number.isFinite(Number(score))
    ? Math.max(0, Math.floor(Number(score)))
    : 0;

  const safeTotal = Number.isFinite(Number(total))
    ? Math.max(0, Math.floor(Number(total)))
    : 0;

  const safeDuration = Number.isFinite(Number(durationSeconds))
    ? Math.max(0, Math.floor(Number(durationSeconds)))
    : 0;

  db.prepare(`
    INSERT INTO attempts (
      display_name,
      score,
      total,
      duration_seconds,
      station_results_json
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    safeName,
    safeScore,
    safeTotal,
    safeDuration,
    JSON.stringify(Array.isArray(stationResults) ? stationResults : [])
  );
}

export function getLeaderboard() {
  return db.prepare(`
    SELECT
      display_name AS displayName,
      score,
      total,
      duration_seconds AS durationSeconds,
      created_at AS createdAt
    FROM attempts
    ORDER BY
      score DESC,
      duration_seconds ASC,
      created_at ASC
    LIMIT 20
  `).all();
}