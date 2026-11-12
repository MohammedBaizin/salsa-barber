/** Money is stored as integer pence (GBP). Mirrors app.pounds() in SQL. */

export const MAX_PRICE_PENCE = 100_000;

/** 1700 -> "£17", 1750 -> "£17.50", 5 -> "£0.05". */
export function formatPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = pounds.toLocaleString("en-GB");
  return rest === 0 ? `${sign}£${whole}` : `${sign}£${whole}.${String(rest).padStart(2, "0")}`;
}

/**
 * Parses what someone types in a price box ("17", "£17.50", "17.5") into pence.
 * Returns null for anything else (negative, more than 2 decimals, above £1,000).
 */
export function parsePounds(input: string): number | null {
  const cleaned = input.trim().replace(/^£\s*/, "").replace(/,/g, "");
  const m = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const pence = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return pence <= MAX_PRICE_PENCE ? pence : null;
}

/** Pence as a plain pounds string for form fields: 1750 -> "17.50", 1700 -> "17". */
export function penceToInput(pence: number): string {
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}
