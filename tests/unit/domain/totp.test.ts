import { describe, expect, it } from "vitest";
import { base32Decode, secondsLeft, totp } from "@/lib/auth/totp";

// RFC 6238 test vectors (SHA-1, key "12345678901234567890").
const KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("one-time codes (tests and dev:code only)", () => {
  it("matches the RFC 6238 vectors", () => {
    expect(base32Decode(KEY).toString()).toBe("12345678901234567890");
    expect(totp(KEY, 59_000, 30, 8)).toBe("94287082");
    expect(totp(KEY, 1_111_111_109_000, 30, 8)).toBe("07081804");
    expect(totp(KEY, 2_000_000_000_000, 30, 8)).toBe("69279037");
    expect(totp(KEY, 59_000)).toBe("287082");
  });
  it("counts down to the next code", () => {
    expect(secondsLeft(59_000)).toBe(1);
    expect(secondsLeft(60_000)).toBe(30);
  });
});
