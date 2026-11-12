/**
 * Parses src/app/globals.css and checks every text/background pair meets WCAG 2.1 AA
 * in light and dark: 4.5:1 for text, 3:1 for UI boundaries (inputs, focus ring).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.search(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** [text, background] pairs that must reach 4.5:1. */
const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "muted"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["accent-foreground", "accent"],
  ["accent", "background"],
  ["accent", "card"],
  ["destructive-foreground", "destructive"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["link", "background"],
  ["link", "card"],
  ["link", "muted"],
  ["highlight-foreground", "highlight"],
  ["status-request-foreground", "status-request"],
  ["status-confirmed-foreground", "status-confirmed"],
  ["status-done-foreground", "status-done"],
  ["status-noshow-foreground", "status-noshow"],
  ["status-cancelled-foreground", "status-cancelled"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

/** [component, background] pairs that must reach 3:1 (WCAG 1.4.11 non-text contrast). */
const UI_PAIRS: [string, string][] = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["sidebar-ring", "sidebar"],
  ["shadow-hard", "background"],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme", (_name, selector) => {
  const vars = block(selector);

  it("defines every token used in the checks", () => {
    for (const [a, b] of [...TEXT_PAIRS, ...UI_PAIRS]) {
      expect(vars[a], `--${a}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(vars[b], `--${b}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT_PAIRS)("text --%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("UI --%s against --%s is at least 3:1", (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("light and dark define the same tokens", () => {
  it("has matching variable names", () => {
    expect(Object.keys(block(".dark")).sort()).toEqual(Object.keys(block(":root")).sort());
  });
});

describe("contrast()", () => {
  it("matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
