import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { ALARMS, scheduleAlarms } from "@/lib/alarms/alarms";
import { aiHandlers } from "@/lib/background/aiHandlers";
import { handlers, runBoardsSync, runFeedSync } from "@/lib/background/tasks";
import { registerMessageHandlers } from "@/lib/messaging/server";
import { ensureSettings, updateFlags } from "@/lib/settings/settings";

export default defineBackground(() => {
  // Listeners are registered synchronously so a woken service worker sees every event.
  registerMessageHandlers({ ...handlers, ...aiHandlers });

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
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARMS.feedSync) void runFeedSync();
    if (alarm.name === ALARMS.boardsSync) void runBoardsSync();
  });

  // MV3 builds expose `action`; Firefox MV2 builds expose `browserAction`.
  const action = import.meta.env.MANIFEST_VERSION === 2 ? browser.browserAction : browser.action;
  action.onClicked.addListener(() => {
    void openDashboard();
  });
});
