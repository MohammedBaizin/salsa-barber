import { describe, expect, it } from "vitest";
import { tooManyAttempts } from "@/lib/auth/sign-in-messages";
import { checkPassword } from "@/lib/domain/password";

const sam = { username: "sam.smith", name: "Sam Smith" };
const failed = (pw: string) => checkPassword(pw, sam).checks.filter((c) => !c.ok).map((c) => c.id);

describe("password rules", () => {
  it("10+ with upper, lower and a number or symbol", () => {
    expect(checkPassword("Fade-Line7x", sam).ok).toBe(true);
    expect(failed("fade-line7x")).toEqual(["mix"]);
    expect(failed("Fadeline7")).toEqual(["length"]);
  });

  it("any 16+ passphrase", () => {
    expect(checkPassword("purple kettle on the bus", sam).ok).toBe(true);
  });

  it("never the username, the name or the shop's name", () => {
    expect(failed("Sam.smith-2026!")).toContain("personal");
    expect(failed("Smithy-Trims-99")).toContain("personal");
    expect(failed("SalsaFades2026!")).toContain("personal");
  });

  it("not a common password, even with numbers added", () => {
    expect(failed("Password123!")).toContain("common");
    expect(failed("Liverpool1892!")).toContain("common");
    expect(failed("Qwertyuiop12")).toContain("common");
  });

  it("at most 72 characters; empty fails everything", () => {
    expect(failed("a".repeat(73))).toContain("length");
    expect(failed("")).toEqual(["length", "mix", "personal", "common"]);
  });

  it("wait message rounds up to whole minutes", () => {
    expect(tooManyAttempts(10)).toBe("Too many attempts. Try again in 1 minute.");
    expect(tooManyAttempts(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(tooManyAttempts(14 * 60)).toBe("Too many attempts. Try again in 14 minutes.");
  });
});
