import type { Settings } from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import { loadSecrets, loadSettings, updateSecrets, updateSettings } from "@/lib/settings/settings";
import { ADZUNA_ORIGIN, JSEARCH_ORIGIN } from "@/lib/sources/listings";

type Sources = Settings["sources"];
type Note = { ok: boolean; text: string } | undefined;

function Status({ note }: { note: Note }) {
  if (!note) return null;
  return note.ok ? (
    <p role="status" className="text-sm text-green-700 dark:text-green-400">
      {note.text}
    </p>
  ) : (
    <ErrorMessage>{note.text}</ErrorMessage>
  );
}

/**
 * Adzuna and JSearch with the user's own keys (spec 13.3): off by default; turning
 * one on asks the browser for access to that API only.
 */
export function ListingSources() {
  const [sources, setSources] = useState<Sources>();
  const [adzunaId, setAdzunaId] = useState("");
  const [adzunaKey, setAdzunaKey] = useState("");
  const [jsearchKey, setJsearchKey] = useState("");
  const [note, setNote] = useState<Note>();

  useEffect(() => {
    void Promise.all([loadSettings(), loadSecrets()]).then(([s, secrets]) => {
      setSources(s.sources);
      setAdzunaId(secrets.adzuna?.appId ?? "");
      setAdzunaKey(secrets.adzuna?.appKey ?? "");
      setJsearchKey(secrets.jsearchKey ?? "");
    });
  }, []);
  if (!sources) return null;

  const turnOn = (which: "adzuna" | "jsearch") => {
    setNote(undefined);
    const ready = which === "adzuna" ? adzunaId.trim() && adzunaKey.trim() : jsearchKey.trim();
    if (!ready) {
      setNote({ ok: false, text: "Add the key first." });
      return;
    }
    // The permission prompt must open straight from the click.
    void browser.permissions
      .request({ origins: [which === "adzuna" ? ADZUNA_ORIGIN : JSEARCH_ORIGIN] })
      .then(async (granted) => {
        if (!granted) {
          setNote({ ok: false, text: "Not turned on: the permission was declined." });
          return;
        }
        await updateSecrets(
          which === "adzuna"
            ? { adzuna: { appId: adzunaId.trim(), appKey: adzunaKey.trim() } }
            : { jsearchKey: jsearchKey.trim() },
        );
        const saved = await updateSettings({ sources: { [which]: { enabled: true } } });
        setSources(saved.sources);
        setNote({ ok: true, text: "Turned on. New jobs arrive with the next sync." });
      });
  };
  const turnOff = async (which: "adzuna" | "jsearch") => {
    await browser.permissions
      .remove({ origins: [which === "adzuna" ? ADZUNA_ORIGIN : JSEARCH_ORIGIN] })
      .catch(() => false);
    const saved = await updateSettings({ sources: { [which]: { enabled: false } } });
    setSources(saved.sources);
  };
  const saveLimits = async (patch: Partial<Pick<Sources, "adzuna" | "jsearch">>) => {
    try {
      setSources((await updateSettings({ sources: patch })).sources);
    } catch {
      setNote({ ok: false, text: "The daily limit must be a whole number of 0 or more." });
    }
  };
  const searchNow = async () => {
    setNote(undefined);
    const r = await sendMessage("listings/sync", {});
    setNote(
      r.errors.length && r.added === 0
        ? { ok: false, text: r.errors[0] ?? "The search failed." }
        : { ok: true, text: `${String(r.added)} new jobs from ${String(r.calls)} searches.` },
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Optional job search APIs with your own free keys. Job Copilot searches your desired roles
        a few times a day, within the daily limits below. Keys stay on this device.
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Adzuna {sources.adzuna.enabled && <span className="text-green-700">· On</span>}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field id="adzuna-id" label="App ID">
            <input
              id="adzuna-id"
              className={inputClass}
              value={adzunaId}
              onChange={(e) => {
                setAdzunaId(e.target.value);
              }}
            />
          </Field>
          <Field id="adzuna-key" label="App key">
            <input
              id="adzuna-key"
              type="password"
              autoComplete="off"
              className={inputClass}
              value={adzunaKey}
              onChange={(e) => {
                setAdzunaKey(e.target.value);
              }}
            />
          </Field>
          <Field id="adzuna-country" label="Country code (for example in, gb, us)">
            <input
              id="adzuna-country"
              className={inputClass}
              value={sources.adzuna.country}
              onChange={(e) => {
                setSources({ ...sources, adzuna: { ...sources.adzuna, country: e.target.value } });
              }}
              onBlur={() => void saveLimits({ adzuna: sources.adzuna })}
            />
          </Field>
          <Field id="adzuna-calls" label="Searches per day">
            <input
              id="adzuna-calls"
              type="number"
              min={0}
              className={inputClass}
              value={sources.adzuna.maxCallsPerDay}
              onChange={(e) => {
                setSources({
                  ...sources,
                  adzuna: { ...sources.adzuna, maxCallsPerDay: Number.parseInt(e.target.value, 10) },
                });
              }}
              onBlur={() => void saveLimits({ adzuna: sources.adzuna })}
            />
          </Field>
        </div>
        {sources.adzuna.enabled ? (
          <Button onClick={() => void turnOff("adzuna")}>Turn off Adzuna</Button>
        ) : (
          <Button
            onClick={() => {
              turnOn("adzuna");
            }}
          >
            Turn on Adzuna
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          JSearch (RapidAPI){" "}
          {sources.jsearch.enabled && <span className="text-green-700">· On</span>}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field id="jsearch-key" label="RapidAPI key">
            <input
              id="jsearch-key"
              type="password"
              autoComplete="off"
              className={inputClass}
              value={jsearchKey}
              onChange={(e) => {
                setJsearchKey(e.target.value);
              }}
            />
          </Field>
          <Field id="jsearch-calls" label="Searches per day">
            <input
              id="jsearch-calls"
              type="number"
              min={0}
              className={inputClass}
              value={sources.jsearch.maxCallsPerDay}
              onChange={(e) => {
                setSources({
                  ...sources,
                  jsearch: {
                    ...sources.jsearch,
                    maxCallsPerDay: Number.parseInt(e.target.value, 10),
                  },
                });
              }}
              onBlur={() => void saveLimits({ jsearch: sources.jsearch })}
            />
          </Field>
        </div>
        {sources.jsearch.enabled ? (
          <Button onClick={() => void turnOff("jsearch")}>Turn off JSearch</Button>
        ) : (
          <Button
            onClick={() => {
              turnOn("jsearch");
            }}
          >
            Turn on JSearch
          </Button>
        )}
      </div>

      {(sources.adzuna.enabled || sources.jsearch.enabled) && (
        <Button onClick={() => void searchNow()}>Search now</Button>
      )}
      <Status note={note} />
    </div>
  );
}
