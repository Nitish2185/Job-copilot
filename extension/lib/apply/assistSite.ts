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
import { searchCards, type SearchCard, type SiteSelectors } from "./adapters/assist";
import { isShown } from "./dom";
import { ASSIST_LOADED, AUTOFILL_COMMAND, manualAutofill } from "./pageAutofill";
import { renderBadge, showActionButton, showBanner, type BadgeScore } from "./siteUi";
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

/** Spec 13.7: at most 10 cards per click. */
export const AI_CARDS_PER_CLICK = 10;

/**
 * "Autofill each new step automatically" (spec 2.1, 16.6): only after the user pressed
 * Autofill in this tab, only with the setting on, only while the tab is visible, and
 * only for a step not filled yet. It fills; it never clicks.
 */
export function canFillNewStep(s: {
  pressedAutofill: boolean;
  settingOn: boolean;
  busy: boolean;
  tabVisible: boolean;
  newStep: boolean;
}): boolean {
  return s.pressedAutofill && s.settingOn && !s.busy && s.tabVisible && s.newStep;
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
    config: { autofillEachStep: false, badges: false },
  };

  const badges = new Map<HTMLElement, { card: SearchCard; host: HTMLElement; score: BadgeScore }>();
  const requested = new WeakSet<HTMLElement>();

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
    const ok = canFillNewStep({
      pressedAutofill: state.autofilled,
      settingOn: state.config.autofillEachStep,
      busy: state.filling,
      tabVisible: document.visibilityState === "visible",
      newStep: hasNewControls(document),
    });
    if (ok) void autofill("current").catch(() => undefined);
  };

  const toCard = ({ title, company, location: where, url }: SearchCard) => ({
    title: title.slice(0, 300),
    company: company.slice(0, 300),
    location: where.slice(0, 300),
    url,
  });

  const badge = (card: SearchCard, score: BadgeScore) => {
    badges.get(card.element)?.host.remove();
    const host = renderBadge(card.anchor, score, async () => {
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
    badges.set(card.element, { card, host, score });
  };

  /** "AI-score the jobs on this page": the next 10 visible cards with only an estimate. */
  const aiScoreCards = async (): Promise<string> => {
    const pending = [...badges.values()]
      .filter((b) => b.score.isEstimate !== false && isShown(b.card.element))
      .slice(0, AI_CARDS_PER_CLICK);
    if (pending.length === 0) return "Every job on this page has an AI score.";
    const { scores, error } = await sendMessage("match/aiScoreCards", {
      cards: pending.map((b) => toCard(b.card)),
    });
    let scored = 0;
    pending.forEach((b, i) => {
      const score = scores[i];
      if (!score) return;
      if (score.isEstimate === false) scored++;
      badge(b.card, score);
    });
    if (error && scored === 0) return error;
    return `AI-scored ${String(scored)} job${scored === 1 ? "" : "s"}.${error ? ` ${error}` : ""}`;
  };

  const addBadges = async () => {
    if (!state.config.badges) return;
    const batch = searchCards(document, adapter.selectors)
      .filter((c) => !badges.has(c.element) && !requested.has(c.element))
      .slice(0, 100);
    if (batch.length === 0) return;
    for (const card of batch) requested.add(card.element);
    const { scores } = await sendMessage("match/quickScores", { cards: batch.map(toCard) });
    batch.forEach((card, i) => {
      const score = scores[i];
      if (score) badge(card, score);
    });
    showActionButton(document, "AI-score jobs on this page", aiScoreCards);
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
