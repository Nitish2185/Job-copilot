/**
 * LinkedIn and Workday site scripts (spec 17.3, 17.4): registered only while the
 * user has granted the site's optional host permission, unregistered when it is
 * removed. The Settings page asks for the permission (a user gesture), then
 * calls "assist/syncSites".
 */
import { browser } from "wxt/browser";
import {
  OPTIONAL_SITES,
  OPTIONAL_SITE_SCRIPT,
  scriptIdFor,
  type OptionalSiteId,
} from "../apply/optionalSites";
import type { Handlers } from "../messaging/server";

const SITE_IDS = Object.keys(OPTIONAL_SITES) as OptionalSiteId[];

async function granted(site: OptionalSiteId): Promise<boolean> {
  return browser.permissions.contains({ origins: OPTIONAL_SITES[site].origins }).catch(() => false);
}

/** Registers or unregisters each site's script to match its permission. */
export async function syncOptionalSites(): Promise<{ id: OptionalSiteId; enabled: boolean }[]> {
  const registered = new Set(
    (await browser.scripting.getRegisteredContentScripts().catch(() => [])).map((s) => s.id),
  );
  const result: { id: OptionalSiteId; enabled: boolean }[] = [];
  for (const id of SITE_IDS) {
    const enabled = await granted(id);
    const scriptId = scriptIdFor(id);
    if (enabled && !registered.has(scriptId)) {
      await browser.scripting.registerContentScripts([
        {
          id: scriptId,
          matches: OPTIONAL_SITES[id].origins,
          js: [OPTIONAL_SITE_SCRIPT],
          runAt: "document_idle",
          persistAcrossSessions: true,
        },
      ]);
    }
    if (!enabled && registered.has(scriptId)) {
      await browser.scripting.unregisterContentScripts({ ids: [scriptId] });
    }
    result.push({ id, enabled });
  }
  return result;
}

export function registerOptionalSiteSync(): void {
  browser.permissions.onAdded.addListener(() => void syncOptionalSites().catch(() => undefined));
  browser.permissions.onRemoved.addListener(() => void syncOptionalSites().catch(() => undefined));
}

export const assistSiteHandlers: Handlers = {
  "assist/syncSites": async () => ({ sites: await syncOptionalSites() }),
  "assist/disableSite": async ({ site }) => {
    await browser.permissions.remove({ origins: OPTIONAL_SITES[site].origins });
    return { sites: await syncOptionalSites() };
  },
};
