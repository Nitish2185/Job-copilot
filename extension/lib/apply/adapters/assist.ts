/**
 * Assist adapters (spec 17.1-17.5): Naukri, Indeed, LinkedIn, Workday and the
 * generic one. They read jobs, detect login, confirmation and errors, find
 * search-result cards for badges and "apply on company site" links. They never
 * submit: none implements findSubmitControl. Every site's selectors are in its
 * SELECTORS entry (prefer data attributes, ARIA and text; class names change).
 * Built from the sites' public page structure; refresh from saved pages in
 * captures/ when a site changes (see CONTRIBUTING.md).
 */
import type { AssistAdapterId } from "../mode";
import { onDomain } from "../mode";
import { confirmationByText, verificationCodeAsked, visibleCaptcha, visibleErrors } from "./common";
import { readJsonLdJob, type PageJob } from "./jobFromPage";
import type { SiteAdapter } from "./types";
import { isShown } from "../dom";

export interface SiteSelectors {
  domains: readonly string[];
  /** Present only when signed in (profile menu). */
  signedIn: readonly string[];
  /** Sign-in links or buttons (present when signed out). */
  signIn: readonly string[];
  job: {
    title: readonly string[];
    company: readonly string[];
    location: readonly string[];
    description: readonly string[];
    skills: readonly string[];
    externalApply: readonly string[];
  };
  /** Search-result cards and the parts badges need. */
  cards: { card: string; title: string; company: string; location: string; link: string };
  confirmation: readonly string[];
  errors: readonly string[];
  /** Chat-style recruiter questions (Naukri): chips must never be clicked. */
  chatChips?: string;
}

export const SELECTORS: Record<Exclude<AssistAdapterId, "generic">, SiteSelectors> = {
  naukri: {
    domains: ["naukri.com"],
    signedIn: [
      "[class*='nI-gNb-drawer__icon']",
      "a[href*='/mnjuser/homepage']",
      "[class*='nI-gNb-icon-img']",
    ],
    signIn: ["#login_Layer", "a[title='Jobseeker Login']", "a[href*='/nlogin/login']"],
    job: {
      title: ["h1[class*='jd-header-title']", "h1"],
      company: ["[class*='jd-header-comp-name'] a", "[class*='jd-header-comp-name']"],
      location: ["[class*='location'] a", "[class*='jhc__location'] a"],
      description: ["[class*='job-desc']", "section[class*='JDC']"],
      skills: ["[class*='key-skill'] a", "[class*='chip'] span"],
      externalApply: ["#company-site-button", "button[class*='company-site']"],
    },
    cards: {
      card: "[class*='srp-jobtuple-wrapper'], article.jobTuple, [class*='cust-job-tuple']",
      title: "a.title, a[class*='title']",
      company: "a.comp-name, [class*='comp-name']",
      location: "[class*='locWdth'], [class*='loc']",
      link: "a.title, a[class*='title']",
    },
    confirmation: ["[class*='apply-status-header']", "[class*='already-applied']"],
    errors: ["[class*='error']"],
    chatChips:
      "[class*='chatbot_Drawer'] [class*='chip'], [class*='chatbot'] [class*='ssrc__radio']",
  },
  indeed: {
    domains: ["indeed.com"],
    signedIn: [
      "[data-gnav-element-name='Profile']",
      "#AccountMenu",
      "[data-testid='gnav-AccountMenu']",
    ],
    signIn: ["[data-gnav-element-name='SignIn']", "a[href*='secure.indeed.com/account/login']"],
    job: {
      title: [
        "h1[class*='jobsearch-JobInfoHeader-title']",
        "[data-testid='jobsearch-JobInfoHeader-title']",
        "h1",
      ],
      company: ["[data-testid='inlineHeader-companyName']", "[data-company-name]"],
      location: ["[data-testid='inlineHeader-companyLocation']", "[data-testid='job-location']"],
      description: ["#jobDescriptionText"],
      skills: [],
      externalApply: ["#applyButtonLinkContainer a", "button[aria-label*='company site' i]"],
    },
    cards: {
      card: ".job_seen_beacon, [data-jk]",
      title: "h2.jobTitle span[title], h2.jobTitle",
      company: "[data-testid='company-name']",
      location: "[data-testid='text-location']",
      link: "h2.jobTitle a, a[data-jk]",
    },
    confirmation: ["[data-testid='ia-PostApply']", "[class*='ia-PostApply']"],
    errors: ["[class*='ia-InputError']", "[id$='-errorMessage']"],
  },
  linkedin: {
    domains: ["linkedin.com"],
    signedIn: [".global-nav__me", "[data-control-name='nav.settings']"],
    signIn: [
      "a.nav__button-secondary",
      "a[href*='/login']",
      "[data-tracking-control-name*='sign-in']",
    ],
    job: {
      title: [".job-details-jobs-unified-top-card__job-title h1", ".top-card-layout__title", "h1"],
      company: [".job-details-jobs-unified-top-card__company-name a", ".topcard__org-name-link"],
      location: [".job-details-jobs-unified-top-card__bullet", ".topcard__flavor--bullet"],
      description: ["#job-details", ".show-more-less-html__markup", ".jobs-description__content"],
      skills: [],
      externalApply: [
        ".jobs-apply-button[role='link']",
        "a[data-tracking-control-name*='apply-link-offsite']",
      ],
    },
    cards: {
      card: ".base-card, .job-card-container",
      title: ".base-search-card__title, .job-card-list__title",
      company: ".base-search-card__subtitle, .artdeco-entity-lockup__subtitle",
      location: ".job-search-card__location, .job-card-container__metadata-item",
      link: "a.base-card__full-link, a.job-card-list__title, a.job-card-container__link",
    },
    confirmation: ["[data-test-modal] h2[id*='post-apply']", ".artdeco-inline-feedback--success"],
    errors: [".artdeco-inline-feedback--error"],
  },
  workday: {
    domains: ["myworkdayjobs.com", "myworkdaysite.com"],
    signedIn: [
      "[data-automation-id='accountSettingsButton']",
      "[data-automation-id='utilityMenuButton']",
    ],
    signIn: ["[data-automation-id='utilityButtonSignIn']", "[data-automation-id='signInLink']"],
    job: {
      title: ["[data-automation-id='jobPostingHeader']", "h2", "h1"],
      company: ["[data-automation-id='companyName']"],
      location: ["[data-automation-id='locations'] dd", "[data-automation-id='locations']"],
      description: ["[data-automation-id='jobPostingDescription']"],
      skills: [],
      externalApply: [],
    },
    cards: {
      card: "li[class*='css'] [data-automation-id='jobTitle']",
      title: "[data-automation-id='jobTitle']",
      company: "[data-automation-id='companyName']",
      location: "[data-automation-id='locations']",
      link: "a[data-automation-id='jobTitle']",
    },
    confirmation: [
      "[data-automation-id='congratulationsPopup']",
      "[data-automation-id='submittedMessage']",
    ],
    errors: ["[data-automation-id='errorMessage']", "[data-automation-id='inputAlert']"],
  },
};

function firstText(doc: ParentNode, selectors: readonly string[]): string {
  for (const s of selectors) {
    const el = doc.querySelector(s);
    const text = el?.textContent.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function firstHref(doc: Document, selectors: readonly string[]): string | undefined {
  for (const s of selectors) {
    const el = doc.querySelector<HTMLElement>(s);
    const href = el?.getAttribute("href") ?? el?.dataset.href;
    if (href) return new URL(href, doc.location.href).href;
  }
  return undefined;
}

/** The job on the page: schema.org data, else the site's DOM. */
export function readSiteJob(doc: Document, s: SiteSelectors | undefined): PageJob | undefined {
  const fromJsonLd = readJsonLdJob(doc);
  const external = s ? firstHref(doc, s.job.externalApply) : undefined;
  if (fromJsonLd)
    return {
      ...fromJsonLd,
      url: doc.location.href,
      ...(external && { externalApplyUrl: external }),
    };
  if (!s) return undefined;
  const title = firstText(doc, s.job.title);
  const company = firstText(doc, s.job.company);
  if (!title || !company) return undefined;
  const description = s.job.description.map((d) => doc.querySelector(d)).find(Boolean);
  const skills = s.job.skills.flatMap((sel) =>
    Array.from(doc.querySelectorAll(sel), (e) => e.textContent.trim()),
  );
  const location = firstText(doc, s.job.location);
  return {
    title,
    company,
    locations: location ? [location] : [],
    descriptionHtml: description?.innerHTML ?? "",
    url: doc.location.href,
    ...(external && { externalApplyUrl: external }),
    ...(skills.length > 0 && { skills: skills.filter(Boolean) }),
  };
}

export interface SearchCard {
  element: HTMLElement;
  anchor: HTMLElement;
  title: string;
  company: string;
  location: string;
  url: string;
}

/** Job cards the page has already loaded (badges never fetch anything, spec 2.1). */
export function searchCards(doc: Document, s: SiteSelectors): SearchCard[] {
  const all = Array.from(doc.querySelectorAll<HTMLElement>(s.cards.card));
  // A selector may match a card and an element inside it: keep the outermost.
  return all
    .filter((el) => !all.some((other) => other !== el && other.contains(el)))
    .map((element) => {
      const anchor = element.querySelector<HTMLElement>(s.cards.title) ?? element;
      const link = element.querySelector<HTMLAnchorElement>(s.cards.link);
      const title = (anchor.getAttribute("title") ?? anchor.textContent)
        .replace(/\s+/g, " ")
        .trim();
      return {
        element,
        anchor,
        title,
        company: firstText(element, [s.cards.company]),
        location: firstText(element, [s.cards.location]),
        url: link
          ? new URL(link.getAttribute("href") ?? "", doc.location.href).href
          : doc.location.href,
      };
    })
    .filter((c) => c.title !== "" && isShown(c.element));
}

function makeAssist(id: Exclude<AssistAdapterId, "generic">): SiteAdapter & {
  selectors: SiteSelectors;
  readJob: (doc: Document) => PageJob | undefined;
} {
  const s = SELECTORS[id];
  const any = (doc: Document, list: readonly string[]) =>
    list.some((sel) => {
      const el = doc.querySelector(sel);
      return el !== null && isShown(el);
    });
  return {
    id,
    mode: "assist",
    selectors: s,
    matches: (url) => s.domains.some((d) => onDomain(url.hostname.toLowerCase(), d)),
    detectPage(doc) {
      if (this.detectConfirmation(doc).confirmed) return "confirmation";
      if (doc.querySelector("input[type=password]")) return "login";
      if (doc.querySelector("form input:not([type=hidden]), form select, form textarea"))
        return "apply_form";
      return readSiteJob(doc, s) ? "job" : "other";
    },
    isLoggedIn(doc) {
      if (any(doc, s.signedIn)) return true;
      if (any(doc, s.signIn)) return false;
      return "unknown";
    },
    readJob: (doc) => readSiteJob(doc, s),
    detectCaptcha: visibleCaptcha,
    detectVerificationCode: verificationCodeAsked,
    detectConfirmation: (doc) => confirmationByText(doc, s.confirmation),
    detectErrors: (doc) => visibleErrors(doc, s.errors),
  };
}

export const ASSIST_ADAPTERS = {
  naukri: makeAssist("naukri"),
  indeed: makeAssist("indeed"),
  linkedin: makeAssist("linkedin"),
  workday: makeAssist("workday"),
};

/** Any other site: schema.org data only, plus generic confirmation and error detection. */
export const GENERIC_ADAPTER: SiteAdapter & { readJob: (doc: Document) => PageJob | undefined } = {
  id: "generic",
  mode: "assist",
  matches: () => true,
  detectPage: (doc) => (readJsonLdJob(doc) ? "job" : "other"),
  readJob: (doc) => readSiteJob(doc, undefined),
  detectCaptcha: visibleCaptcha,
  detectVerificationCode: verificationCodeAsked,
  detectConfirmation: (doc) => confirmationByText(doc),
  detectErrors: (doc) => visibleErrors(doc, []),
};

export function assistAdapterFor(id: AssistAdapterId) {
  return id === "generic" ? GENERIC_ADAPTER : ASSIST_ADAPTERS[id];
}
