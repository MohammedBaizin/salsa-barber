/** Sign-in messages, shared by the login action and its tests. */
export const SIGN_IN_ERRORS = {
  missing: "Enter your username and password.",
  wrong: "Wrong username or password.",
  switchedOff: "This account has been switched off. Ask the shop owner if you think this is a mistake.",
  busy: "Too many attempts. Please wait a few minutes and try again.",
} as const;

/** Notices shown on /login after a redirect (?message=…). */
export const LOGIN_NOTICES: Record<string, string> = {
  signed_out: "You've signed out.",
  switched_off: SIGN_IN_ERRORS.switchedOff,
};

/** "Too many attempts. Try again in 12 minutes." (rounded up, at least 1 minute) */
export function tooManyAttempts(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}.`;
}

/** Two-step sign-in code messages. */
export const CODE_ERRORS = {
  format: "Enter the 6-digit code from your authenticator app.",
  wrong: "That code didn't work. Codes change every 30 seconds: try the newest one, and check your phone's clock is right.",
} as const;
