/**
 * The Assist site script's behaviour (spec 13.7, 16.6, 17.1-17.4), shared by the
 * Naukri/Indeed script and the optional LinkedIn/Workday script:
 * - Autofill on request, with a banner instead when the user is logged out.
 * - "Autofill each new step automatically": only after the user pressed Autofill
 *   in this tab, only while the tab is visible, and it only fills (never clicks).
 * - Confirmation detection records the application.
 * - Search-result badges from cards already on the page.
 * - Naukri chat chips: the suggested chip is highlighted, never clicked.
 */
import { browser } from "wxt/browser";
import { sendMessage } from "../messaging/client";
import type { AssistAdapterId } from "./mode";
import type { PageJob } from "./adapters/jobFromPage";
import type { SiteAdapter } from "./adapters/types";
import { searchCards, type SiteSelectors } from "./adapters/assist";
import { ASSIST_LOADED, AUTOFILL_COMMAND, manualAutofill } from "./pageAutofill";
import { BADGE_TAG, renderBadge, showBanner } from "./siteUi";
import {
  DIAGNOSTICS_COMMAND,
  SAVE_JOB_COMMAND,
  chipGroups,
  collectDiagnostics,
  hasNewControls,
  highlightChip,
  markControlsSeen,
  saveJobFromPage,
  suggestChip,
} from "./sitePage";

type ReadableAdapter = SiteAdapter & { readJob?: (doc: Document) => PageJob | undefined };

const SITE_NAMES: Record<string, string> = {
  naukri: "Naukri",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  workday: "Workday",
};

export function loggedOutText(adapterId: string): string {
  return `You're logged out of ${SITE_NAMES[adapterId] ?? "this site"}. Please log in, then press Autofill again.`;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Save-job and diagnostics commands, answered by every Job Copilot page script
 * (returns undefined when the message is not one of them).
 */
export function handleSiteCommand(
  message: { type?: string },
  adapter: ReadableAdapter,
  sendResponse: (reply: unknown) => void,
): true | undefined {
  if (message.type === SAVE_JOB_COMMAND) {
    saveJobFromPage(document, adapter.readJob, {
      extract: (url, text) => sendMessage("ai/extractJobFromPage", { url, text }),
      save: (page) => sendMessage("jobs/saveFromPage", { page }),
    }).then(sendResponse, (e: unknown) => {
      sendResponse({ error: errorText(e) });
    });
    return true;
  }
  if (message.type === DIAGNOSTICS_COMMAND) {
    sendResponse(collectDiagnostics(document, adapter, browser.runtime.getManifest().version));
    return undefined;
  }
  return undefined;
}

export function startAssistSite(
  adapter: ReadableAdapter & { selectors: SiteSelectors },
  site: Exclude<AssistAdapterId, "generic">,
): void {
  const scope = window as unknown as Record<string, boolean>;
  if (scope[ASSIST_LOADED]) return;
  scope[ASSIST_LOADED] = true;

  const state = {
    autofilled: false,
    filling: false,
    reported: new Set<string>(),
    /** Confirmations already on the page at load (e.g. "Already applied") are not new. */
    confirmedAtLoad: adapter.detectConfirmation(document).confirmed,
    scored: new WeakSet<HTMLElement>(),
    config: { autofillEachStep: false, badges: false },
  };

  const autofill = async (resumeChoice: "current" | "tailored") => {
    if (adapter.isLoggedIn?.(document) === false) {
      showBanner(document, loggedOutText(site));
      return { filled: 0, needsYou: 0, error: loggedOutText(site) };
    }
    state.filling = true;
    try {
      const result = await manualAutofill(resumeChoice);
      state.autofilled = true;
      await hintChips();
      return result;
    } finally {
      markControlsSeen(document);
      state.filling = false;
    }
  };

  const hintChips = async () => {
    const selector = adapter.selectors.chatChips;
    if (!selector) return;
    const groups = chipGroups(document, selector).filter(
      (g) => !g.some((c) => c.dataset.jcSuggested),
    );
    if (groups.length === 0) return;
    const data = await sendMessage("apply/context", {
      url: location.href,
      resumeChoice: "current",
    });
    for (const group of groups) {
      const chip = await suggestChip(group, data, new Date());
      if (chip) highlightChip(chip);
    }
  };

  const checkConfirmation = () => {
    if (state.confirmedAtLoad) return;
    const confirmation = adapter.detectConfirmation(document);
    if (!confirmation.confirmed || state.reported.has(location.href)) return;
    state.reported.add(location.href);
    void sendMessage("apply/assistConfirmed", {
      url: location.href,
      ...(confirmation.text && { text: confirmation.text.slice(0, 500) }),
    }).catch(() => undefined);
  };

  const fillNewStep = () => {
    if (!state.autofilled || !state.config.autofillEachStep || state.filling) return;
    if (document.visibilityState !== "visible" || !hasNewControls(document)) return;
    void autofill("current").catch(() => undefined);
  };

  const addBadges = async () => {
    if (!state.config.badges) return;
    const cards = searchCards(document, adapter.selectors).filter(
      (c) => !state.scored.has(c.element),
    );
    if (cards.length === 0) return;
    for (const card of cards) state.scored.add(card.element);
    const batch = cards.slice(0, 100);
    const { scores } = await sendMessage("match/quickScores", {
      cards: batch.map(({ title, company, location: where, url }) => ({
        title: title.slice(0, 300),
        company: company.slice(0, 300),
        location: where.slice(0, 300),
        url,
      })),
    });
    batch.forEach((card, i) => {
      const score = scores[i];
      if (!score || card.element.querySelector(BADGE_TAG)) return;
      renderBadge(card.anchor, score, async () => {
        const saved = await sendMessage("jobs/saveFromPage", {
          page: {
            title: card.title,
            company: card.company || "Unknown",
            locations: card.location ? [card.location] : [],
            descriptionHtml: "",
            url: card.url,
          },
        });
        return Boolean(saved.jobId);
      });
    });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      checkConfirmation();
      fillNewStep();
      void addBadges().catch(() => undefined);
      if (state.autofilled) void hintChips().catch(() => undefined);
    }, 700);
  };

  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const message = raw as { type?: string; resumeChoice?: "current" | "tailored" };
    if (message.type === AUTOFILL_COMMAND) {
      autofill(message.resumeChoice ?? "current").then(sendResponse, (e: unknown) => {
        sendResponse({ filled: 0, needsYou: 0, error: errorText(e) });
      });
      return true;
    }
    return handleSiteCommand(message, adapter, sendResponse);
  });

  void sendMessage("assist/pageConfig", { site })
    .then((config) => {
      state.config = config;
      onChange();
    })
    .catch(() => undefined);
  new MutationObserver(onChange).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("visibilitychange", onChange);
}
