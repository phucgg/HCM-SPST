import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { questions, stations, getStationById } from "./questions.js";
import {
  createSession,
  getSession,
  saveSessionProgress,
  markSessionSubmitted,
  insertAttempt,
  getLeaderboard
} from "./db.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

const rawTimeLimit = Number(process.env.QUIZ_TIME_LIMIT_SECONDS || 600);
const TIME_LIMIT_SECONDS = Math.min(
  600,
  Math.max(60, Number.isFinite(rawTimeLimit) ? rawTimeLimit : 600)
);

app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false
});

function cleanDisplayName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 30);
}

function shuffleArray(array) {
  const cloned = [...array];

  for (let i = cloned.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }

  return cloned;
}

function createSessionQuestions() {
  const orderedStations = [...stations].sort((a, b) => a.order - b.order);
  const sessionQuestions = [];

  for (const station of orderedStations) {
    const stationQuestions = questions.filter(
      (question) => question.stationId === station.id
    );

    const shuffledStationQuestions = shuffleArray(stationQuestions);

    for (const question of shuffledStationQuestions) {
      const optionOrder = shuffleArray(
        question.options.map((_, index) => index)
      );

      sessionQuestions.push({
        questionId: question.id,
        stationId: question.stationId,
        optionOrder
      });
    }
  }

  return sessionQuestions;
}

function getPublicQuestionsFromSession(sessionQuestions) {
  const questionMap = new Map(questions.map((question) => [question.id, question]));

  return sessionQuestions
    .map((sessionQuestion) => {
      const question = questionMap.get(sessionQuestion.questionId);

      if (!question) return null;

      const station = getStationById(question.stationId);

      const optionOrder = Array.isArray(sessionQuestion.optionOrder)
        ? sessionQuestion.optionOrder
        : question.options.map((_, index) => index);

      return {
        id: question.id,
        stationId: question.stationId,
        stationTitle: station?.title || "",
        stationShortTitle: station?.shortTitle || "",
        question: question.question,
        options: optionOrder.map((originalOptionIndex) => {
          return question.options[originalOptionIndex];
        })
      };
    })
    .filter(Boolean);
}

function getElapsedSeconds(startedAtMs) {
  const elapsed = Math.floor((Date.now() - Number(startedAtMs)) / 1000);

  if (!Number.isFinite(elapsed)) return 0;

  return Math.max(0, Math.min(TIME_LIMIT_SECONDS, elapsed));
}

function isTimeExpired(session) {
  return Date.now() - Number(session.startedAtMs) >= TIME_LIMIT_SECONDS * 1000;
}

function buildStationResults(results = {}) {
  return stations
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((station) => {
      const stationQuestions = questions.filter(
        (question) => question.stationId === station.id
      );

      const total = stationQuestions.length;
      const score = stationQuestions.reduce((sum, question) => {
        return sum + (results[question.id] === true ? 1 : 0);
      }, 0);

      return {
        stationId: station.id,
        order: station.order,
        title: station.title,
        shortTitle: station.shortTitle,
        badge: station.badge,
        score,
        total,
        completed: score === total
      };
    });
}

app.get("/api/config", (req, res) => {
  res.json({
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    stations
  });
});

app.get("/api/leaderboard", (req, res) => {
  res.json(getLeaderboard());
});

app.post("/api/start", limiter, (req, res) => {
  const displayName = cleanDisplayName(req.body?.displayName);

  if (!displayName) {
    return res.status(400).json({
      message: "Vui lòng nhập tên trước khi làm bài."
    });
  }

  const sessionId = crypto.randomUUID();
  const startedAtMs = Date.now();
  const sessionQuestions = createSessionQuestions();

  createSession({
    sessionId,
    displayName,
    startedAtMs,
    sessionQuestions
  });

  res.json({
    sessionId,
    displayName,
    startedAtMs,
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    stations,
    questions: getPublicQuestionsFromSession(sessionQuestions)
  });
});

app.get("/api/session/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);

  if (!session) {
    return res.status(404).json({
      message: "Phiên làm bài không tồn tại."
    });
  }

  res.json({
    sessionId: session.sessionId,
    displayName: session.displayName,
    startedAtMs: session.startedAtMs,
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    answers: session.answers,
    results: session.results,
    submitted: session.submitted,
    stations,
    questions: getPublicQuestionsFromSession(session.sessionQuestions)
  });
});

app.post("/api/check-answer", limiter, (req, res) => {
  const { sessionId, questionId, selectedIndex } = req.body || {};

  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({
      message: "Phiên làm bài không tồn tại. Vui lòng bắt đầu lại."
    });
  }

  if (session.submitted) {
    return res.status(400).json({
      message: "Bài này đã được nộp."
    });
  }

  if (isTimeExpired(session)) {
    return res.status(403).json({
      message: "Đã hết thời gian làm bài."
    });
  }

  const sessionQuestion = session.sessionQuestions.find((item) => {
    return item.questionId === questionId;
  });

  if (!sessionQuestion) {
    return res.status(400).json({
      message: "Câu hỏi không thuộc phiên làm bài này."
    });
  }

  const question = questions.find((item) => item.id === questionId);

  if (!question) {
    return res.status(404).json({
      message: "Không tìm thấy câu hỏi."
    });
  }

  const optionIndex = Number(selectedIndex);

  if (
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex >= question.options.length
  ) {
    return res.status(400).json({
      message: "Đáp án không hợp lệ."
    });
  }

  const answers = session.answers || {};
  const results = session.results || {};

  if (Object.prototype.hasOwnProperty.call(results, questionId)) {
    return res.json({
      selectedIndex: answers[questionId],
      isCorrect: results[questionId],
      locked: true,
      stationId: question.stationId,
      feedback: question.feedback
    });
  }

  const originalOptionIndex = sessionQuestion.optionOrder[optionIndex];
  const isCorrect = originalOptionIndex === question.correctIndex;

  answers[questionId] = optionIndex;
  results[questionId] = isCorrect;

  saveSessionProgress({
    sessionId,
    answers,
    results
  });

  res.json({
    selectedIndex: optionIndex,
    isCorrect,
    locked: true,
    stationId: question.stationId,
    feedback: question.feedback
  });
});

app.post("/api/submit", limiter, (req, res) => {
  const { sessionId } = req.body || {};

  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({
      message: "Phiên làm bài không tồn tại. Vui lòng bắt đầu lại."
    });
  }

  if (session.submitted) {
    return res.status(400).json({
      message: "Bài này đã được nộp trước đó."
    });
  }

  const answers = session.answers || {};
  const results = session.results || {};

  let score = 0;

  const detailResults = session.sessionQuestions.map((sessionQuestion) => {
    const questionId = sessionQuestion.questionId;
    const isCorrect = results[questionId] === true;

    if (isCorrect) score++;

    return {
      questionId,
      stationId: sessionQuestion.stationId,
      selectedIndex: Object.prototype.hasOwnProperty.call(answers, questionId)
        ? answers[questionId]
        : null,
      isCorrect
    };
  });

  const total = questions.length;
  const durationSeconds = getElapsedSeconds(session.startedAtMs);
  const stationResults = buildStationResults(results);

  insertAttempt({
    displayName: session.displayName,
    score,
    total,
    durationSeconds,
    stationResults
  });

  markSessionSubmitted(sessionId);

  const leaderboard = getLeaderboard();

  io.emit("leaderboard:update", leaderboard);

  res.json({
    score,
    total,
    durationSeconds,
    results: detailResults,
    stationResults,
    leaderboard
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDistPath = path.join(__dirname, "../client/dist");

app.use(express.static(clientDistPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Quiz time limit: ${TIME_LIMIT_SECONDS}s`);
});