import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice, Spinner } from "./Notice.jsx";

function UploadForm({ onCreated }) {
  const [mode, setMode] = useState("pdf");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function pickFile(f) {
    setError(null);
    if (!f) return setFile(null);
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      return setError({ message: "Please choose a PDF file (.pdf)." });
    }
    if (f.size > 15 * 1024 * 1024) {
      setFile(null);
      return setError({ message: "That PDF is larger than 15 MB." });
    }
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (title.trim().length < 2) return setError({ message: "Please give your study set a title." });
    if (mode === "pdf" && !file) return setError({ message: "Please choose a PDF to upload." });
    if (mode === "text" && text.trim().length < 100) return setError({ message: "Please paste at least 100 characters of notes." });
    const form = new FormData();
    form.append("title", title.trim());
    if (mode === "pdf") form.append("file", file);
    else form.append("text", text);
    setBusy(true);
    setError(null);
    try {
      const data = await api("/sets", { method: "POST", form });
      setTitle(""); setFile(null); setText("");
      onCreated(data.set.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const tab = (value, label) => (
    <button type="button" onClick={() => { setMode(value); setError(null); }} aria-pressed={mode === value}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === value ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" noValidate>
      <h2 className="text-lg font-semibold">New study set</h2>
      <p className="text-sm text-slate-500">Upload lecture notes or paste text. StudyForge only uses what you provide.</p>
      <label className="mt-4 block text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g., BIO 101 – Cell Respiration"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      <div className="mt-4 flex gap-2">{tab("pdf", "Upload PDF")}{tab("text", "Paste text")}</div>
      {mode === "pdf" ? (
        <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-teal-500">
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
          <span className="font-medium text-teal-700">{file ? file.name : "Choose a PDF"}</span>
          <span className="block text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(0)} KB · ready` : "PDF only, up to 15 MB"}</span>
        </label>
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste your notes here…"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5" aria-label="Notes text" />
      )}
      <div className="mt-4 space-y-3">
        <ErrorNotice error={error} />
        {busy ? <Spinner label="Reading your notes…" /> : (
          <button className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Create study set</button>
        )}
      </div>
    </form>
  );
}

function ScoreBars({ attempts }) {
  if (!attempts.length) return <p className="text-sm text-slate-500">Take a quiz to see your progress here.</p>;
  const recent = attempts.slice(-12);
  return (
    <div className="flex h-28 items-end gap-2" aria-label="Recent quiz scores">
      {recent.map((a, i) => {
        const pct = Math.round((100 * a.score) / a.total);
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-slate-600">{pct}%</span>
            <div className="flex h-20 w-full items-end">
              <div className={`w-full rounded-t ${pct >= 80 ? "bg-teal-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ height: `${Math.max(pct, 4)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard({ user, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      setData(await api("/sets"));
    } catch (err) {
      setError(err);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-6">
        <UploadForm onCreated={onOpen} />
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold">Your progress</h2>
          <p className="mb-4 text-sm text-slate-500">Your most recent quiz scores across all study sets.</p>
          {data ? <ScoreBars attempts={data.attempts} /> : null}
        </section>
      </div>
      <section>
        <h2 className="text-lg font-semibold">Hi {user.name.split(" ")[0]}, your study sets</h2>
        <div className="mt-3 space-y-3">
          <ErrorNotice error={error} onRetry={load} />
          {!data && !error && <Spinner label="Loading your study sets…" />}
          {data && data.sets.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-600">
              <p className="text-lg font-medium">No study sets yet</p>
              <p className="text-sm">Upload your first notes to generate quizzes, flashcards, and a tutor.</p>
            </div>
          )}
          {data?.sets.map((s) => (
            <button key={s.id} onClick={() => onOpen(s.id)}
              className="block w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-teal-500">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-slate-500">{s.source_name} · {s.page_count} page{s.page_count === 1 ? "" : "s"}</p>
                </div>
                {s.best_score != null && (
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">Best {s.best_score}%</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {s.attempt_count} quiz attempt{s.attempt_count === 1 ? "" : "s"} · {s.flashcard_count} flashcards
                {s.last_score != null ? ` · last score ${s.last_score}%` : ""}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
