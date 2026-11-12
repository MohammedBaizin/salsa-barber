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
