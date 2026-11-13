import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice, Spinner } from "./Notice.jsx";
import QuizTab from "./QuizTab.jsx";
import FlashcardsTab from "./FlashcardsTab.jsx";
import ChatTab from "./ChatTab.jsx";

const TABS = [["quiz", "Quiz"], ["cards", "Flashcards"], ["chat", "Tutor chat"]];

export default function StudySet({ id, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("quiz");

  async function load() {
    setError(null);
    try {
      setData(await api(`/sets/${id}`));
    } catch (err) {
      setError(err);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function remove() {
    if (!window.confirm("Delete this study set and all its quizzes, flashcards, and chat?")) return;
    try {
      await api(`/sets/${id}`, { method: "DELETE" });
      onBack();
    } catch (err) {
      setError(err);
    }
  }

  if (error && !data) return <div className="space-y-4"><BackButton onBack={onBack} /><ErrorNotice error={error} onRetry={load} /></div>;
  if (!data) return <Spinner label="Opening study set…" />;

  const best = data.attempts.length ? Math.max(...data.attempts.map((a) => Math.round((100 * a.score) / a.total))) : null;
  return (
    <div className="space-y-5">
      <BackButton onBack={onBack} />
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="text-2xl font-bold">{data.set.title}</h2>
          <p className="text-sm text-slate-500">{data.set.source_name} · {data.set.page_count} page{data.set.page_count === 1 ? "" : "s"}
            {best != null && ` · best quiz score ${best}%`}</p>
        </div>
        <button onClick={remove} className="rounded-lg px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">Delete set</button>
      </header>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div role="tablist" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {TABS.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
              className={`rounded-lg px-4 py-2 font-medium ${tab === value ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === "quiz" && (
          <QuizTab setId={id} quiz={data.quiz} onQuiz={(quiz) => setData({ ...data, quiz })}
            onAttempt={(r) => setData((d) => ({ ...d, attempts: [...d.attempts, { score: r.score, total: r.total }] }))} />
        )}
        {tab === "cards" && <FlashcardsTab setId={id} cards={data.flashcards} onCards={(flashcards) => setData((d) => ({ ...d, flashcards }))} />}
        {tab === "chat" && <ChatTab setId={id} messages={data.messages} onMessages={(messages) => setData((d) => ({ ...d, messages }))} />}
      </div>
    </div>
  );
}

function BackButton({ onBack }) {
  return <button onClick={onBack} className="text-sm font-medium text-teal-700 hover:underline">← All study sets</button>;
}
