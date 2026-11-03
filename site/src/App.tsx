import { APP_NAME, REPO_URL } from "@job-copilot/shared/config";
import { useEffect, useState, type ReactNode } from "react";
import { FeedStatus } from "./FeedStatus";
import { FaqPage, GeminiKeyPage, HomePage, InstallPage, PrivacyPage } from "./pages";

const ROUTES: { path: string; label: string; page: () => ReactNode }[] = [
  { path: "", label: "Home", page: HomePage },
  { path: "install", label: "Install", page: InstallPage },
  { path: "gemini-key", label: "Free Gemini key", page: GeminiKeyPage },
  { path: "faq", label: "FAQ", page: FaqPage },
  { path: "privacy", label: "Privacy", page: PrivacyPage },
  { path: "feed", label: "Feed status", page: FeedStatus },
];

function currentPath(): string {
  return location.hash.replace(/^#\/?/, "");
}

function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  return path;
}

export function App() {
  const path = useRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  const Page = route?.page ?? HomePage;
  useEffect(() => {
    document.title = route?.path ? `${route.label} - ${APP_NAME}` : APP_NAME;
  }, [route]);

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#/"
        onClick={(e) => {
          // Hash links are routes here, so move focus without navigating.
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a href="#/" className="text-lg font-semibold tracking-tight">
            {APP_NAME}
          </a>
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {ROUTES.slice(1).map((r) => (
                <li key={r.path}>
                  <a
                    href={`#/${r.path}`}
                    aria-current={r.path === route?.path ? "page" : undefined}
                    className="text-slate-600 hover:text-slate-900 aria-[current=page]:font-semibold aria-[current=page]:text-slate-900 dark:text-slate-400 dark:hover:text-white dark:aria-[current=page]:text-white"
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Page />
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:px-6">
          <span>{APP_NAME} is free and open source (MIT).</span>
          <a className="underline" href={REPO_URL}>
            Source code on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
