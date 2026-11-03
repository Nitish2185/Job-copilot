import { REPO_URL, PAGES_BASE_URL } from "@job-copilot/shared/config";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

/** Privacy: contact details removed before anything goes to the AI (on by default). */
export function PrivacySettings() {
  const [redact, setRedact] = useState<boolean>();
  useEffect(() => {
    void loadSettings().then((s) => {
      setRedact(s.privacy.redactContactInfo);
    });
  }, []);
  if (redact === undefined) return null;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={redact}
        onChange={(e) => {
          setRedact(e.target.checked);
          void updateSettings({ privacy: { redactContactInfo: e.target.checked } });
        }}
      />
      <span>
        Remove my name, email, phone number and links before sending anything to the AI
        <span className="block text-xs text-slate-500">
          Recommended. Resumes and cover letters are still made with your details, on this device.
        </span>
      </span>
    </label>
  );
}

const COMMAND_TEXT: Record<string, string> = {
  autofill: "Fill the application form on this page",
  "toggle-side-panel": "Open the side panel",
};

/** Keyboard shortcuts and where to change them. */
export function ShortcutSettings() {
  const [commands, setCommands] = useState<{ name: string; shortcut: string }[]>([]);
  useEffect(() => {
    void browser.commands
      .getAll()
      .then((list) => {
        setCommands(
          list
            .filter((c) => c.name && c.name in COMMAND_TEXT)
            .map((c) => ({ name: c.name ?? "", shortcut: c.shortcut ?? "" })),
        );
      })
      .catch(() => undefined);
  }, []);
  const change = () => {
    const api = browser.commands as unknown as { openShortcutSettings?: () => Promise<void> };
    if (api.openShortcutSettings) void api.openShortcutSettings();
    else void browser.tabs.create({ url: "chrome://extensions/shortcuts" });
  };
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {commands.map((c) => (
          <div key={c.name} className="contents">
            <dt>
              <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs dark:border-slate-700">
                {c.shortcut || "Not set"}
              </kbd>
            </dt>
            <dd>{COMMAND_TEXT[c.name]}</dd>
          </div>
        ))}
      </dl>
      <Button onClick={change}>Change shortcuts</Button>
    </div>
  );
}

const LIBRARIES =
  "React, WXT, Dexie, Tailwind CSS, Radix UI, Lucide, Recharts, dnd-kit, Zod, PDF.js, Mammoth, DOMPurify, React-PDF, TanStack Virtual and the OpenAI client library";

/** Version, links and licenses. */
export function AboutSettings() {
  const version = browser.runtime.getManifest().version;
  const link = "text-blue-700 underline dark:text-blue-400";
  return (
    <div className="space-y-2 text-sm">
      <p>Job Copilot {version}. Free and open source under the MIT License.</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li>
          <a className={link} href={PAGES_BASE_URL} target="_blank" rel="noreferrer">
            Website
          </a>
        </li>
        <li>
          <a className={link} href={REPO_URL} target="_blank" rel="noreferrer">
            Source code
          </a>
        </li>
        <li>
          <a className={link} href={`${PAGES_BASE_URL}#/privacy`} target="_blank" rel="noreferrer">
            Privacy policy
          </a>
        </li>
        <li>
          <a className={link} href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            Report a problem
          </a>
        </li>
        <li>
          <a
            className={link}
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
          >
            License
          </a>
        </li>
      </ul>
      <p className="text-xs text-slate-500">
        Built with {LIBRARIES} (each under its own open-source license, listed in the source code).
        Resume PDFs use the Lato font under the SIL Open Font License (
        <a
          className={link}
          href={browser.runtime.getURL("/fonts/OFL.txt")}
          target="_blank"
          rel="noreferrer"
        >
          OFL.txt
        </a>
        ).
      </p>
    </div>
  );
}
