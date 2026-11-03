import { Dialog } from "radix-ui";
import { useEffect, useState, type ChangeEvent } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import {
  backupFileName,
  createBackup,
  importBackup,
  readBackup,
  type Backup,
} from "@/lib/backup/backup";
import { getDb } from "@/lib/db/db";
import { downloadBlob } from "@/lib/files/open";
import { sendMessage } from "@/lib/messaging/client";
import { loadMirrorMeta, type MirrorMeta } from "@/lib/sync/answerMirror";
import {
  loadSecrets,
  loadSettings,
  updateSecrets,
  updateSettings,
} from "@/lib/settings/settings";

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

function ExportBackup() {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [note, setNote] = useState<Note>();
  const run = async () => {
    const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
    const backup = await createBackup(getDb(), {
      settings,
      ...(includeKeys && { secrets }),
      appVersion: browser.runtime.getManifest().version,
    });
    downloadBlob(
      new Blob([JSON.stringify(backup)], { type: "application/json" }),
      backupFileName(),
    );
    setNote({ ok: true, text: "Backup saved to your downloads." });
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Export</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        One file with your profile, jobs, applications, resumes, answers and settings.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeKeys}
          onChange={(e) => {
            setIncludeKeys(e.target.checked);
          }}
        />
        Include API keys (keep the file private)
      </label>
      <Button onClick={() => void run()}>Export everything</Button>
      <Status note={note} />
    </div>
  );
}

function ImportBackup() {
  const [backup, setBackup] = useState<Backup>();
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [restoreKeys, setRestoreKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>();

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    setNote(undefined);
    setBackup(undefined);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      setBackup(readBackup(await file.text()));
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : "Could not read it." });
    }
  };
  const run = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const result = await importBackup(getDb(), backup, mode);
      let settingsNote = "";
      if (backup.settings && typeof backup.settings === "object") {
        try {
          await updateSettings(backup.settings);
        } catch {
          settingsNote = " Its settings were not valid, so yours were kept.";
        }
      }
      if (restoreKeys && backup.secrets) await updateSecrets(backup.secrets);
      setNote({
        ok: true,
        text: `Imported ${String(result.records)} records.${result.skipped ? ` ${String(result.skipped)} broken records were skipped.` : ""}${settingsNote}`,
      });
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Import</h3>
      <label className="block text-sm">
        <span className="sr-only">Backup file</span>
        <input type="file" accept="application/json,.json" onChange={(e) => void choose(e)} />
      </label>
      {backup && (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <p>
            {fileName}: exported {new Date(backup.exportedAt).toLocaleString()}.
          </p>
          <fieldset className="space-y-1">
            <legend className="sr-only">How to import</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "merge"}
                onChange={() => {
                  setMode("merge");
                }}
              />
              <span>
                Merge
                <span className="block text-xs text-slate-500">
                  Add the backup to what is here. Records in both are replaced by the backup’s
                  copy.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "replace"}
                onChange={() => {
                  setMode("replace");
                }}
              />
              <span>
                Replace
                <span className="block text-xs text-slate-500">
                  Remove everything here first, then restore the backup.
                </span>
              </span>
            </label>
          </fieldset>
          {backup.secrets && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={restoreKeys}
                onChange={(e) => {
                  setRestoreKeys(e.target.checked);
                }}
              />
              Also restore the API keys in this backup
            </label>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Importing..." : mode === "merge" ? "Merge backup" : "Replace with backup"}
          </Button>
        </div>
      )}
      <Status note={note} />
    </div>
  );
}

function DeleteEverything() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const run = async () => {
    try {
      await sendMessage("data/deleteEverything", { confirm: "DELETE" });
      location.hash = "#/onboarding";
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    }
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Delete everything</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Removes all Job Copilot data from this browser: profile, jobs, applications, files,
        settings and keys. Export first if you may want it back.
      </p>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setTyped("");
        }}
      >
        <Dialog.Trigger asChild>
          <Button variant="danger">Delete everything…</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-lg bg-white p-5 text-sm shadow-xl dark:bg-slate-900">
            <Dialog.Title className="text-lg font-semibold">Delete everything?</Dialog.Title>
            <Dialog.Description>
              This cannot be undone. Type <strong>DELETE</strong> to confirm.
            </Dialog.Description>
            <input
              aria-label="Type DELETE to confirm"
              className={inputClass}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
              }}
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>Cancel</Button>
              </Dialog.Close>
              <Button variant="danger" disabled={typed !== "DELETE"} onClick={() => void run()}>
                Delete everything
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** Where saved answers sync, and a notice when there are too many to sync (spec 6). */
function SyncStatus() {
  const [meta, setMeta] = useState<MirrorMeta>();
  useEffect(() => {
    void loadMirrorMeta().then(setMeta);
  }, []);
  if (!meta) return null;
  return meta.tooLarge ? (
    <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Your saved answers are too many to sync between browsers ({String(meta.count)} answers). They
      stay on this device; use Export and Import to move them.
    </p>
  ) : (
    <p className="text-sm text-slate-600 dark:text-slate-400">
      Settings and {String(meta.count)} saved answers sync to browsers signed in to the same
      account. Pay, notice period and other sensitive answers, and API keys, never sync.
    </p>
  );
}

/** Export, import and delete (spec 20). */
export function DataControls() {
  return (
    <div className="space-y-6">
      <SyncStatus />
      <ExportBackup />
      <ImportBackup />
      <DeleteEverything />
    </div>
  );
}
