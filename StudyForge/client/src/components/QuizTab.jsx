import { useState } from "react";
import { api } from "../api.js";
import { ErrorNotice, Spinner } from "./Notice.jsx";

export default function QuizTab({ setId, quiz, onQuiz, onAttempt }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  async function generate() {
    setBusy("Writing 10 questions from your notes…");
    setError(null);
    try {
      const data = await api(`/sets/${setId}/quiz`, { method: "POST" });
      setAnswers({});
      setResult(null);
      onQuiz(data.quiz);
    } catch (err) {
      setError(Object.assign(err, { retry: generate }));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (Object.keys(answers).length !== quiz.questions.length) {
      return setError({ message: "Please answer every question before submitting." });
    }
    setBusy("Checking your answers…");
    setError(null);
    try {
      const ordered = quiz.questions.map((_, i) => answers[i]);
      const data = await api(`/quizzes/${quiz.id}/attempts`, { method: "POST", body: { answers: ordered } });
      setResult(data);
      onAttempt(data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  if (!quiz) {
    return (
      <div className="space-y-4 text-center py-8">
        <p className="text-slate-600">Generate a 10-question quiz based only on your notes.</p>
        <ErrorNotice error={error} onRetry={error?.retry} />
        {busy ? <div className="flex justify-center"><Spinner label={busy} /></div> : (
          <button onClick={generate} className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Generate quiz</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {result && (
        <div className="rounded-xl bg-teal-50 p-4 text-teal-900" role="status">
          <p className="text-lg font-semibold">You scored {result.score} / {result.total} ({Math.round((100 * result.score) / result.total)}%)</p>
          <p className="text-sm">Review the explanations below, then try a new quiz.</p>
        </div>
      )}
      <ol className="space-y-4">
        {quiz.questions.map((q, i) => {
          const r = result?.results[i];
          return (
            <li key={i} className="rounded-xl border border-slate-200 p-4">
              <fieldset>
                <legend className="font-medium">{i + 1}. {q.question}</legend>
                <div className="mt-3 grid gap-2">
                  {q.options.map((opt, j) => {
                    const chosen = answers[i] === j;
                    let style = chosen ? "border-teal-600 bg-teal-50" : "border-slate-200 hover:bg-slate-50";
                    if (r) style = j === r.answerIndex ? "border-teal-600 bg-teal-50" : chosen ? "border-rose-400 bg-rose-50" : "border-slate-200 opacity-70";
                    return (
                      <label key={j} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${style}`}>
                        <input type="radio" name={`q${i}`} checked={chosen} disabled={!!result}
                          onChange={() => setAnswers({ ...answers, [i]: j })} className="mt-1 accent-teal-600" />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {r && (
                <p className={`mt-3 text-sm ${r.correct ? "text-teal-800" : "text-rose-800"}`}>
                  <strong>{r.correct ? "Correct." : "Not quite."}</strong> {r.explanation} <span className="text-slate-500">(page {r.page})</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <ErrorNotice error={error} onRetry={error?.retry} />
      {busy ? <Spinner label={busy} /> : (
        <div className="flex flex-wrap gap-3">
          {!result && <button onClick={submit} className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Submit answers</button>}
          <button onClick={generate} className="rounded-lg bg-slate-100 px-5 py-2.5 font-medium hover:bg-slate-200">New quiz</button>
        </div>
      )}
    </div>
  );
}
