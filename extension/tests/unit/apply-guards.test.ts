// @vitest-environment jsdom
import { AUTO_SUBMIT_HOSTS } from "@job-copilot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenClickError,
  SubmitHostError,
  assertAutoSubmitHost,
  autoSubmitHosts,
  isAllowedAssistClick,
  isNavigationOrSubmitControl,
  safeClick,
  submitApplication,
} from "@/lib/apply/guards";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Renders HTML and returns the element marked data-target (or the first child). */
function el(html: string): HTMLElement {
  document.body.innerHTML = html;
  const target =
    document.querySelector<HTMLElement>("[data-target]") ?? document.body.firstElementChild;
  if (!(target instanceof HTMLElement)) throw new Error("no element");
  return target;
}

describe("isNavigationOrSubmitControl", () => {
  it.each([
    ["Submit", '<button type="button">Submit</button>'],
    ["Submit application", '<button type="button">Submit application</button>'],
    ["Apply", '<button type="button">Apply</button>'],
    ["Apply now", '<button type="button" class="btn">Apply now</button>'],
    ["Easy Apply", '<button type="button"><span>Easy Apply</span></button>'],
    ["Continue", '<button type="button">Continue</button>'],
    ["Continue to next step", '<button type="button">Continue to next step</button>'],
    ["Next", '<button type="button">Next</button>'],
    ["Next arrow", '<button type="button">→</button>'],
    ["Review", '<button type="button">Review</button>'],
    ["Review your application", '<button type="button">Review your application</button>'],
    ["Save and continue", '<button type="button">Save and Continue</button>'],
    ["Save & continue", '<button type="button">Save &amp; Continue</button>'],
    ["Save", '<button type="button">Save</button>'],
    ["Done", '<button type="button">Done</button>'],
    ["Finish", '<button type="button">Finish</button>'],
    ["Send", '<button type="button">Send</button>'],
    [
      "Send icon with label",
      '<button type="button" aria-label="Send message"><svg></svg></button>',
    ],
    ["Icon button with alt text", '<button type="button"><img alt="Submit"></button>'],
    ["Proceed", '<button type="button">Proceed</button>'],
    ["Confirm", '<button type="button">Confirm</button>'],
    ["Sign in", '<button type="button">Sign in</button>'],
    ["Log in", '<button type="button">Log In</button>'],
    ["Register", '<button type="button">Register</button>'],
    ["Back", '<button type="button">Back</button>'],
    ["Cancel", '<button type="button">Cancel</button>'],
    ["Withdraw", '<button type="button">Withdraw application</button>'],
    ["Delete", '<button type="button">Delete</button>'],
    ["Remove", '<button type="button">Remove</button>'],
    ["I agree", '<button type="button">I agree</button>'],
    ["Accept all", '<button type="button">Accept all</button>'],
    ["Upload and continue", '<button type="button">Upload and continue</button>'],
    ["Skip", '<button type="button">Skip this step</button>'],
    ["Start application", '<button type="button">Start application</button>'],
    ["Search", '<button type="button">Search jobs</button>'],
    ["Role button Next", '<div role="button" tabindex="0">Next</div>'],
    ["Role link", '<span role="link">Terms</span>'],
    ["Link", '<a href="/jobs/2">Another job</a>'],
    ["Link with hash", '<a href="#">Show details</a>'],
    ["Link without href", "<a>Open</a>"],
    ["Span inside a link", '<a href="/next"><span data-target>Go</span></a>'],
    ["Default button in a form", "<form><button data-target>Add photo</button></form>"],
    [
      "Submit button in a form",
      '<form><button type="submit" data-target>Add another</button></form>',
    ],
    ["Button for another form", '<form id="f"></form><button form="f" data-target>Ok</button>'],
    ["Input submit", '<form><input type="submit" value="Go" data-target></form>'],
    ["Input submit outside form", '<input type="submit" value="Apply">'],
    ["Input image", '<input type="image" alt="Submit">'],
    ["Reset", '<form><input type="reset" value="Clear" data-target></form>'],
    ["Formaction", '<button type="button" formaction="/apply">Ok</button>'],
    ["Chat chip", '<div class="chatbot_Drawer"><div class="chip" data-target>Yes</div></div>'],
    ["Chat send", '<div id="chatList"><div role="button" data-target>➤</div></div>'],
    ["Chat log option", '<div role="log"><button type="button" data-target>15 days</button></div>'],
    ["Text inside a Next button", '<button type="button"><span data-target>Next</span></button>'],
  ])("%s is forbidden", (_name, html) => {
    expect(isNavigationOrSubmitControl(el(html))).toBe(true);
  });

  it.each([
    ["Checkbox", '<input type="checkbox" name="remote">'],
    ["Radio", '<input type="radio" name="relocate" value="yes">'],
    [
      "Label for a checkbox",
      '<label for="c" data-target>I agree to receive updates</label><input id="c" type="checkbox">',
    ],
    ["Wrapping label", '<label data-target><input type="radio" name="x"> Next week</label>'],
    ["Listbox option", '<ul role="listbox"><li role="option" data-target>Continue later</li></ul>'],
    ["Combobox opener", '<div role="combobox" aria-expanded="false" tabindex="0">Select...</div>'],
    ["Add another", '<button type="button">Add another</button>'],
    ["Plain button outside forms", '<button type="button">Show more</button>'],
  ])("%s is not a submit or navigation control", (_name, html) => {
    expect(isNavigationOrSubmitControl(el(html))).toBe(false);
  });
});

describe("isAllowedAssistClick", () => {
  it.each([
    ['<input type="checkbox">'],
    ['<input type="radio" name="a">'],
    ['<label data-target><input type="checkbox"> Remote</label>'],
    ['<div role="option">India</div>'],
    ['<div role="combobox" tabindex="0">Country</div>'],
    ['<button type="button" aria-haspopup="listbox">Choose</button>'],
    ['<button type="button">Add another</button>'],
    ['<button type="button">+ Add</button>'],
    ['<button type="button">Add work experience</button>'],
    ['<button type="button">Add Education</button>'],
    ['<button type="button">Add more</button>'],
  ])("%s is allowed", (html) => {
    expect(isAllowedAssistClick(el(html))).toBe(true);
  });

  it.each([
    ['<button type="button">Show more</button>'],
    ['<div tabindex="0">Some text</div>'],
    ['<button type="button">Add to favourites</button>'],
    ['<button type="button">Add and continue</button>'],
    ['<button type="button">Upload resume</button>'],
  ])("%s is not allowed on Assist sites", (html) => {
    expect(isAllowedAssistClick(el(html))).toBe(false);
  });
});

describe("safeClick", () => {
  it("clicks allowed form widgets", () => {
    const box = el('<input type="checkbox">');
    safeClick(box, "assist");
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it("refuses submit and navigation controls in both modes, without clicking", () => {
    for (const mode of ["assist", "auto"] as const) {
      const button = el('<form><button type="submit" data-target>Submit</button></form>');
      const clicked = vi.fn();
      button.addEventListener("click", clicked);
      expect(() => {
        safeClick(button, mode);
      }).toThrow(ForbiddenClickError);
      expect(clicked).not.toHaveBeenCalled();
    }
  });

  it("refuses ordinary buttons on Assist sites and hidden or disabled controls", () => {
    expect(() => {
      safeClick(el('<button type="button">Show more</button>'), "assist");
    }).toThrow("Assist mode only clicks form controls");
    expect(() => {
      safeClick(el('<input type="checkbox" disabled>'), "assist");
    }).toThrow("Hidden or disabled");
    expect(() => {
      safeClick(
        el('<div style="display:none"><input type="checkbox" data-target></div>'),
        "assist",
      );
    }).toThrow("Hidden or disabled");
  });
});

describe("submit guard (spec 2.2)", () => {
  it("allows only exact allowlisted hosts", () => {
    for (const host of AUTO_SUBMIT_HOSTS) {
      expect(() => {
        assertAutoSubmitHost(host);
      }).not.toThrow();
    }
    for (const host of [
      "jobs.lever.co.evil.com",
      "evil.com",
      "www.naukri.com",
      "in.indeed.com",
      "www.linkedin.com",
      "JOBS.LEVER.CO.",
      "lever.co",
      "127.0.0.1",
      "",
    ]) {
      expect(() => {
        assertAutoSubmitHost(host);
      }).toThrow(SubmitHostError);
    }
  });

  it("checks the host right before clicking", () => {
    const button = el('<button type="button">Submit application</button>');
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    expect(() => {
      submitApplication(button, { hostname: "www.naukri.com" });
    }).toThrow(SubmitHostError);
    expect(clicked).not.toHaveBeenCalled();
    submitApplication(button, { hostname: "jobs.lever.co" });
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("does not add the local test host outside E2E builds", () => {
    expect(autoSubmitHosts()).toEqual(AUTO_SUBMIT_HOSTS);
  });
});
