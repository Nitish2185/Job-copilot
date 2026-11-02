/**
 * Salary / CTC input in Indian and international formats (spec 10, step 6):
 * "12 LPA", "12.5 lakh", "1200000", "12,00,000", "1.2 Cr", "₹ 15 LPA", "$120k",
 * "50,000 per month".
 */

export interface Ctc {
  amount: number;
  currency: string;
  period: "year" | "month";
}

const LAKH = 100_000;
const CRORE = 10_000_000;

const CURRENCY_WORDS: [RegExp, string][] = [
  [/₹|\binr\b|\brs\.?|\brupees?\b/i, "INR"],
  [/\$|\busd\b/i, "USD"],
  [/€|\beur\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\bsgd\b|\bs\$/i, "SGD"],
  [/\baed\b/i, "AED"],
  [/\bcad\b/i, "CAD"],
  [/\baud\b/i, "AUD"],
];

/**
 * Parses a CTC or salary. Bare numbers under 1,000 in INR are read as lakhs
 * ("12" -> 12 LPA), which is how Indian forms ask for CTC. Returns null when no
 * amount is found.
 */
export function parseCtc(input: string, defaultCurrency = "INR"): Ctc | null {
  const text = input.trim().toLowerCase();
  if (text === "") return null;

  let currency: string | undefined;
  for (const [pattern, code] of CURRENCY_WORDS) {
    if (pattern.test(input)) {
      currency = code;
      break;
    }
  }

  const number = /(\d[\d,]*(?:\.\d+)?)/.exec(text);
  if (!number?.[1]) return null;
  let amount = Number(number[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const after = text.slice(number.index + number[1].length);

  const period: Ctc["period"] = /\b(per\s+month|\/\s*m(?:onth|o)?\b|monthly|pm\b|p\.m\.)/.test(text)
    ? "month"
    : "year";

  const lakh = /^\s*(?:l|lpa|lakh|lakhs|lac|lacs)\b/.test(after);
  const crore = /^\s*(?:cr|crore|crores)\b/.test(after);
  // Lakh and crore are Indian units, so they mean rupees unless a currency is written.
  currency ??= lakh || crore ? "INR" : defaultCurrency;

  if (crore) amount *= CRORE;
  else if (lakh) amount *= LAKH;
  else if (/^\s*k\b/.test(after)) amount *= 1_000;
  else if (/^\s*(?:m|mn|million)\b/.test(after)) amount *= 1_000_000;
  else if (currency === "INR" && period === "year" && amount < 1_000) amount *= LAKH;

  return { amount: Math.round(amount), currency, period };
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** Displays a CTC the way users write it: "12 LPA", "1.5 Cr", "₹50,000/month", "USD 120,000/year". */
export function formatCtc(ctc: Ctc): string {
  if (ctc.currency === "INR" && ctc.period === "year") {
    return ctc.amount >= CRORE
      ? `${trimNumber(ctc.amount / CRORE)} Cr`
      : `${trimNumber(ctc.amount / LAKH)} LPA`;
  }
  if (ctc.currency === "INR") return `₹${ctc.amount.toLocaleString("en-IN")}/month`;
  return `${ctc.currency} ${ctc.amount.toLocaleString("en-US")}/${ctc.period}`;
}
