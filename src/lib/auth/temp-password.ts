/**
 * One-time passwords for new accounts and resets: 12 characters from an alphabet without look-alikes
 * (no 0/O, 1/l/I, 5/S, 2/Z). Cryptographically random, no modulo bias.
 * No imports, so scripts can use it directly.
 */
export const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRTUVWXY346789";
export const TEMP_PASSWORD_LENGTH = 12;

export function tempPassword(length: number = TEMP_PASSWORD_LENGTH): string {
  const alphabet = TEMP_PASSWORD_ALPHABET;
  const limit = 256 - (256 % alphabet.length); // reject bytes that would bias the result
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  // Make sure it has a lower-case letter, an upper-case letter and a digit (helps any password policy).
  if (!/[a-z]/.test(out) || !/[A-Z]/.test(out) || !/\d/.test(out)) return tempPassword(length);
  return out;
}
