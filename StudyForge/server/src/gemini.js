import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || null;

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is missing. Add it to the .env file in the project folder.");
    error.status = 500;
    throw error;
  }
  return new GoogleGenAI({ apiKey });
}

function isBusy(error) {
  const text = `${error?.status || ""} ${error?.code || ""} ${error?.message || ""}`;
  return /503|429|UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED|try again|fetch failed|timeout|ECONNRESET|ETIMEDOUT/i.test(
    `${text} ${error?.cause?.code || ""} ${error?.cause?.message || ""}`,
  );
}

function isModelProblem(error) {
  const text = `${error?.status || ""} ${error?.message || ""}`;
  return /404|NOT_FOUND|no longer available|not found for API version|API key not valid|PERMISSION_DENIED|403|400/i.test(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(prompt, schema, temperature) {
  const ai = client();
  const delays = [1000, 2000, 4000];
  let lastError;
  const models = [MODEL, FALLBACK_MODEL].filter(Boolean);
  for (const model of models) {
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature, responseMimeType: "application/json", responseSchema: schema },
        });
        const raw = (response.text || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
        return JSON.parse(raw);
      } catch (error) {
        lastError = error;
        if (error instanceof SyntaxError) {
          const bad = new Error("The AI returned an unexpected answer. Please try again.");
          bad.status = 502;
          throw bad;
        }
        if (isModelProblem(error) && !isBusy(error)) {
          console.error("[gemini] configuration problem:", error.message);
          const config = new Error("The AI service is not set up correctly. Check GEMINI_API_KEY and GEMINI_MODEL in .env, then restart.");
          config.status = 502;
          config.code = "AI_CONFIG";
          throw config;
        }
        if (!isBusy(error)) {
          console.error("[gemini] unexpected error:", error.message);
          const unknown = new Error("The AI could not answer right now. Please try again.");
          unknown.status = 502;
          throw unknown;
        }
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
    }
  }
  const busy = new Error("Our AI is busy right now. Please try again in a minute.");
  busy.status = 503;
  busy.code = "AI_BUSY";
  busy.cause = lastError;
  throw busy;
}

const quizSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answerIndex: { type: "integer" },
          explanation: { type: "string" },
          page: { type: "string" },
        },
        required: ["question", "options", "answerIndex", "explanation", "page"],
      },
    },
  },
  required: ["questions"],
};

export async function generateQuiz(notes) {
  const data = await generate(
    `You are StudyForge, a study coach for college students.
Write exactly 10 multiple-choice questions that test understanding of the notes below.
Rules:
- Use ONLY information in the notes. Do not add outside facts.
- Each question has exactly 4 options and one correct answer (answerIndex 0-3).
- Mix difficulty: 4 recall, 4 understanding, 2 application.
- explanation: 1-2 plain sentences on why the answer is correct.
- page: the page number from the "--- Page N ---" markers, or "1" if unmarked.

NOTES:
${notes}`,
    quizSchema,
    0,
  );
  const questions = (data.questions || [])
    .filter((q) => Array.isArray(q.options) && q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex <= 3)
    .slice(0, 10);
  if (questions.length === 0) {
    const error = new Error("The AI could not build a quiz from these notes. Try notes with more content.");
    error.status = 422;
    throw error;
  }
  return questions;
}

const flashcardSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" }, page: { type: "string" } },
        required: ["front", "back", "page"],
      },
    },
  },
  required: ["cards"],
};

export async function generateFlashcards(notes) {
  const data = await generate(
    `You are StudyForge. Create 12-15 flashcards from the notes below.
Rules:
- Use ONLY the notes. Front: a key term or short question. Back: a clear answer in 1-2 sentences.
- page: the page number from the "--- Page N ---" markers, or "1" if unmarked.

NOTES:
${notes}`,
    flashcardSchema,
    0.2,
  );
  return (data.cards || []).filter((c) => c.front && c.back).slice(0, 15);
}

const chatSchema = {
  type: "object",
  properties: {
    covered: { type: "boolean" },
    answer: { type: "string" },
    pages: { type: "array", items: { type: "string" } },
  },
  required: ["covered", "answer", "pages"],
};

export const NOT_COVERED = "Your notes don't appear to cover this.";

export async function answerFromNotes(notes, question, history) {
  const prior = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n");
  const data = await generate(
    `You are StudyForge's tutor. Answer the student's question using ONLY the notes below.
Rules:
- If the notes do not contain the answer, set covered=false and answer exactly: ${NOT_COVERED}
- Otherwise covered=true; explain in 2-5 plain sentences, like a patient tutor.
- pages: the page numbers you used, from the "--- Page N ---" markers.

Earlier conversation:
${prior || "(none)"}

Student question: ${question}

NOTES:
${notes}`,
    chatSchema,
    0.1,
  );
  if (!data.covered) return { answer: NOT_COVERED, pages: [] };
  return { answer: data.answer || NOT_COVERED, pages: Array.isArray(data.pages) ? data.pages : [] };
}
