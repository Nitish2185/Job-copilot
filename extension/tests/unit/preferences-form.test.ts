import { describe, expect, it } from "vitest";
import { defaultPreferences } from "@/lib/profile/store";
import {
  currencyForCountry,
  formToPreferences,
  preferencesToForm,
} from "@/lib/profile/preferencesForm";

describe("preferences form", () => {
  it("parses Indian CTC inputs and shows them back as LPA", () => {
    const values = preferencesToForm(defaultPreferences("IN"));
    values.currentCtc = "12.5 lakh";
    values.expectedCtcMin = "18 LPA";
    values.expectedCtcMax = "2400000";
    values.noticePeriodDays = "60";
    values.desiredRoles = "Backend Developer (Go), Full Stack Developer";
    values.countries = "in, us";
    values.workAuthorization = [{ countryCode: "in", status: "citizen", note: "" }];
    values.eeo.gender = "Prefer not to say";
    const result = formToPreferences(values, "INR");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preferences;
    expect(p.currentCtc).toEqual({ amount: 1_250_000, currency: "INR", period: "year" });
    expect(p.expectedCtc).toEqual({
      min: 1_800_000,
      max: 2_400_000,
      currency: "INR",
      period: "year",
    });
    expect(p.desiredRoles).toEqual(["Backend Developer (Go)", "Full Stack Developer"]);
    expect(p.countries).toEqual(["IN", "US"]);
    expect(p.workAuthorization).toEqual([{ countryCode: "IN", status: "citizen" }]);
    expect(p.eeo).toEqual({ gender: "Prefer not to say" });
    expect(p.noticePeriodDays).toBe(60);

    const back = preferencesToForm(p);
    expect(back.currentCtc).toBe("12.5 LPA");
    expect(back.expectedCtcMax).toBe("24 LPA");
  });

  it("explains bad amounts and ranges in plain words", () => {
    const values = { ...preferencesToForm(defaultPreferences("IN")), currentCtc: "negotiable" };
    const result = formToPreferences(values, "INR");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]).toContain('"12 LPA"');

    const range = {
      ...preferencesToForm(defaultPreferences("IN")),
      expectedCtcMin: "20 LPA",
      expectedCtcMax: "15 LPA",
    };
    const r2 = formToPreferences(range, "INR");
    expect(r2.ok).toBe(false);
    if (!r2.ok)
      expect(r2.issues).toContain("Expected CTC: the maximum must not be below the minimum");
  });

  it("leaves voluntary diversity answers empty by default (decline)", () => {
    const result = formToPreferences(preferencesToForm(defaultPreferences("US")), "USD");
    expect(result.ok && result.preferences.eeo).toBeUndefined();
  });
});

describe("currencyForCountry", () => {
  it("defaults CTC fields to the user's currency", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("de")).toBe("EUR");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("")).toBe("INR");
  });
});

describe("CTC currency choice", () => {
  it("reads amounts in the chosen currency, whatever the country default is", () => {
    const values = { ...preferencesToForm(defaultPreferences("US")), ctcCurrency: "INR" };
    const result = formToPreferences(
      { ...values, currentCtc: "12 LPA", expectedCtcMin: "18 lakh" },
      "USD",
    );
    expect(result.ok && result.preferences.currentCtc).toMatchObject({
      amount: 1_200_000,
      currency: "INR",
    });
    expect(result.ok && result.preferences.expectedCtc).toMatchObject({
      min: 1_800_000,
      currency: "INR",
    });
  });

  it("remembers the saved currency when the form opens again", () => {
    const prefs = {
      ...defaultPreferences("IN"),
      currentCtc: { amount: 1_200_000, currency: "INR", period: "year" as const },
    };
    expect(preferencesToForm(prefs).ctcCurrency).toBe("INR");
    expect(preferencesToForm(defaultPreferences("IN")).ctcCurrency).toBe("");
  });
});
