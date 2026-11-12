/**
 * Shop details: the single place for everything shop-specific.
 * Components read from here (or from the database for content the owner edits in the dashboard).
 *
 * `confirmed: false` entries are shown with a <PlaceholderTag /> in dev
 * (NEXT_PUBLIC_SHOW_PLACEHOLDERS=true) until the owner confirms them.
 */

export const TIMEZONE = "Europe/London";
export const CURRENCY = "GBP";

export const site = {
  name: "Salsa Barber",
  shortName: "Salsa",

  address: {
    street: "41 Liverpool Road South",
    postcode: "L31 7BN",
    /** Postal town for L31. */
    city: "Liverpool",
    /** Local area shown on the site. Unconfirmed: L31 7BN is in Maghull. */
    area: "Maghull",
    country: "GB",
  },

  phone: {
    display: "0151 309 4681",
    e164: "+441513094681",
  },

  /**
   * Number customers WhatsApp/SMS. Null until the owner confirms which number takes
   * WhatsApp (the shop phone is a landline). While null, WhatsApp buttons are hidden.
   */
  whatsapp: null as null | { display: string; e164: string },

  socials: {
    instagram: "https://www.instagram.com/salsabarber1/",
    tiktok: "https://www.tiktok.com/@salsabarber1",
    facebook: "https://www.facebook.com/share/1Q5Euhorb3/",
    snapchat: "https://snapchat.com/t/NmhAQIXw",
  },

  maps: {
    /** Keyless embed, only loaded after the visitor taps "Show map". */
    embedUrl:
      "https://www.google.com/maps?q=Salsa+Barber,+41+Liverpool+Road+South,+Maghull,+L31+7BN&output=embed",
    directionsUrl: "https://maps.app.goo.gl/529KvjdrRqt25VS29",
    appleMapsUrl:
      "https://maps.apple.com/?q=Salsa+Barber&address=41+Liverpool+Road+South,+Maghull,+L31+7BN,+United+Kingdom",
  },

  /** Unconfirmed: ask the owner. */
  paymentText: "Cash & card",

  /** Internal fake domain for username logins (never receives mail). */
  staffEmailDomain: "staff.salsabarber.invalid",

  /** Default public theme until the Settings value exists (phase 2). */
  defaultPublicTheme: "dark" as "light" | "dark",
} as const;

/** Which details still need the owner's confirmation. */
export const unconfirmed = {
  area: true,
  paymentText: true,
  whatsapp: true,
} as const;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3417").replace(/\/$/, "");
}
