import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("StudyForge crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md rounded-2xl bg-white p-8 shadow text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-slate-600">StudyForge hit an unexpected problem. Your saved work is safe.</p>
          <button
            className="mt-6 rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700"
            onClick={() => window.location.reload()}
          >
            Reload StudyForge
          </button>
        </div>
      </div>
    );
  }
}
