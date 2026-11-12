/**
 * UK mobile numbers only (the shop replies by WhatsApp/SMS). Spec §6.4.
 * Accepts any typed form (07…, 7… without the zero, +44…, 0044…, 4407…, spaces/dashes/brackets),
 * normalises to E.164 (+447xxxxxxxxx). Refuses landlines, other countries, 070 personal numbers and
 * 076 pagers (07624 Isle of Man mobiles are allowed). The SQL check on clients.phone (+447 and 9 digits)
 * is the looser backstop.
 */

export const PHONE_ERROR = "Please enter a UK mobile number, e.g. 07123 456789";

/** Returns +447xxxxxxxxx, or null if it isn't a UK mobile. */
export function normaliseUkMobile(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/[^\d]/g, "");
  const hadPlus = trimmed.startsWith("+");

  if (hadPlus) {
    if (!digits.startsWith("44")) return null;
    digits = digits.slice(2);
  } else if (digits.startsWith("0044")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("44") && (digits.length === 12 || (digits.length === 13 && digits[2] === "0"))) {
    digits = digits.slice(2);
  }
  // National number with or without its leading zero (also handles +44 07…).
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (!/^7\d{9}$/.test(digits)) return null;
  if (digits.startsWith("70")) return null; // personal numbering, not a mobile
  if (digits.startsWith("76") && !digits.startsWith("7624")) return null; // pagers
  return `+44${digits}`;
}

/** +447123456789 -> "07123 456789". Other values are returned unchanged. */
export function formatUkMobile(e164: string): string {
  const m = /^\+44(7\d{3})(\d{6})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]}` : e164;
}

/** Digits for wa.me links: +447123456789 -> "447123456789". */
export function waDigits(e164: string): string {
  return e164.replace(/[^\d]/g, "");
}
