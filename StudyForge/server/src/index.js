import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { db } = await import("./db.js");
const auth = await import("./auth.js");
const { extractPdfText } = await import("./extractPdf.js");
const ai = await import("./gemini.js");

const app = express();
const port = Number(process.env.PORT) || 3001;
const now = () => new Date().toISOString();
const MAX_NOTES_CHARS = 200_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!ok) {
      const error = new Error("Please upload a PDF file (.pdf).");
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

// ---------- Security middleware ----------
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  next();
});
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",");
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));

// Simple in-memory rate limiter (per IP + route group)
const hits = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const nowMs = Date.now();
    const entry = hits.get(key);
    if (!entry || nowMs > entry.reset) {
      hits.set(key, { count: 1, reset: nowMs + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: "Too many attempts. Please wait a minute and try again." });
      return;
    }
    next();
  };
}
const authLimiter = rateLimit("auth", 10, 60_000);
const aiLimiter = rateLimit("ai", 20, 60_000);
app.use(express.json({ limit: "1mb" }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
});

// ---------- Auth ----------
app.post("/api/auth/signup", authLimiter, wrap(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 2 || name.length > 60) throw badRequest("Please enter your name (2-60 characters).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Please enter a valid email address.");
  if (password.length < 8) throw badRequest("Password must be at least 8 characters.");
  if (auth.findUserByEmail(email)) throw badRequest("An account with this email already exists. Try signing in.");
  const user = auth.createUser({ name, email, password });
  res.status(201).json({ user, token: auth.createSession(user.id) });
}));

app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const row = auth.findUserByEmail(email);
  if (!row || !auth.verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  res.json({ user: { id: row.id, email: row.email, name: row.name }, token: auth.createSession(row.id) });
}));

app.post("/api/auth/logout", auth.requireAuth, (req, res) => {
  auth.deleteSession(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth.requireAuth, (req, res) => res.json({ user: req.user }));

// ---------- Study sets ----------
function ownedSet(req) {
  const set = db.prepare("SELECT * FROM study_sets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!set) throw Object.assign(new Error("Study set not found."), { status: 404 });
  return set;
}

app.get("/api/sets", auth.requireAuth, (req, res) => {
  const sets = db.prepare(
    `SELECT s.id, s.title, s.source_name, s.page_count, s.created_at,
       (SELECT COUNT(*) FROM flashcards f WHERE f.set_id = s.id) AS flashcard_count,
       (SELECT COUNT(*) FROM quiz_attempts a WHERE a.set_id = s.id) AS attempt_count,
       (SELECT ROUND(100.0 * score / total) FROM quiz_attempts a WHERE a.set_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_score,
       (SELECT MAX(ROUND(100.0 * score / total)) FROM quiz_attempts a WHERE a.set_id = s.id) AS best_score
     FROM study_sets s WHERE s.user_id = ? ORDER BY s.created_at DESC`,
  ).all(req.user.id);
  const attempts = db.prepare(
    `SELECT a.set_id, a.score, a.total, a.created_at FROM quiz_attempts a
     JOIN study_sets s ON s.id = a.set_id WHERE s.user_id = ? ORDER BY a.created_at`,
  ).all(req.user.id);
  res.json({ sets, attempts });
});

app.post("/api/sets", auth.requireAuth, upload.single("file"), wrap(async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (title.length < 2 || title.length > 120) throw badRequest("Please give your study set a title (2-120 characters).");

  let content;
  let pageCount = 1;
  let sourceName = "Pasted notes";
  if (req.file) {
    const extracted = await extractPdfText(req.file.buffer);
    content = extracted.text;
    pageCount = extracted.pageCount;
    sourceName = req.file.originalname;
  } else {
    const text = String(req.body?.text || "").trim();
    if (text.length < 100) throw badRequest("Upload a PDF or paste at least 100 characters of notes.");
    content = `--- Page 1 ---\n${text}`;
  }
  if (content.length > MAX_NOTES_CHARS) throw badRequest("These notes are too long. Please upload one chapter or lecture at a time.");

  const id = randomUUID();
  db.prepare(
    "INSERT INTO study_sets (id, user_id, title, source_name, page_count, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, req.user.id, title, sourceName, pageCount, content, now());
  res.status(201).json({ set: { id, title, source_name: sourceName, page_count: pageCount } });
}));

app.get("/api/sets/:id", auth.requireAuth, (req, res) => {
  const set = ownedSet(req);
  const quiz = db.prepare("SELECT * FROM quizzes WHERE set_id = ? ORDER BY created_at DESC LIMIT 1").get(set.id);
  const flashcards = db.prepare("SELECT id, front, back, page, status FROM flashcards WHERE set_id = ? ORDER BY position").all(set.id);
  const attempts = db.prepare("SELECT score, total, created_at FROM quiz_attempts WHERE set_id = ? ORDER BY created_at").all(set.id);
  const messages = db.prepare("SELECT id, role, content, citations_json, created_at FROM chat_messages WHERE set_id = ? ORDER BY created_at").all(set.id)
    .map((m) => ({ ...m, pages: m.citations_json ? JSON.parse(m.citations_json) : [] }));
  res.json({
    set: { id: set.id, title: set.title, source_name: set.source_name, page_count: set.page_count, created_at: set.created_at, preview: set.content.slice(0, 1500) },
    quiz: quiz ? { id: quiz.id, questions: JSON.parse(quiz.questions_json).map(({ answerIndex, explanation, ...q }) => q) } : null,
    flashcards,
    attempts,
    messages,
  });
});

app.delete("/api/sets/:id", auth.requireAuth, (req, res) => {
  const set = ownedSet(req);
  db.prepare("DELETE FROM study_sets WHERE id = ?").run(set.id);
  res.json({ ok: true });
});

// ---------- Quiz ----------
app.post("/api/sets/:id/quiz", auth.requireAuth, aiLimiter, wrap(async (req, res) => {
  const set = ownedSet(req);
  const questions = await ai.generateQuiz(set.content);
  const id = randomUUID();
  db.prepare("INSERT INTO quizzes (id, set_id, questions_json, created_at) VALUES (?, ?, ?, ?)").run(id, set.id, JSON.stringify(questions), now());
  res.status(201).json({ quiz: { id, questions: questions.map(({ answerIndex, explanation, ...q }) => q) } });
}));

app.post("/api/quizzes/:quizId/attempts", auth.requireAuth, wrap(async (req, res) => {
  const quiz = db.prepare(
    "SELECT q.* FROM quizzes q JOIN study_sets s ON s.id = q.set_id WHERE q.id = ? AND s.user_id = ?",
  ).get(req.params.quizId, req.user.id);
  if (!quiz) throw Object.assign(new Error("Quiz not found."), { status: 404 });
  const questions = JSON.parse(quiz.questions_json);
  const answers = req.body?.answers;
  if (!Array.isArray(answers) || answers.length !== questions.length) throw badRequest("Please answer every question before submitting.");
  const results = questions.map((q, i) => ({
    correct: Number(answers[i]) === q.answerIndex,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    page: q.page,
  }));
  const score = results.filter((r) => r.correct).length;
  db.prepare(
    "INSERT INTO quiz_attempts (id, quiz_id, set_id, score, total, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), quiz.id, quiz.set_id, score, questions.length, JSON.stringify(answers), now());
  res.json({ score, total: questions.length, results });
}));

// ---------- Flashcards ----------
app.post("/api/sets/:id/flashcards", auth.requireAuth, aiLimiter, wrap(async (req, res) => {
  const set = ownedSet(req);
  const cards = await ai.generateFlashcards(set.content);
  db.prepare("DELETE FROM flashcards WHERE set_id = ?").run(set.id);
  const insert = db.prepare("INSERT INTO flashcards (id, set_id, front, back, page, status, position) VALUES (?, ?, ?, ?, ?, 'new', ?)");
  cards.forEach((c, i) => insert.run(randomUUID(), set.id, c.front, c.back, c.page, i));
  const flashcards = db.prepare("SELECT id, front, back, page, status FROM flashcards WHERE set_id = ? ORDER BY position").all(set.id);
  res.status(201).json({ flashcards });
}));

app.patch("/api/flashcards/:cardId", auth.requireAuth, (req, res) => {
  const status = req.body?.status;
  if (!["known", "review", "new"].includes(status)) throw badRequest("Invalid card status.");
  const card = db.prepare(
    "SELECT f.id FROM flashcards f JOIN study_sets s ON s.id = f.set_id WHERE f.id = ? AND s.user_id = ?",
  ).get(req.params.cardId, req.user.id);
  if (!card) {
    res.status(404).json({ error: "Card not found." });
    return;
  }
  db.prepare("UPDATE flashcards SET status = ? WHERE id = ?").run(status, card.id);
  res.json({ ok: true });
});

// ---------- Tutor chat ----------
app.post("/api/sets/:id/chat", auth.requireAuth, aiLimiter, wrap(async (req, res) => {
  const set = ownedSet(req);
  const question = String(req.body?.question || "").trim();
  if (!question) throw badRequest("Type a question about your notes.");
  if (question.length > 1000) throw badRequest("Please keep questions under 1,000 characters.");
  const history = db.prepare("SELECT role, content FROM chat_messages WHERE set_id = ? ORDER BY created_at").all(set.id);
  const result = await ai.answerFromNotes(set.content, question, history);
  const insert = db.prepare(
    "INSERT INTO chat_messages (id, set_id, role, content, citations_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const userMsg = { id: randomUUID(), role: "user", content: question, pages: [], created_at: now() };
  insert.run(userMsg.id, set.id, "user", question, null, userMsg.created_at);
  const botMsg = { id: randomUUID(), role: "assistant", content: result.answer, pages: result.pages, created_at: now() };
  insert.run(botMsg.id, set.id, "assistant", result.answer, JSON.stringify(result.pages), botMsg.created_at);
  res.json({ messages: [userMsg, botMsg] });
}));

// ---------- Production: serve built client ----------
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => err && next());
});

// ---------- Errors ----------
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "That PDF is larger than 15 MB." : error.message });
    return;
  }
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  if (error.type === "entity.parse.failed") {
    res.status(400).json({ error: "The request could not be read. Please try again." });
    return;
  }
  if (status >= 500 && status !== 503) console.error(error);
  const safe = error.status ? error.message : "Something went wrong. Please try again.";
  res.status(status).json({
    error: safe,
    code: ["AI_BUSY", "AI_CONFIG"].includes(error.code) ? error.code : undefined,
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`StudyForge API running on http://localhost:${port}`);
});
