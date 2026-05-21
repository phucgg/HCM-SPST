import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { z } from 'zod';
import { publicQuestions, findQuestion, questions } from './questions.js';
import { insertAttempt, getLeaderboard } from './db.js';

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '20kb' }));
app.use(cors({ origin: isProd ? false : allowedOrigin }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

const io = new Server(server, {
  cors: { origin: isProd ? false : allowedOrigin }
});

io.on('connection', socket => {
  socket.emit('leaderboard:update', getLeaderboard(10));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, tracking: false });
});

app.get('/api/questions', (_req, res) => {
  res.json({ questions: publicQuestions() });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json({ leaderboard: getLeaderboard(10) });
});

const submitSchema = z.object({
  nickname: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N}_ .-]+$/u),
  startedAt: z.number().int().positive(),
  answers: z.array(z.object({
    questionId: z.string(),
    selectedIndex: z.number().int().min(0).max(3)
  })).min(1).max(20)
});

app.post('/api/submit', (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  }

  const { nickname, startedAt, answers } = parsed.data;
  const now = Date.now();
  const durationMs = Math.max(0, Math.min(now - startedAt, 60 * 60 * 1000));

  let score = 0;
  const detail = answers.map(answer => {
    const q = findQuestion(answer.questionId);
    if (!q) return null;
    const correct = q.answerIndex === answer.selectedIndex;
    if (correct) score += 1;
    return {
      questionId: q.id,
      correct,
      correctIndex: q.answerIndex,
      explain: q.explain
    };
  }).filter(Boolean);

  insertAttempt({ nickname, score, total: questions.length, durationMs });
  const leaderboard = getLeaderboard(10);
  io.emit('leaderboard:update', leaderboard);

  res.json({ score, total: questions.length, durationMs, detail, leaderboard });
});

if (isProd) {
  const dist = path.join(process.cwd(), 'client', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('No analytics, no cookies, no IP/user-agent stored by app code.');
});
