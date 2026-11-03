import { APP_NAME } from "@job-copilot/shared/config";
import { NavLink, Outlet } from "react-router";
import { RouteTip } from "./RouteTip";

const NAV = [
  { to: "/matches", label: "Jobs" },
  { to: "/review", label: "Review" },
  { to: "/needs-you", label: "Needs you" },
  { to: "/tracker", label: "Tracker" },
  { to: "/analytics", label: "Analytics" },
  { to: "/profile", label: "Profile" },
  { to: "/answers", label: "Answers" },
  { to: "/resumes", label: "Resumes" },
  { to: "/companies", label: "Companies" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <nav
        aria-label="Main"
        className="w-52 shrink-0 border-r border-slate-200 p-4 dark:border-slate-800"
      >
        <p className="mb-6 text-lg font-semibold">{APP_NAME}</p>
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm ${
                    isActive
                      ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1">
        <RouteTip />
        <Outlet />
      </main>
    </div>
  );
}
