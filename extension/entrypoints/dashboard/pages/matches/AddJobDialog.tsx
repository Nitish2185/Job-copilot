import { Dialog } from "radix-ui";
import { useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";

const EMPTY = { title: "", company: "", location: "", url: "", text: "" };

/** "Add job manually" (spec 13.5): paste a description from anywhere. */
export function AddJobDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const set = (key: keyof typeof EMPTY) => (value: string) => {
    setForm({ ...form, [key]: value });
  };
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!form.title.trim() || !form.company.trim()) {
      setError("Add the job title and the company.");
      return;
    }
    if (form.text.trim().length < 20) {
      setError("Paste the job description (at least a few lines).");
      return;
    }
    const url = form.url.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      setError("The link must start with http:// or https://.");
      return;
    }
    setBusy(true);
    try {
      const r = await sendMessage("jobs/addManual", {
        title: form.title.trim(),
        company: form.company.trim(),
        text: form.text.trim(),
        ...(form.location.trim() && { location: form.location.trim() }),
        ...(url && { url }),
      });
      setOpen(false);
      setForm(EMPTY);
      void navigate(`/jobs/${encodeURIComponent(r.jobId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the job.");
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof typeof EMPTY, label: string, hint?: string) => (
    <Field id={`add-${key}`} label={label} {...(hint && { hint })}>
      <input
        id={`add-${key}`}
        className={inputClass}
        value={form[key]}
        onChange={(e) => {
          set(key)(e.target.value);
        }}
      />
    </Field>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(undefined);
      }}
    >
      <Dialog.Trigger asChild>
        <Button>Add job manually</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[90vh] w-[min(36rem,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-white p-5 text-sm shadow-xl dark:bg-stone-900">
          <Dialog.Title className="text-lg font-semibold">Add a job</Dialog.Title>
          <Dialog.Description className="mt-1 text-stone-600 dark:text-stone-400">
            Paste a job from an email, a message or any website. It is saved and scored like the
            others.
          </Dialog.Description>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {input("title", "Job title")}
              {input("company", "Company")}
              {input("location", "Location (optional)")}
              {input("url", "Link (optional)", "Where to apply or read more.")}
            </div>
            <Field id="add-text" label="Job description">
              <textarea
                id="add-text"
                rows={10}
                className={inputClass}
                value={form.text}
                onChange={(e) => {
                  set("text")(e.target.value);
                }}
              />
            </Field>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>Cancel</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Adding..." : "Add job"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
