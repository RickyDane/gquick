export interface LocaleInfo {
  locale: string;
  decimalSeparator: string;
  thousandsSeparator: string;
}

let cached: LocaleInfo | null = null;

/**
 * Detect system locale and its number separators via Intl.NumberFormat.
 * Result is cached for the app lifetime since locale doesn't change mid-session.
 */
export function getLocaleInfo(): LocaleInfo {
  if (cached) return cached;

  const locale = navigator.language || navigator.languages?.[0] || "en-US";
  const parts = new Intl.NumberFormat([locale, "en-US"]).formatToParts(1234.5);

  let decimalSeparator = ".";
  let thousandsSeparator = ",";

  for (const part of parts) {
    if (part.type === "decimal") decimalSeparator = part.value;
    if (part.type === "group") thousandsSeparator = part.value;
  }

  cached = { locale, decimalSeparator, thousandsSeparator };
  return cached;
}

/**
 * Parse a locale-formatted number string (e.g. "2.500,30" in German) into a JS number.
 * Returns null if the string is not a valid number.
 */
export function parseLocaleNumber(str: string): number | null {
  const { decimalSeparator, thousandsSeparator } = getLocaleInfo();

  // Strip thousands separators, then normalize decimal to '.'
  let normalized = str.split(thousandsSeparator).join("");
  if (decimalSeparator !== ".") {
    normalized = normalized.split(decimalSeparator).join(".");
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Format a number for display using the system locale (e.g. "2.500,30" in German).
 */
export function formatLocaleNumber(num: number): string {
  const { locale } = getLocaleInfo();
  return new Intl.NumberFormat([locale, "en-US"]).format(num);
}
