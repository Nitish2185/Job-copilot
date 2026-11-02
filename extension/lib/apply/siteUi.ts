/**
 * Job Copilot UI on job sites (spec 13.7, 16.6): the logged-out banner and the
 * search-result badges. Both live in Shadow DOM so the site's CSS cannot
 * change them and ours cannot change the site.
 */

export const BANNER_TAG = "job-copilot-banner";
export const BADGE_TAG = "job-copilot-badge";

const FONT = "font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif";

/** Shows (or replaces) a dismissible banner at the top of the page. */
export function showBanner(doc: Document, text: string): HTMLElement {
  doc.querySelector(BANNER_TAG)?.remove();
  const host = doc.createElement(BANNER_TAG);
  host.setAttribute("data-text", text);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;
        display:flex;gap:12px;align-items:center;max-width:min(560px,calc(100vw - 32px));
        padding:10px 14px;border-radius:8px;background:#fef3c7;color:#78350f;
        box-shadow:0 4px 16px rgb(0 0 0/.18);${FONT}}
      button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;
        padding:2px 6px;border-radius:4px}
      button:focus-visible{outline:2px solid #78350f}
    </style>
    <div class="bar" role="status">
      <span><b>Job Copilot:</b> <span class="text"></span></span>
      <button type="button" aria-label="Dismiss">✕</button>
    </div>`;
  const span = root.querySelector(".text");
  if (span) span.textContent = text;
  root.querySelector("button")?.addEventListener("click", () => {
    host.remove();
  });
  doc.documentElement.append(host);
  return host;
}

export interface BadgeScore {
  final?: number;
  isEstimate?: boolean;
  excluded?: string;
  matched?: string[];
  jobId?: string;
}

/** Green for strong matches, amber for possible ones, grey otherwise or when filtered out. */
export function badgeColor(score: BadgeScore): { bg: string; fg: string } {
  if (score.final === undefined || score.excluded) return { bg: "#e2e8f0", fg: "#334155" };
  if (score.final >= 70) return { bg: "#dcfce7", fg: "#166534" };
  if (score.final >= 45) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e2e8f0", fg: "#334155" };
}

export function badgeLabel(score: BadgeScore): string {
  if (score.final === undefined) return "Add skills to your profile to see scores";
  const value = `${String(score.final)}${score.isEstimate ? "~" : ""}`;
  return score.excluded ? `${value} · ${score.excluded}` : value;
}

/**
 * Adds a badge after `anchor`: score, top matched skills and a Save button. The
 * button is ours (it never touches the site's controls).
 */
export function renderBadge(
  anchor: HTMLElement,
  score: BadgeScore,
  onSave: () => Promise<boolean>,
): HTMLElement {
  const host = anchor.ownerDocument.createElement(BADGE_TAG);
  const root = host.attachShadow({ mode: "open" });
  const { bg, fg } = badgeColor(score);
  root.innerHTML = `
    <style>
      :host{display:inline-block;margin:4px 0}
      .pill{display:inline-flex;gap:6px;align-items:center;padding:2px 4px 2px 8px;
        border-radius:999px;background:${bg};color:${fg};${FONT}}
      .score{font-weight:600}
      .skills{opacity:.85;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      button{border:1px solid currentColor;background:#fff;color:inherit;font:inherit;
        border-radius:999px;padding:0 8px;cursor:pointer}
      button:disabled{cursor:default;opacity:.7}
      button:focus-visible{outline:2px solid ${fg};outline-offset:1px}
    </style>
    <span class="pill">
      <span class="score"></span>
      <span class="skills"></span>
      <button type="button">Save</button>
    </span>`;
  const label = badgeLabel(score);
  const scoreEl = root.querySelector(".score");
  if (scoreEl) scoreEl.textContent = `Match ${label}`;
  const skills = root.querySelector(".skills");
  const matched = (score.matched ?? []).slice(0, 3);
  if (skills) {
    if (matched.length > 0) skills.textContent = matched.join(", ");
    else skills.remove();
  }
  const pill = root.querySelector(".pill");
  pill?.setAttribute(
    "title",
    score.isEstimate
      ? "Quick estimate from the title on this page. Save the job for a full score."
      : "Job Copilot score",
  );
  const button = root.querySelector("button");
  if (score.jobId && button) {
    button.textContent = "Saved";
    button.disabled = true;
  }
  button?.addEventListener("click", (event) => {
    // Our button sits inside the site's card link: keep the click from opening the job.
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    button.textContent = "Saving…";
    void onSave().then(
      (ok) => {
        button.textContent = ok ? "Saved" : "Try again";
        button.disabled = ok;
      },
      () => {
        button.textContent = "Try again";
        button.disabled = false;
      },
    );
  });
  host.dataset.score = label;
  anchor.after(host);
  return host;
}
