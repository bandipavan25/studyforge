# StudyForge

Turn your own lecture notes into active practice: AI-generated quizzes, flashcards, and a tutor that answers only from your material, with page citations.

## Features
- **Secure accounts** – email/password sign-up with scrypt-hashed passwords and session tokens; each student sees only their own data.
- **Upload notes** – PDF (up to 15 MB) or pasted text, stored in a local SQLite database.
- **AI quizzes** – 10 multiple-choice questions with explanations and page references; scores are saved.
- **AI flashcards** – "Know it / Review again" study mode with progress tracking.
- **Cited tutor chat** – answers only from your notes; if they don't cover a question it says *"Your notes don't appear to cover this."*
- **Progress dashboard** – recent quiz scores and best score per study set.
- **Reliability** – Gemini retries with backoff plus a fallback model, friendly "AI is busy" messages with Retry, and an error boundary so the app never shows a blank screen.

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS (`/client`) |
| Backend | Node.js + Express (`/server`) |
| Database | SQLite via Node's built-in `node:sqlite` (no native install) |
| AI | Google Gemini API (model set by `GEMINI_MODEL` in `.env`, default `gemini-3.8-flash`), called only from the server |

## Requirements
- Node.js **22.13 or newer** (Node 24 recommended)
- A Google Gemini API key from https://aistudio.google.com

## Setup
```bash
npm run install:all
```
Copy `.env.example` to `.env` in the project folder and add your key:
```
GEMINI_API_KEY=your-key-here
```
`.env` is listed in `.gitignore`. Never commit it.

## Run locally
```bash
npm run dev
```
- App: http://localhost:5173
- API: http://localhost:3001 (health check: `/api/health`)

## Project structure
```
StudyForge/
├── client/                 React frontend
│   └── src/
│       ├── api.js          fetch wrapper with friendly errors
│       ├── App.jsx         sign-in, header, page routing
│       └── components/     AuthScreen, Dashboard, StudySet, QuizTab,
│                           FlashcardsTab, ChatTab, ErrorBoundary, Notice
├── server/                 Express API
│   ├── data/               SQLite database file (created automatically)
│   └── src/
│       ├── index.js        routes, validation, error handling
│       ├── db.js           tables: users, sessions, study_sets, quizzes,
│       │                   quiz_attempts, flashcards, chat_messages
│       ├── auth.js         password hashing, sessions, requireAuth
│       ├── gemini.js       quiz, flashcard, and tutor prompts with retries
│       └── extractPdf.js   PDF text extraction with page markers
├── .env.example
└── package.json            install:all, dev, build, start
```

## Responsible AI
- Answers are grounded only in the student's uploaded notes, with page citations.
- The tutor refuses to guess when the notes don't cover a question.
- Quizzes use temperature 0 for consistent results.
- The footer reminds students to check important facts against course materials.

## Security measures
- Parameterized SQL queries everywhere (no string-built SQL).
- Passwords hashed with scrypt + per-user salt; constant-time comparison.
- Session tokens expire after 7 days; every data route checks ownership.
- Rate limiting on sign-in/sign-up (10/min) and AI routes (20/min).
- Security headers: Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy.
- CORS limited to the local app origin; Express fingerprint header removed.
- Gemini key stays on the server in `.env` (git-ignored); errors never expose stack traces or raw API responses.
