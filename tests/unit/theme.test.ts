import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { areaForPath, resolveTheme, THEME_COLORS, THEME_STORAGE_KEYS, themeScript } from "@/lib/theme";

describe("areaForPath", () => {
  it.each([
    ["/", "site"],
    ["/book", "site"],
    ["/booking/abc", "site"],
    ["/dashboards", "site"],
    ["/dashboard", "dashboard"],
    ["/dashboard/calendar", "dashboard"],
    ["/login", "dashboard"],
    ["/login/2fa", "dashboard"],
  ] as const)("%s -> %s", (path, area) => {
    expect(areaForPath(path)).toBe(area);
  });
});

describe("resolveTheme", () => {
  it("site: visitor choice wins, otherwise the shop default", () => {
    expect(resolveTheme({ area: "site", stored: "light", publicDefault: "dark", prefersDark: true })).toBe("light");
    expect(resolveTheme({ area: "site", stored: null, publicDefault: "dark", prefersDark: false })).toBe("dark");
    expect(resolveTheme({ area: "site", stored: "system", publicDefault: "light", prefersDark: true })).toBe("light");
    expect(resolveTheme({ area: "site", stored: "junk", publicDefault: "dark", prefersDark: false })).toBe("dark");
  });

  it("dashboard: defaults to system, ignores the public default", () => {
    expect(resolveTheme({ area: "dashboard", stored: null, publicDefault: "dark", prefersDark: false })).toBe("light");
    expect(resolveTheme({ area: "dashboard", stored: null, publicDefault: "light", prefersDark: true })).toBe("dark");
    expect(resolveTheme({ area: "dashboard", stored: "dark", publicDefault: "light", prefersDark: false })).toBe("dark");
    expect(resolveTheme({ area: "dashboard", stored: "system", publicDefault: "light", prefersDark: true })).toBe("dark");
  });
});

describe("themeScript (inline, before paint)", () => {
  const run = (publicDefault: "light" | "dark") => new Function(themeScript(publicDefault))();
  let prefersDark = false;

  beforeEach(() => {
    document.documentElement.className = "";
    document.head.innerHTML = "";
    localStorage.clear();
    prefersDark = false;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark") && prefersDark }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("keeps separate preferences for site and dashboard, and mirrors resolveTheme", () => {
    localStorage.setItem(THEME_STORAGE_KEYS.site, "light");
    localStorage.setItem(THEME_STORAGE_KEYS.dashboard, "dark");

    window.history.replaceState(null, "", "/");
    run("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.site.light);

    window.history.replaceState(null, "", "/dashboard/calendar");
    run("light");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.area).toBe("dashboard");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.dashboard.dark);
  });

  it("uses the shop default for new visitors and follows the system in the dashboard", () => {
    run("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    prefersDark = true;
    window.history.replaceState(null, "", "/login");
    run("light");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => run("light")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    vi.restoreAllMocks();
  });
});
