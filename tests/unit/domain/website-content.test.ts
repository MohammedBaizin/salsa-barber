import { describe, expect, it } from "vitest";
import { addsHiddenNote, cleanAlt, photoMeter, reviewSchema, setFullMessage, startsVisible } from "@/lib/domain/website";
import { fitWithin, formatBytes, isHeicFile } from "@/lib/images/shrink";

describe("website photos", () => {
  it("new photos start hidden when the section is full or they show a child", () => {
    expect(startsVisible({ set: "slideshow", visibleInSet: 2, child: false })).toBe(true);
    expect(startsVisible({ set: "slideshow", visibleInSet: 3, child: false })).toBe(false);
    expect(startsVisible({ set: "recent_cuts", visibleInSet: 3, child: false })).toBe(true);
    expect(startsVisible({ set: "recent_cuts", visibleInSet: 4, child: false })).toBe(false);
    expect(startsVisible({ set: "recent_cuts", visibleInSet: 0, child: true })).toBe(false);
  });

  it("meter and messages", () => {
    expect(photoMeter("recent_cuts", 4)).toEqual({ label: "4 of 4", full: true });
    expect(photoMeter("slideshow", 1)).toEqual({ label: "1 of 3", full: false });
    expect(setFullMessage("slideshow")).toBe("Slideshow already shows 3 photos. Hide one first.");
    expect(addsHiddenNote("recent_cuts")).toMatch(/^Recent cuts is full \(4 of 4\), so this photo will be added hidden/);
  });

  it("descriptions are required, one line, at most 160 characters", () => {
    expect(cleanAlt("  Skin fade\n with  line-up ")).toBe("Skin fade with line-up");
    expect(cleanAlt("   ")).toBeNull();
    expect(cleanAlt("x".repeat(161))).toBeNull();
  });
});

describe("reviews", () => {
  const base = { authorName: " Jo  B ", body: "Great cut.\r\n\r\n\r\nWill be back.", stars: "5", reviewDate: "", isGoogle: "on", visible: undefined };
  it("cleans the name and text, keeps paragraphs, reads checkboxes", () => {
    expect(reviewSchema.parse(base)).toEqual({
      authorName: "Jo B",
      body: "Great cut.\n\nWill be back.",
      stars: 5,
      reviewDate: null,
      isGoogle: true,
      visible: false,
    });
  });
  it("refuses missing text, bad stars and bad dates", () => {
    const r = reviewSchema.safeParse({ ...base, authorName: "", body: " ", stars: "6", reviewDate: "12/03/2026" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0]).sort()).toEqual(["authorName", "body", "reviewDate", "stars"]);
  });
});

describe("browser photo shrinking helpers", () => {
  it("fits the longest side, never enlarging", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it("spots iPhone photos by type or name, formats sizes", () => {
    expect(isHeicFile({ name: "IMG_0001.HEIC", type: "" })).toBe(true);
    expect(isHeicFile({ name: "photo", type: "image/heif" })).toBe(true);
    expect(isHeicFile({ name: "cut.jpg", type: "image/jpeg" })).toBe(false);
    expect(formatBytes(6.2 * 1024 * 1024)).toBe("6.2 MB");
    expect(formatBytes(640 * 1024)).toBe("640 KB");
    expect(formatBytes(10)).toBe("1 KB");
  });
});
