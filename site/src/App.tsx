import { APP_NAME, REPO_URL } from "@job-copilot/shared/config";
import { FeedStatus } from "./FeedStatus";

export function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          A free, open-source, privacy-first job-hunting assistant for software developers. The
          browser extension is still being built; this page will grow with it.
        </p>
        <p className="mt-6">
          <a className="font-medium text-blue-700 underline dark:text-blue-400" href={REPO_URL}>
            Source code on GitHub
          </a>
        </p>
        <FeedStatus />
      </div>
    </main>
  );
}
