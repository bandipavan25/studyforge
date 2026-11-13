import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./Notice.jsx";

const SUGGESTIONS = ["Summarize the main ideas", "Explain the hardest concept simply", "What should I memorize for the exam?"];

export default function ChatTab({ setId, messages, onMessages }) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  async function ask(text) {
    const q = (text ?? question).trim();
    if (!q) return setError({ message: "Type a question about your notes." });
    if (q.length > 1000) return setError({ message: "Please keep questions under 1,000 characters." });
    setBusy(true);
    setError(null);
    try {
      const data = await api(`/sets/${setId}/chat`, { method: "POST", body: { question: q } });
      if (!Array.isArray(data.messages)) throw new Error("Unexpected response from the server.");
      onMessages([...messages, ...data.messages]);
      setQuestion("");
    } catch (err) {
      setError(Object.assign(err, { retry: () => ask(q) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">Ask anything about these notes. Answers come only from your material, with page numbers.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-teal-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {m.content}
              {m.role === "assistant" && m.pages?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.pages.map((p) => (
                    <span key={p} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Page {p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-500">Tutor is reading your notes…</p>}
        <div ref={endRef} />
      </div>
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200">{s}</button>
          ))}
        </div>
      )}
      <ErrorNotice error={error} onRetry={error?.retry} />
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} disabled={busy}
          placeholder="Ask about your notes…" aria-label="Your question"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5" />
        <button disabled={busy} className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60">Ask</button>
      </form>
    </div>
  );
}
