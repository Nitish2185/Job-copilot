import { describe, expect, it } from "vitest";
import {
  countryOption,
  declineOption,
  e164,
  parseRange,
  rangeOption,
  splitPhone,
  textOption,
  yesNoOption,
} from "@/lib/apply/fields/options";

describe("yes/no synonyms", () => {
  it.each([
    [["Yes", "No"], true, "Yes"],
    [["Yes", "No"], false, "No"],
    [["Y", "N"], true, "Y"],
    [["True", "False"], false, "False"],
    [["I do", "I don't"], false, "I don't"],
    [["I am authorized", "I am not authorized"], true, "I am authorized"],
    [["I am authorized", "I am not authorized"], false, "I am not authorized"],
    [["Yes, I will require sponsorship", "No, I will not"], false, "No, I will not"],
  ])("%j %s -> %s", (options, value, expected) => {
    expect(yesNoOption(options, value)).toBe(expected);
  });
});

describe("decline option", () => {
  it.each([
    [["Male", "Female", "Decline to self-identify"], "Decline to self-identify"],
    [["Yes", "No", "I don't wish to answer"], "I don't wish to answer"],
    [["Man", "Woman", "Prefer not to say"], "Prefer not to say"],
    [["White", "Asian", "I choose not to disclose"], "I choose not to disclose"],
    [["Yes", "No"], undefined],
  ])("%j -> %s", (options, expected) => {
    expect(declineOption(options)).toBe(expected);
  });
});

describe("notice period buckets", () => {
  const options = [
    "Immediate",
    "15 days or less",
    "1 month",
    "2 months",
    "3 months",
    "More than 3 months",
  ];
  it.each([
    [0, "Immediate"],
    [10, "15 days or less"],
    [30, "1 month"],
    [45, "2 months"],
    [60, "2 months"],
    [90, "3 months"],
    [120, "More than 3 months"],
  ])("%d days -> %s", (days, expected) => {
    expect(rangeOption(options, days, "days")).toBe(expected);
  });

  it("reads day ranges", () => {
    expect(rangeOption(["0-15 days", "16-30 days", "31-60 days", "60+ days"], 30, "days")).toBe(
      "16-30 days",
    );
    expect(rangeOption(["30 days", "60 days", "90 days"], 60, "days")).toBe("60 days");
  });
});

describe("year buckets", () => {
  const options = ["Less than 1 year", "0-1", "1-3", "3-5", "5+"];
  it.each([
    [0.5, "Less than 1 year"],
    [2, "1-3"],
    [3, "3-5"],
    [4.4, "3-5"],
    [5, "5+"],
    [12, "5+"],
  ])("%d years -> %s", (years, expected) => {
    expect(rangeOption(options, years, "years")).toBe(expected);
  });

  it("knows freshers and year words", () => {
    expect(rangeOption(["Fresher", "1-2 years", "2-5 years"], 0, "years")).toBe("Fresher");
    expect(rangeOption(["0-2 yrs", "2-5 yrs", "5-10 yrs", "10+ yrs"], 7, "years")).toBe("5-10 yrs");
  });
});

describe("CTC ranges in lakhs", () => {
  it.each([
    [["0-5 LPA", "5-10 LPA", "10-15 LPA", "15+ LPA"], 12.5, "10-15 LPA"],
    [["Below 5 Lakhs", "5-10 Lakhs", "10-15 Lakhs", "Above 15 Lakhs"], 18, "Above 15 Lakhs"],
    [["< 3 LPA", "3 to 6 LPA", "6 to 10 LPA"], 2, "< 3 LPA"],
    [["1-1.5 Cr", "50-100 LPA"], 120, "1-1.5 Cr"],
  ])("%j %d lakhs -> %s", (options, lakhs, expected) => {
    expect(rangeOption(options, lakhs, "lakhs")).toBe(expected);
  });

  it("parses single values and rupee amounts", () => {
    expect(parseRange("10,00,000", "lakhs")).toEqual({ min: 10, max: 10 });
    expect(parseRange("12 LPA", "lakhs")).toEqual({ min: 12, max: 12 });
  });
});

describe("text and country options", () => {
  it("matches text exactly or by clear containment", () => {
    expect(textOption(["Bachelor's Degree", "Master's Degree"], "Master's Degree")).toBe(
      "Master's Degree",
    );
    expect(textOption(["LinkedIn", "Company website", "Referral"], "company website")).toBe(
      "Company website",
    );
    expect(textOption(["B.Tech / B.E.", "M.Tech"], "B.Tech")).toBe("B.Tech / B.E.");
    expect(textOption(["Option A", "Option B"], "Option")).toBeUndefined();
  });

  it("matches countries by code or name", () => {
    expect(countryOption(["United States", "India", "Germany"], "IN")).toBe("India");
    expect(countryOption(["US", "IN", "DE"], "IN")).toBe("IN");
    expect(countryOption(["United Kingdom", "Ireland"], "GB")).toBe("United Kingdom");
  });
});

describe("phone numbers", () => {
  it("splits the country code and formats E.164", () => {
    expect(splitPhone("+91 99999 01234")).toEqual({ countryCode: "+91", national: "9999901234" });
    expect(splitPhone("(555) 010-2030")).toEqual({ national: "5550102030" });
    expect(e164("+91 99999 01234")).toBe("+919999901234");
  });
});
