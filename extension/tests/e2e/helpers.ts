/** Helpers shared by E2E specs: write and read the extension's IndexedDB from an extension page. */
import type { Page } from "@playwright/test";

export const TEST_PROFILE = {
  id: "me",
  version: 1,
  basics: {
    fullName: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    phone: "+91 99999 01234",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    otherLinks: [],
  },
  headline: "Full-stack developer",
  summary: "Full-stack developer with 4 years of experience.",
  skills: [{ id: "react", displayName: "React", years: 3, source: "resume" }],
  experience: [],
  totalExperienceMonths: 53,
  education: [],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
  baseResume: {
    fileName: "Aarav_Mehta_Resume.pdf",
    mimeType: "application/pdf",
    fileId: "resume-file",
    extractedText: "Aarav Mehta",
    uploadedAt: "2026-11-01T00:00:00Z",
  },
  updatedAt: "2026-11-01T00:00:00Z",
};

export const TEST_RESUME_FILE = {
  id: "resume-file",
  name: "Aarav_Mehta_Resume.pdf",
  mimeType: "application/pdf",
  createdAt: "2026-11-01T00:00:00Z",
};

/** Puts records into stores (a Blob is made for files with `blobText`). */
export async function putRecords(page: Page, records: Record<string, unknown[]>): Promise<void> {
  await page.evaluate(async (byStore) => {
    await new Promise((r) => setTimeout(r, 300));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("job-copilot");
      open.onerror = () => {
        reject(open.error ?? new Error("open"));
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(Object.keys(byStore), "readwrite");
        for (const [store, rows] of Object.entries(byStore)) {
          for (const row of rows as Record<string, unknown>[]) {
            const value =
              typeof row.blobText === "string"
                ? {
                    ...row,
                    blob: new Blob([row.blobText], { type: "application/pdf" }),
                    blobText: undefined,
                  }
                : row;
            tx.objectStore(store).put(value);
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("tx"));
        };
      };
    });
  }, records);
}

export async function readAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open("job-copilot");
        open.onerror = () => {
          reject(open.error ?? new Error("open"));
        };
        open.onsuccess = () => {
          const request = open.result.transaction(name, "readonly").objectStore(name).getAll();
          request.onsuccess = () => {
            resolve(request.result as T[]);
            open.result.close();
          };
          request.onerror = () => {
            reject(request.error ?? new Error("read"));
          };
        };
      }),
    store,
  );
}

/** Polls until `check` returns a value (or fails after `timeoutMs`). */
export async function waitFor<T>(
  check: () => Promise<T | undefined>,
  timeoutMs = 60_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 500));
  }
}
