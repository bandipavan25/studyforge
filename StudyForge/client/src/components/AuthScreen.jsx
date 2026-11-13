import { useState } from "react";
import { api, setToken } from "../api.js";
import { ErrorNotice } from "./Notice.jsx";

export default function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  function validate() {
    if (signup && form.name.trim().length < 2) return "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError({ message: problem });
    setBusy(true);
    setError(null);
    try {
      const data = await api(signup ? "/auth/signup" : "/auth/login", { method: "POST", body: form });
      setToken(data.token);
      onSignedIn(data.user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-teal-600";
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-teal-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-600 text-xl font-bold text-white">S</div>
          <div>
            <h1 className="text-2xl font-bold">StudyForge</h1>
            <p className="text-sm text-slate-500">Turn your notes into active practice</p>
          </div>
        </div>
        <h2 className="mt-8 text-lg font-semibold">{signup ? "Create your account" : "Welcome back"}</h2>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {signup && (
            <label className="block text-sm font-medium">
              Name
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input type="password" className={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={signup ? "new-password" : "current-password"} />
            {signup && <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>}
          </label>
          <ErrorNotice error={error} />
          <button disabled={busy} className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          {signup ? "Already have an account?" : "New to StudyForge?"}{" "}
          <button className="font-semibold text-teal-700 hover:underline" onClick={() => { setMode(signup ? "login" : "signup"); setError(null); }}>
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </main>
  );
}
