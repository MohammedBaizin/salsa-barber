import { describe, expect, it } from "vitest";
import { formatPence, parsePounds, penceToInput } from "@/lib/domain/money";
import { formatUkMobile, normaliseUkMobile, PHONE_ERROR, waDigits } from "@/lib/domain/phone";

describe("money", () => {
  it.each([
    [1700, "£17"],
    [1750, "£17.50"],
    [5, "£0.05"],
    [0, "£0"],
    [123456, "£1,234.56"],
    [-200, "-£2"],
  ])("formatPence(%i) = %s", (pence, text) => {
    expect(formatPence(pence)).toBe(text);
  });

  it.each([
    ["17", 1700],
    ["£17", 1700],
    ["£ 17.50", 1750],
    ["17.5", 1750],
    ["0.05", 5],
    ["1,000", 100000],
    ["1000.01", null],
    ["-5", null],
    ["17.555", null],
    ["abc", null],
    ["", null],
  ])("parsePounds(%j) = %j", (input, pence) => {
    expect(parsePounds(input)).toBe(pence);
  });

  it("formats for inputs", () => {
    expect(penceToInput(1700)).toBe("17");
    expect(penceToInput(1750)).toBe("17.50");
  });
});

describe("UK mobile numbers", () => {
  it.each([
    "07123 456789",
    "07123456789",
    "7123456789",
    "+447123456789",
    "+44 7123 456789",
    "+44 (0)7123 456789",
    "+4407123456789",
    "00447123456789",
    "447123456789",
    "4407123456789",
    "07123-456-789",
    " 07123.456.789 ",
  ])("accepts %j", (input) => {
    expect(normaliseUkMobile(input)).toBe("+447123456789");
  });

  it("accepts Isle of Man 07624 mobiles", () => {
    expect(normaliseUkMobile("07624 123456")).toBe("+447624123456");
  });

  it.each([
    ["0151 309 4681", "landline"],
    ["01513094681", "landline"],
    ["+441513094681", "landline E.164"],
    ["+33612345678", "France"],
    ["+1 202 555 0143", "US"],
    ["0712345678", "too short"],
    ["071234567890", "too long"],
    ["07012 345678", "070 personal number"],
    ["07612 345678", "076 pager"],
    ["07123 45678a", "letters"],
    ["", "empty"],
    ["+", "just a plus"],
  ])("refuses %j (%s)", (input) => {
    expect(normaliseUkMobile(input)).toBeNull();
  });

  it("formats for display and WhatsApp", () => {
    expect(formatUkMobile("+447123456789")).toBe("07123 456789");
    expect(formatUkMobile("nonsense")).toBe("nonsense");
    expect(waDigits("+447123456789")).toBe("447123456789");
  });

  it("has the spec's error message", () => {
    expect(PHONE_ERROR).toBe("Please enter a UK mobile number, e.g. 07123 456789");
  });
});
