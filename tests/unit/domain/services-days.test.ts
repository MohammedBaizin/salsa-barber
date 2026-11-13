import { describe, expect, it } from "vitest";
import { parseServiceDays } from "@/lib/domain/services";

describe("service booking days", () => {
  it("some days → sorted list; all seven → null (every open day)", () => {
    expect(parseServiceDays(["4", "1", "2", "3", "3"])).toEqual({ ok: true, days: [1, 2, 3, 4] });
    expect(parseServiceDays(["1", "2", "3", "4", "5", "6", "7"])).toEqual({ ok: true, days: null });
  });
  it("needs at least one real day", () => {
    expect(parseServiceDays([])).toEqual({ ok: false, error: "Choose at least one day." });
    expect(parseServiceDays(["0", "8", "x"])).toMatchObject({ ok: false });
  });
});
