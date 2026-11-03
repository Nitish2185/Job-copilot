import { useLiveQuery } from "dexie-react-hooks";
import {
  Briefcase,
  Building2,
  ChartColumn,
  ClipboardCheck,
  FileText,
  Hand,
  MessageSquareText,
  Settings,
  SquareKanban,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { BrandMark } from "@/components/ui/BrandMark";
import { getDb } from "@/lib/db/db";
import { RouteTip } from "./RouteTip";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Which waiting count to show next to the item. */
  count?: "review" | "needsYou";
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Find and apply",
    items: [
      { to: "/matches", label: "Jobs", icon: Briefcase },
      { to: "/review", label: "Review", icon: ClipboardCheck, count: "review" },
      { to: "/needs-you", label: "Needs you", icon: Hand, count: "needsYou" },
    ],
  },
  {
    label: "Track",
    items: [
      { to: "/tracker", label: "Tracker", icon: SquareKanban },
      { to: "/analytics", label: "Analytics", icon: ChartColumn },
    ],
  },
  {
    label: "You",
    items: [
      { to: "/profile", label: "Profile", icon: UserRound },
      { to: "/answers", label: "Answers", icon: MessageSquareText },
      { to: "/resumes", label: "Resumes", icon: FileText },
      { to: "/companies", label: "Companies", icon: Building2 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Applications waiting for approval (Review) and stopped ones (Needs you). */
function useWaiting() {
  return useLiveQuery(async () => {
    const waiting = await getDb().applications.where("status").equals("needs_you").toArray();
    const review = waiting.filter((a) => a.needsYouReason === "approval_required").length;
    return { review, needsYou: waiting.length - review };
  }, []);
}

export function Layout() {
  const waiting = useWaiting();
  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <a
        href="#main"
        onClick={(e) => {
          // Hash links are routes here: move focus without navigating.
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-medium text-stone-900 shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <nav
        aria-label="Main"
        className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-stone-200 bg-white px-3 py-5 dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="px-3">
          <BrandMark />
        </div>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs font-medium text-stone-500">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const count = item.count ? (waiting?.[item.count] ?? 0) : 0;
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                          isActive
                            ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                            : "text-stone-700 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        }`
                      }
                    >
                      <Icon className="size-4.5 shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                          {count}
                          <span className="sr-only"> waiting</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <RouteTip />
        <Outlet />
      </main>
    </div>
  );
}
