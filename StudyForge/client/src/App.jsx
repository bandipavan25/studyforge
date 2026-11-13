import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import Dashboard from "./components/Dashboard.jsx";
import StudySet from "./components/StudySet.jsx";
import { Spinner } from "./components/Notice.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [openSet, setOpenSet] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    setOpenSet(null);
  }

  if (checking) return <div className="grid min-h-screen place-items-center"><Spinner label="Loading StudyForge…" /></div>;
  if (!user) return <AuthScreen onSignedIn={setUser} />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => setOpenSet(null)} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 font-bold text-white">S</span>
            <span className="text-lg font-bold">StudyForge</span>
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user.email}</span>
            <button onClick={signOut} className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium hover:bg-slate-200">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {openSet ? <StudySet id={openSet} onBack={() => setOpenSet(null)} /> : <Dashboard user={user} onOpen={setOpenSet} />}
      </main>
      <footer className="pb-6 text-center text-xs text-slate-500">
        StudyForge uses AI to help you study. Always check important facts against your course materials.
      </footer>
    </div>
  );
}
