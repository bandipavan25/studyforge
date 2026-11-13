export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  const busy = error.code === "AI_BUSY" || error.status === 503;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <span>{busy ? "Our AI is busy right now. Please try again in a minute." : error.message}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
          Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div role="status" className="flex items-center gap-3 text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}
