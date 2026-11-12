/**
 * Theme handling shared by the public site and the dashboard.
 *
 * - The public site and the dashboard keep separate preferences in localStorage.
 * - Public: "light" | "dark". A visitor's own toggle wins over the shop's default (a Setting).
 * - Dashboard: "light" | "dark" | "system".
 * - A tiny inline script (themeScript) sets the class on <html> and the theme-color meta before paint.
 */

export type PublicTheme = "light" | "dark";
export type DashboardTheme = "light" | "dark" | "system";
export type ThemeArea = "site" | "dashboard";

export const THEME_STORAGE_KEYS = {
  site: "salsa-site-theme",
  dashboard: "salsa-dashboard-theme",
} as const;

/** theme-color values matching the header / status bar of each area and theme. */
export const THEME_COLORS = {
  site: { light: "#fbf6ee", dark: "#141210" },
  dashboard: { light: "#ffffff", dark: "#1a1715" },
} as const;

/** Paths that belong to the staff area (dashboard theme preference). */
export function areaForPath(pathname: string): ThemeArea {
  return /^\/(dashboard|login)(\/|$)/.test(pathname) ? "dashboard" : "site";
}

export function isPublicTheme(value: unknown): value is PublicTheme {
  return value === "light" || value === "dark";
}

export function isDashboardTheme(value: unknown): value is DashboardTheme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Decide the theme to apply. Pure, so it can be unit-tested and mirrored in the inline script.
 */
export function resolveTheme(opts: {
  area: ThemeArea;
  stored: string | null;
  publicDefault: PublicTheme;
  prefersDark: boolean;
}): PublicTheme {
  const { area, stored, publicDefault, prefersDark } = opts;
  if (area === "site") return isPublicTheme(stored) ? stored : publicDefault;
  const pref: DashboardTheme = isDashboardTheme(stored) ? stored : "system";
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

/**
 * Inline script for <head>. Mirrors areaForPath + resolveTheme. Keep it tiny and ES5.
 * `publicDefault` comes from Settings (cached), so the page can still be prerendered.
 */
export function themeScript(publicDefault: PublicTheme): string {
  const d = isPublicTheme(publicDefault) ? publicDefault : "light";
  const keys = JSON.stringify(THEME_STORAGE_KEYS);
  const colors = JSON.stringify(THEME_COLORS);
  return `(function(){try{var K=${keys},C=${colors},p=location.pathname,a=/^\\/(dashboard|login)(\\/|$)/.test(p)?"dashboard":"site",s=null;try{s=localStorage.getItem(K[a])}catch(e){}var t;if(a==="site"){t=(s==="light"||s==="dark")?s:"${d}"}else{var q=(s==="light"||s==="dark"||s==="system")?s:"system";t=q==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):q}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;r.setAttribute("data-area",a);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m)}m.setAttribute("content",C[a][t])}catch(e){}})()`;
}

/** Apply a theme at runtime (used by the toggles). Browser only. */
export function applyTheme(area: ThemeArea, theme: PublicTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[area][theme];
}
