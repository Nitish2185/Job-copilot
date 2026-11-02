import { APP_NAME } from "@job-copilot/shared/config";

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          Your dashboard will appear here. Setup is in progress.
        </p>
      </div>
    </main>
  );
}
