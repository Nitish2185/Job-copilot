import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

export default defineBackground(() => {
  const openDashboard = (hash = "") =>
    browser.tabs.create({ url: browser.runtime.getURL("/dashboard.html") + hash });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") void openDashboard("#/onboarding");
  });

  // MV3 builds expose `action`; Firefox MV2 builds expose `browserAction`.
  const action = import.meta.env.MANIFEST_VERSION === 2 ? browser.browserAction : browser.action;
  action.onClicked.addListener(() => {
    void openDashboard();
  });
});
