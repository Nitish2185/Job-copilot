// In-memory IndexedDB for Dexie, and a clean fake browser for every test.
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

beforeEach(() => {
  fakeBrowser.reset();
});
