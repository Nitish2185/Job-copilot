/** Saving and previewing files from extension pages. */
import { getDb } from "../db/db";

/** Starts a download of `blob` as `name`. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Downloads a stored file, or opens it in a new tab to preview it. */
export async function openStoredFile(fileId: string, mode: "download" | "preview"): Promise<void> {
  const file = await getDb().files.get(fileId);
  if (!file) return;
  if (mode === "download") {
    downloadBlob(file.blob, file.name);
    return;
  }
  const url = URL.createObjectURL(file.blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
