/**
 * Backup and restore (spec 20): everything in one JSON file, files as base64.
 * API keys are left out unless the user ticks "Include API keys". Import checks
 * the format and version, then merges (the backup's copy wins for the same ID)
 * or replaces everything. The AI cache is not exported: it is only a cache.
 */
import { SecretsSchema, type Secrets, type Settings } from "@job-copilot/shared";
import { z } from "zod";
import { SCHEMA_V1, type JobCopilotDB } from "../db/db";

export const BACKUP_FORMAT = "job-copilot-backup";
/** Bump with a migration in `migrateBackup` whenever the stored shape changes. */
export const BACKUP_VERSION = 1;

type TableName = keyof typeof SCHEMA_V1;
export const BACKUP_TABLES = (Object.keys(SCHEMA_V1) as TableName[]).filter((t) => t !== "aiCache");

const BLOB_TAG = "__jcBlob";

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  appVersion: z.string().optional(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  settings: z.unknown().optional(),
  secrets: SecretsSchema.optional(),
});
export type Backup = z.infer<typeof BackupSchema>;

export class BackupError extends Error {
  override name = "BackupError";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32_768));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function createBackup(
  db: JobCopilotDB,
  options: { settings: Settings; secrets?: Secrets; appVersion?: string; now?: Date },
): Promise<Backup> {
  const tables: Backup["tables"] = {};
  for (const name of BACKUP_TABLES) {
    const rows = (await db.table(name).toArray()) as Record<string, unknown>[];
    tables[name] = await Promise.all(
      rows.map(async (row) => {
        if (!(row.blob instanceof Blob)) return row;
        return {
          ...row,
          blob: { [BLOB_TAG]: true, type: row.blob.type, base64: await blobToBase64(row.blob) },
        };
      }),
    );
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    ...(options.appVersion && { appVersion: options.appVersion }),
    tables,
    settings: options.settings,
    ...(options.secrets && { secrets: options.secrets }),
  };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `jobcopilot-backup-${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Older backups are brought up to the current shape here (none yet). */
export function migrateBackup(backup: Backup): Backup {
  if (backup.version > BACKUP_VERSION) {
    throw new BackupError(
      "This backup comes from a newer version of Job Copilot. Update the extension, then import it again.",
    );
  }
  return backup;
}

/** Parses and checks a backup file's text. */
export function readBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This file is not a Job Copilot backup (it is not valid JSON).");
  }
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError("This file is not a Job Copilot backup.");
  return migrateBackup(parsed.data);
}

export interface ImportResult {
  records: number;
  skipped: number;
}

function restoreRow(row: Record<string, unknown>): Record<string, unknown> {
  const blob = row.blob as { [BLOB_TAG]?: boolean; type?: string; base64?: string } | undefined;
  if (!blob?.[BLOB_TAG] || typeof blob.base64 !== "string") return row;
  return { ...row, blob: base64ToBlob(blob.base64, blob.type ?? "application/octet-stream") };
}

/** Primary key of each table (the first entry of its index list). */
function keyOf(table: TableName): string {
  return SCHEMA_V1[table].split(",")[0]?.trim() ?? "id";
}

/**
 * Writes the backup into the database. "replace" clears every table first;
 * "merge" adds the backup's records, replacing ones with the same ID. Rows
 * without their ID are skipped. Settings and keys are applied by the caller.
 */
export async function importBackup(
  db: JobCopilotDB,
  backup: Backup,
  mode: "merge" | "replace",
): Promise<ImportResult> {
  let records = 0;
  let skipped = 0;
  const tables = BACKUP_TABLES.map((name) => db.table(name));
  await db.transaction("rw", tables, async () => {
    if (mode === "replace") for (const t of tables) await t.clear();
    for (const name of BACKUP_TABLES) {
      const rows = backup.tables[name] ?? [];
      const key = keyOf(name);
      const autoIncrement = key.startsWith("++");
      const ready: Record<string, unknown>[] = [];
      for (const row of rows) {
        if (autoIncrement) {
          // Merged log entries are appended with new numbers.
          const { seq: _seq, ...rest } = row;
          ready.push(mode === "merge" ? rest : row);
        } else if (row[key] === undefined || row[key] === null || row[key] === "") {
          skipped++;
        } else {
          ready.push(restoreRow(row));
        }
      }
      await db.table(name).bulkPut(ready);
      records += ready.length;
    }
  });
  return { records, skipped };
}
