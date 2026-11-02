import { Link } from "react-router";

/** Placeholder until the onboarding wizard lands (Phase 4). */
export function OnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">
        Your data stays on this device. Jobs from the shared feed are downloading in the background.
        Profile setup comes next.
      </p>
      <Link
        to="/matches"
        className="mt-6 inline-block font-medium text-blue-700 underline dark:text-blue-400"
      >
        See jobs
      </Link>
    </div>
  );
}
