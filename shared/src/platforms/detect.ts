/**
 * Careers URL (or careers-page HTML) -> job-board platform and company token
 * (spec 7.9). Used by the extension's "Add company" feature; the Go `discover`
 * command has a port. Both pass shared/testcases/platform-urls.cases.json.
 */
import type { FeedPlatform } from "../schemas/feed";

export interface PlatformMatch {
  platform: FeedPlatform;
  /** Company board token, or null when only a job ID was found (e.g. `?gh_jid=`). */
  token: string | null;
  jobId?: string;
  /** Lever EU accounts live on jobs.eu.lever.co / api.eu.lever.co. */
  variant?: "eu";
}

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_PATTERN = /^\d+$/;
const SMARTRECRUITERS_ID_PATTERN = /^(\d+)(?:-|$)/;
const WORKABLE_SHORTCODE_PATTERN = /^[A-Za-z0-9]+$/;
const RESERVED_TOKENS = new Set(["embed", "v1", "api", "jobs", "j", "oneclick-ui"]);
const WORKABLE_RESERVED_SUBDOMAINS = new Set(["apply", "www", "jobs", "careers"]);

/**
 * Candidate ATS links inside HTML. Same pattern in Go (RE2) with the (?i) flag.
 * Whitespace is spelled out because \s means different things in JavaScript and RE2.
 */
const HTML_LINK_PATTERN =
  /(?:https?:)?\/\/[a-z0-9.-]+\.(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com)[^\t\n\f\r "'<>)\\]*/gi;

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let candidate = trimmed;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function validToken(token: string | undefined | null): token is string {
  return (
    token !== undefined &&
    token !== null &&
    TOKEN_PATTERN.test(token) &&
    !RESERVED_TOKENS.has(token.toLowerCase())
  );
}

function withJobId(match: PlatformMatch, jobId: string | undefined): PlatformMatch {
  return jobId === undefined ? match : { ...match, jobId };
}

/** Detects the platform from a URL alone. */
export function detectFromUrl(raw: string): PlatformMatch | null {
  const url = parseUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split("/").filter((part) => part !== "");
  const query = url.searchParams;

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    if (path[0] === "embed") {
      const token = query.get("for");
      if (!validToken(token)) return null;
      const jobId = path[1] === "job_app" ? (query.get("token") ?? undefined) : undefined;
      return withJobId(
        { platform: "greenhouse", token },
        jobId && DIGITS_PATTERN.test(jobId) ? jobId : undefined,
      );
    }
    const token = path[0];
    if (!validToken(token)) return null;
    const pathJob =
      path[1] === "jobs" && path[2] && DIGITS_PATTERN.test(path[2]) ? path[2] : undefined;
    const ghJid = query.get("gh_jid");
    const queryJob = ghJid && DIGITS_PATTERN.test(ghJid) ? ghJid : undefined;
    return withJobId({ platform: "greenhouse", token }, pathJob ?? queryJob);
  }

  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const token = path[0];
    if (!validToken(token)) return null;
    const base: PlatformMatch =
      host === "jobs.eu.lever.co"
        ? { platform: "lever", token, variant: "eu" }
        : { platform: "lever", token };
    return withJobId(base, path[1] && UUID_PATTERN.test(path[1]) ? path[1] : undefined);
  }

  if (host === "jobs.ashbyhq.com") {
    const token = path[0];
    if (!validToken(token)) return null;
    return withJobId(
      { platform: "ashby", token },
      path[1] && UUID_PATTERN.test(path[1]) ? path[1] : undefined,
    );
  }

  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    if (path[0] === "oneclick-ui" && path[1] === "company") {
      return validToken(path[2]) ? { platform: "smartrecruiters", token: path[2] } : null;
    }
    const token = path[0];
    if (!validToken(token)) return null;
    const id = path[1] ? SMARTRECRUITERS_ID_PATTERN.exec(path[1])?.[1] : undefined;
    return withJobId({ platform: "smartrecruiters", token }, id);
  }

  if (host === "apply.workable.com") {
    if (path[0] === "j") {
      const code = path[1];
      return code && WORKABLE_SHORTCODE_PATTERN.test(code)
        ? { platform: "workable", token: null, jobId: code }
        : null;
    }
    const token = path[0];
    if (!validToken(token)) return null;
    const code = path[1] === "j" ? path[2] : undefined;
    return withJobId(
      { platform: "workable", token },
      code && WORKABLE_SHORTCODE_PATTERN.test(code) ? code : undefined,
    );
  }

  if (host.endsWith(".workable.com")) {
    const sub = host.slice(0, -".workable.com".length);
    if (!sub.includes(".") && !WORKABLE_RESERVED_SUBDOMAINS.has(sub) && validToken(sub)) {
      return { platform: "workable", token: sub };
    }
    return null;
  }

  // Embedded boards on a company's own careers page.
  const ghJid = query.get("gh_jid");
  if (ghJid && DIGITS_PATTERN.test(ghJid)) {
    return { platform: "greenhouse", token: null, jobId: ghJid };
  }
  const ashbyJid = query.get("ashby_jid");
  if (ashbyJid && UUID_PATTERN.test(ashbyJid)) {
    return { platform: "ashby", token: null, jobId: ashbyJid };
  }
  return null;
}

/** Finds the first ATS link with a company token in careers-page HTML. */
export function detectFromHtml(html: string): PlatformMatch | null {
  for (const match of html.matchAll(HTML_LINK_PATTERN)) {
    const link = match[0].split("&amp;").join("&");
    const found = detectFromUrl(link);
    if (found?.token) return found;
  }
  return null;
}

/**
 * URL first; when the URL alone has no token, look for an embedded board in the
 * page HTML and keep the job ID found in the URL.
 */
export function detectPlatform(url: string, html?: string): PlatformMatch | null {
  const fromUrl = detectFromUrl(url);
  if (fromUrl?.token) return fromUrl;
  if (html !== undefined) {
    const fromHtml = detectFromHtml(html);
    if (fromHtml && (!fromUrl || fromUrl.platform === fromHtml.platform)) {
      return withJobId(fromHtml, fromUrl?.jobId ?? fromHtml.jobId);
    }
  }
  return fromUrl;
}
