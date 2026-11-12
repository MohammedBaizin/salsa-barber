import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";
import { TEMP_PASSWORD_ALPHABET, tempPassword } from "@/lib/auth/temp-password";

describe("safeNextPath (no open redirects)", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/calendar", "/dashboard/calendar"],
    ["/dashboard/clients?filter=due_back&page=2", "/dashboard/clients?filter=due_back&page=2"],
    ["/dashboard/clients/6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f", "/dashboard/clients/6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f"],
  ])("allows %j", (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });

  it.each([
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/\\evil.example",
    "/dashboard//evil.example",
    "/dashboard/../login",
    "/dashboard/%2e%2e/x",
    "/dashboard/%2F%2Fevil.example",
    "/dashboards",
    "/login",
    "/",
    "javascript:alert(1)",
    "/dashboard\nLocation: https://evil.example",
    "/dashboard#x",
    "",
    "x".repeat(600),
    undefined,
    ["/dashboard"],
  ])("refuses %j", (input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });
});

describe("tempPassword", () => {
  it("is 12 unambiguous characters with lower, upper and a digit", () => {
    for (let i = 0; i < 500; i++) {
      const p = tempPassword();
      expect(p).toHaveLength(12);
      expect([...p].every((c) => TEMP_PASSWORD_ALPHABET.includes(c))).toBe(true);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
    }
  });

  it("has no look-alike characters", () => {
    expect(TEMP_PASSWORD_ALPHABET).not.toMatch(/[0O1lI5S2Z]/);
  });

  it("doesn't repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => tempPassword()));
    expect(seen.size).toBe(2000);
  });
});
