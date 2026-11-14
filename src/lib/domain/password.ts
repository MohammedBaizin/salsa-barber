/**
 * Password rules for changing your own password (spec §9, NCSC style). Shown as a live checklist in the form;
 * the server runs the same check and has the final say.
 *
 * - 10+ characters with upper and lower case letters and a number or symbol, OR any passphrase of 16+ characters;
 * - never containing your username, your name or the shop's name;
 * - not a common password (or a common password with a few numbers/symbols added).
 * At most 72 characters (Supabase Auth's limit).
 */

export const PASSWORD_MAX = 72;
const SHOP_WORDS = ["salsa", "barber", "maghull"];

/** Commonly used passwords and their bases (compared case-insensitively, ignoring numbers/symbols at the end). */
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "letmein", "welcome", "iloveyou", "football", "monkey", "dragon",
  "sunshine", "princess", "abc123", "123456", "1234567", "12345678", "123456789", "1234567890", "111111", "000000",
  "admin", "administrator", "login", "master", "shadow", "baseball", "superman", "trustno1", "hello", "freedom",
  "whatever", "starwars", "liverpool", "everton", "chelsea", "arsenal", "manchester", "changeme", "secret", "summer",
  "winter", "spring", "autumn", "london", "england", "haircut", "barbershop", "qazwsx", "asdfgh", "zxcvbn",
]);

export type PasswordCheckId = "length" | "mix" | "personal" | "common";
export type PasswordCheck = { id: PasswordCheckId; label: string; ok: boolean };

export function checkPassword(password: string, person: { username: string; name: string }): { ok: boolean; checks: PasswordCheck[] } {
  const passphrase = password.length >= 16;
  const lower = password.toLowerCase();
  const mix = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z]/.test(password);
  const personalWords = [person.username, ...person.name.split(/[\s'-]+/), ...SHOP_WORDS]
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3);
  const personal = password.length > 0 && !personalWords.some((w) => lower.includes(w));
  const base = lower.replace(/[^a-z]+$/, "").replace(/^[^a-z]+/, "");
  const common = password.length > 0 && !COMMON.has(lower) && !COMMON.has(base) && !/password|qwerty|123456/.test(lower);

  const checks: PasswordCheck[] = [
    { id: "length", label: "At least 10 characters (or 16+ for a passphrase)", ok: password.length >= 10 && password.length <= PASSWORD_MAX },
    { id: "mix", label: "Upper and lower case letters and a number or symbol (not needed for 16+)", ok: passphrase || mix },
    { id: "personal", label: "Doesn't contain your username, your name or the shop's name", ok: personal },
    { id: "common", label: "Not a common password", ok: common },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}
