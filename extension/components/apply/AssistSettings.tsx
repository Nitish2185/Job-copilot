import type { Settings } from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { OPTIONAL_SITES, type OptionalSiteId } from "@/lib/apply/optionalSites";
import { sendMessage } from "@/lib/messaging/client";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

type Assist = Settings["assist"];
type BadgeSite = keyof Assist["badges"];

const BADGE_SITES: [BadgeSite, string][] = [
  ["naukri", "Naukri"],
  ["indeed", "Indeed"],
  ["linkedin", "LinkedIn"],
];

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </label>
    </div>
  );
}

/** A LinkedIn or Workday row: explanation first, then the browser's permission prompt. */
function OptionalSite({
  id,
  enabled,
  onChange,
}: {
  id: OptionalSiteId;
  enabled: boolean;
  onChange: (sites: { id: OptionalSiteId; enabled: boolean }[]) => void;
}) {
  const site = OPTIONAL_SITES[id];
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState<string>();

  const enable = () => {
    setError(undefined);
    // The permission prompt must open straight from the click.
    void browser.permissions
      .request({ origins: site.origins })
      .then(async (granted) => {
        if (!granted) {
          setError(`${site.name} was not enabled: the permission was declined.`);
          return;
        }
        setExplaining(false);
        onChange((await sendMessage("assist/syncSites", {})).sites);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : `Could not enable ${site.name}.`);
      });
  };

  return (
    <div className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{site.name}</span>{" "}
          <span className="text-stone-500">{enabled ? "· On" : "· Off"}</span>
        </p>
        {enabled ? (
          <Button
            onClick={() => {
              void sendMessage("assist/disableSite", { site: id }).then((r) => {
                onChange(r.sites);
              });
            }}
          >
            Turn off {site.name}
          </Button>
        ) : (
          !explaining && (
            <Button
              onClick={() => {
                setExplaining(true);
              }}
            >
              Turn on {site.name}
            </Button>
          )
        )}
      </div>
      {explaining && !enabled && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-stone-600 dark:text-stone-400">{site.explanation}</p>
          <p className="text-xs text-stone-500">
            Your browser will ask to let Job Copilot read and change {site.name} pages. Nothing is
            ever submitted for you there.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={enable}>
              Allow {site.name}
            </Button>
            <Button
              onClick={() => {
                setExplaining(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      )}
    </div>
  );
}

/** Assist sites (spec 16.6, 17): each-step autofill, badges per site, LinkedIn and Workday. */
export function AssistSettings() {
  const [assist, setAssist] = useState<Assist>();
  const [sites, setSites] = useState<{ id: OptionalSiteId; enabled: boolean }[]>([]);

  useEffect(() => {
    void loadSettings().then((s) => {
      setAssist(s.assist);
    });
    void sendMessage("assist/syncSites", {})
      .then((r) => {
        setSites(r.sites);
      })
      .catch(() => undefined);
  }, []);

  if (!assist) return null;

  const save = (next: Assist) => {
    setAssist(next);
    void updateSettings({ assist: next });
  };
  const linkedinOn = sites.some((s) => s.id === "linkedin" && s.enabled);

  return (
    <div className="space-y-3">
      <Toggle
        id="assist-each-step"
        label="Autofill each new step automatically"
        hint="After you press Autofill once on a form, later steps are filled as they appear, only in the tab you are looking at. Job Copilot never clicks Next or Submit."
        checked={assist.autofillEachStep}
        onChange={(checked) => {
          save({ ...assist, autofillEachStep: checked });
        }}
      />
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Match badges on search results</legend>
        {BADGE_SITES.map(([site, name]) => (
          <Toggle
            key={site}
            id={`assist-badges-${site}`}
            label={name}
            {...(site === "linkedin" &&
              !linkedinOn && { hint: "Turn on LinkedIn below for badges there." })}
            checked={assist.badges[site]}
            onChange={(checked) => {
              save({ ...assist, badges: { ...assist.badges, [site]: checked } });
            }}
          />
        ))}
      </fieldset>
      <div className="space-y-2">
        <p className="text-sm font-medium">More sites (off by default)</p>
        {(Object.keys(OPTIONAL_SITES) as OptionalSiteId[]).map((id) => (
          <OptionalSite
            key={id}
            id={id}
            enabled={sites.some((s) => s.id === id && s.enabled)}
            onChange={setSites}
          />
        ))}
      </div>
    </div>
  );
}
