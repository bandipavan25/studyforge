import { useState } from "react";
import { api } from "../api.js";
import { ErrorNotice, Spinner } from "./Notice.jsx";

export default function FlashcardsTab({ setId, cards, onCards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await api(`/sets/${setId}/flashcards`, { method: "POST" });
      onCards(data.flashcards);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(Object.assign(err, { retry: generate }));
    } finally {
      setBusy(false);
    }
  }

  async function mark(status) {
    const card = cards[index];
    onCards(cards.map((c) => (c.id === card.id ? { ...c, status } : c)));
    setFlipped(false);
    setIndex((index + 1) % cards.length);
    try {
      await api(`/flashcards/${card.id}`, { method: "PATCH", body: { status } });
    } catch (err) {
      setError(err);
    }
  }

  if (!cards.length) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-slate-600">Create flashcards for key terms and ideas in your notes.</p>
        <ErrorNotice error={error} onRetry={error?.retry} />
        {busy ? <div className="flex justify-center"><Spinner label="Making flashcards…" /></div> : (
          <button onClick={generate} className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Generate flashcards</button>
        )}
      </div>
    );
  }

  const card = cards[index];
  const known = cards.filter((c) => c.status === "known").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>Card {index + 1} of {cards.length}</span>
        <span>{known} known · {cards.filter((c) => c.status === "review").length} to review</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-teal-500" style={{ width: `${(100 * known) / cards.length}%` }} /></div>
      <button onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show front of card" : "Show answer"}
        className={`grid min-h-52 w-full place-items-center rounded-2xl p-8 text-center shadow-sm ring-1 ${flipped ? "bg-teal-50 ring-teal-300" : "bg-white ring-slate-200"}`}>
        <span>
          <span className="block text-xs uppercase tracking-wide text-slate-500">{flipped ? "Answer" : "Term or question"}</span>
          <span className="mt-2 block text-xl font-medium">{flipped ? card.back : card.front}</span>
          {flipped && <span className="mt-3 block text-xs text-slate-500">From page {card.page}</span>}
          {!flipped && <span className="mt-3 block text-xs text-slate-400">Click or press Enter to flip</span>}
        </span>
      </button>
      <ErrorNotice error={error} onRetry={error?.retry} />
      <div className="flex flex-wrap gap-3">
        <button onClick={() => mark("review")} className="flex-1 rounded-lg bg-amber-100 px-4 py-2.5 font-medium text-amber-900 hover:bg-amber-200">Review again</button>
        <button onClick={() => mark("known")} className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700">Know it</button>
      </div>
      <button onClick={generate} disabled={busy} className="text-sm font-medium text-teal-700 hover:underline disabled:opacity-60">
        {busy ? "Regenerating…" : "Regenerate flashcards"}
      </button>
    </div>
  );
}
