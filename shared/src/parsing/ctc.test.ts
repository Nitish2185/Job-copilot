import { describe, expect, it } from "vitest";
import { formatCtc, parseCtc } from "./ctc";

describe("parseCtc", () => {
  it.each([
    ["12 LPA", 1_200_000, "INR", "year"],
    ["12LPA", 1_200_000, "INR", "year"],
    ["12.5 lakh", 1_250_000, "INR", "year"],
    ["12.5 lakhs per annum", 1_250_000, "INR", "year"],
    ["12.5L", 1_250_000, "INR", "year"],
    ["8 lacs", 800_000, "INR", "year"],
    ["1200000", 1_200_000, "INR", "year"],
    ["12,00,000", 1_200_000, "INR", "year"],
    ["₹ 15 LPA", 1_500_000, "INR", "year"],
    ["INR 18 lakh", 1_800_000, "INR", "year"],
    ["Rs. 9.6 LPA", 960_000, "INR", "year"],
    ["1.2 Cr", 12_000_000, "INR", "year"],
    ["2 crore", 20_000_000, "INR", "year"],
    ["12", 1_200_000, "INR", "year"],
    ["50,000 per month", 50_000, "INR", "month"],
    ["₹75000/month", 75_000, "INR", "month"],
    ["$120k", 120_000, "USD", "year"],
    ["120,000 USD", 120_000, "USD", "year"],
    ["€65,000", 65_000, "EUR", "year"],
    ["GBP 80k", 80_000, "GBP", "year"],
  ])("%s", (input, amount, currency, period) => {
    expect(parseCtc(input)).toEqual({ amount, currency, period });
  });

  it("uses the default currency when none is written", () => {
    expect(parseCtc("150000", "USD")).toEqual({ amount: 150_000, currency: "USD", period: "year" });
  });

  it("reads lakh and crore as rupees even when the default currency is not INR", () => {
    expect(parseCtc("12 LPA", "USD")).toEqual({
      amount: 1_200_000,
      currency: "INR",
      period: "year",
    });
    expect(parseCtc("1.5 Cr", "EUR")).toEqual({
      amount: 15_000_000,
      currency: "INR",
      period: "year",
    });
  });

  it("returns null without a number", () => {
    expect(parseCtc("")).toBeNull();
    expect(parseCtc("negotiable")).toBeNull();
  });
});

describe("formatCtc", () => {
  it.each([
    [{ amount: 1_200_000, currency: "INR", period: "year" as const }, "12 LPA"],
    [{ amount: 1_250_000, currency: "INR", period: "year" as const }, "12.5 LPA"],
    [{ amount: 15_000_000, currency: "INR", period: "year" as const }, "1.5 Cr"],
    [{ amount: 50_000, currency: "INR", period: "month" as const }, "₹50,000/month"],
    [{ amount: 120_000, currency: "USD", period: "year" as const }, "USD 120,000/year"],
  ])("%j -> %s", (ctc, text) => {
    expect(formatCtc(ctc)).toBe(text);
  });

  it("round-trips the Indian formats", () => {
    for (const input of ["12 LPA", "12.5 lakh", "1200000", "1.2 Cr"]) {
      const parsed = parseCtc(input);
      expect(parsed).not.toBeNull();
      if (parsed) expect(parseCtc(formatCtc(parsed))).toEqual(parsed);
    }
  });
});
