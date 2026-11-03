import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { ALARMS, scheduleAlarms } from "@/lib/alarms/alarms";
import { aiHandlers } from "@/lib/background/aiHandlers";
import { matchHandlers } from "@/lib/background/matchHandlers";
import {
  assistSiteHandlers,
  registerOptionalSiteSync,
  syncOptionalSites,
} from "@/lib/background/assistSites";
import { pageHandlers, registerSaveMenus } from "@/lib/background/pageHandlers";
import { runPrefilter } from "@/lib/background/matchHandlers";
import { queueHandlers } from "@/lib/background/queueHandlers";
import { applyHandlers } from "@/lib/background/applyHandlers";
import { autofillHandlers, registerAutofillTriggers } from "@/lib/background/autofill";
import { tailorHandlers } from "@/lib/background/tailorHandlers";
import { trackerHandlers } from "@/lib/background/trackerHandlers";
import { handlers, runBoardsSync, runFeedSync } from "@/lib/background/tasks";
import { registerMessageHandlers } from "@/lib/messaging/server";
import { QUEUE_ALARM, scheduleNext, tick } from "@/lib/queue/runner";
import { runRetention } from "@/lib/backup/retention";
import { dataHandlers } from "@/lib/background/dataHandlers";
import { listingHandlers, runListingSync } from "@/lib/background/listingHandlers";
import { getDb } from "@/lib/db/db";
import {
  MIRROR_META_KEY,
  pullAnswerMirror,
  pushAnswerMirror,
  syncAnswerMirror,
} from "@/lib/sync/answerMirror";
import { runNotificationChecks } from "@/lib/notifications/notifications";
import { ensureSettings, loadSettings, updateFlags } from "@/lib/settings/settings";

export default defineBackground(() => {
  // Listeners are registered synchronously so a woken service worker sees every event.
  registerMessageHandlers({
    ...handlers,
    ...aiHandlers,
    ...matchHandlers,
    ...tailorHandlers,
    ...applyHandlers,
    ...autofillHandlers,
    ...queueHandlers,
    ...pageHandlers,
    ...assistSiteHandlers,
    ...trackerHandlers,
    ...dataHandlers,
    ...listingHandlers,
  });

  registerAutofillTriggers();
  registerSaveMenus();
  registerOptionalSiteSync();

  const openDashboard = (hash = "") =>
    browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") + hash });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void (async () => {
      await ensureSettings();
      await scheduleAlarms();
      await syncOptionalSites().catch(() => undefined);
      await syncAnswerMirror(getDb()).catch(() => undefined);
      if (reason === "install") {
        await updateFlags({ installedAt: new Date().toISOString() });
        await openDashboard("#/onboarding");
      }
      // After an update, re-rank every job: matching rules may have changed.
      if (reason === "update") await runPrefilter(true).catch(() => undefined);
      await runFeedSync();
    })();
  });

  // Answers saved in another browser on the same account arrive through sync.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && MIRROR_META_KEY in changes)
      void pullAnswerMirror(getDb()).catch(() => undefined);
  });

  browser.runtime.onStartup.addListener(() => {
    void syncAnswerMirror(getDb()).catch(() => undefined);
    void scheduleAlarms().then(() => runFeedSync());
    void scheduleNext();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARMS.feedSync) void runFeedSync();
    if (alarm.name === ALARMS.boardsSync) {
      void runBoardsSync();
      void runListingSync().catch(() => undefined);
    }
    if (alarm.name === QUEUE_ALARM) void tick();
    if (alarm.name === ALARMS.maintenance) void runRetention(getDb());
    if (alarm.name === ALARMS.notifications) {
      void loadSettings().then((s) => runNotificationChecks(getDb(), s));
      void pushAnswerMirror(getDb()).catch(() => undefined);
    }
  });

  // Notification ids are "jc:<dashboard route>:<time>"; a click opens that page.
  browser.notifications.onClicked.addListener((id) => {
    // Routes may contain ":" (job IDs), so take everything between the prefix and the time.
    const route = id.startsWith("jc:") ? id.slice(3, id.lastIndexOf(":")) : "";
    if (route) void openDashboard(`#/${route}`);
    void browser.notifications.clear(id);
  });

  // The toolbar button opens the popup (entrypoints/popup), which links to the dashboard.
});
