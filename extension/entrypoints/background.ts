import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { ALARMS, scheduleAlarms } from "@/lib/alarms/alarms";
import { aiHandlers } from "@/lib/background/aiHandlers";
import { matchHandlers } from "@/lib/background/matchHandlers";
import { pageHandlers } from "@/lib/background/pageHandlers";
import { queueHandlers } from "@/lib/background/queueHandlers";
import { applyHandlers } from "@/lib/background/applyHandlers";
import { autofillHandlers, registerAutofillTriggers } from "@/lib/background/autofill";
import { tailorHandlers } from "@/lib/background/tailorHandlers";
import { handlers, runBoardsSync, runFeedSync } from "@/lib/background/tasks";
import { registerMessageHandlers } from "@/lib/messaging/server";
import { QUEUE_ALARM, scheduleNext, tick } from "@/lib/queue/runner";
import { ensureSettings, updateFlags } from "@/lib/settings/settings";

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
  });

  registerAutofillTriggers();

  const openDashboard = (hash = "") =>
    browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") + hash });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void (async () => {
      await ensureSettings();
      await scheduleAlarms();
      if (reason === "install") {
        await updateFlags({ installedAt: new Date().toISOString() });
        await openDashboard("#/onboarding");
      }
      await runFeedSync();
    })();
  });

  browser.runtime.onStartup.addListener(() => {
    void scheduleAlarms().then(() => runFeedSync());
    void scheduleNext();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARMS.feedSync) void runFeedSync();
    if (alarm.name === ALARMS.boardsSync) void runBoardsSync();
    if (alarm.name === QUEUE_ALARM) void tick();
  });

  // Notification ids are "jc:<dashboard route>:<time>"; a click opens that page.
  browser.notifications.onClicked.addListener((id) => {
    const route = id.split(":")[1];
    if (route) void openDashboard(`#/${route}`);
    void browser.notifications.clear(id);
  });

  // The toolbar button opens the popup (entrypoints/popup), which links to the dashboard.
});
