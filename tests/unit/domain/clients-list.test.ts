import { describe, expect, it } from "vitest";
import {
  clientEditSchema, clientSearchArgs, clientsHref, pageSummary, parseClientParams, safeClientsBackLink,
} from "@/lib/domain/clients";
import { PHONE_ERROR } from "@/lib/domain/phone";

const ID = "10000000-0000-4000-8000-000000000003";

describe("clients list URL", () => {
  it("defaults and round trip", () => {
    expect(parseClientParams({})).toEqual({ q: "", filter: "all", barber: null, page: 1 });
    expect(clientsHref(parseClientParams({}))).toBe("/dashboard/clients");
    const p = parseClientParams({ q: "  Jo   Bloggs ", filter: "due_back", barber: ID, page: "3" });
    expect(p).toEqual({ q: "Jo Bloggs", filter: "due_back", barber: ID, page: 3 });
    expect(clientsHref(p)).toBe(`/dashboard/clients?q=Jo+Bloggs&filter=due_back&barber=${ID}&page=3`);
  });

  it("ignores rubbish", () => {
    expect(parseClientParams({ filter: "vip", barber: "x' or 1=1", page: "-4" })).toEqual({ q: "", filter: "all", barber: null, page: 1 });
    expect(parseClientParams({ page: "abc" }).page).toBe(1);
    expect(parseClientParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("the back link only ever goes to a clients list", () => {
    const list = clientsHref({ q: "jo", filter: "regular", page: 2 });
    expect(safeClientsBackLink(list)).toBe(list);
    expect(safeClientsBackLink("https://evil.example/")).toBe("/dashboard/clients");
    expect(safeClientsBackLink("//evil.example/dashboard/clients")).toBe("/dashboard/clients");
    expect(safeClientsBackLink("/dashboard/settings")).toBe("/dashboard/clients");
  });
});

describe("search arguments", () => {
  it("numbers typed any way search the phone; words search the name (LIKE-escaped)", () => {
    expect(clientSearchArgs("")).toEqual({ p_name: null, p_phone: null });
    expect(clientSearchArgs("07700 900 001")).toEqual({ p_name: null, p_phone: "7700900001" });
    expect(clientSearchArgs("+44 7700 900001")).toEqual({ p_name: null, p_phone: "7700900001" });
    expect(clientSearchArgs("900")).toEqual({ p_name: null, p_phone: "900" });
    expect(clientSearchArgs("Jo")).toEqual({ p_name: "Jo", p_phone: null });
    expect(clientSearchArgs("100%_x")).toEqual({ p_name: "100\\%\\_x", p_phone: null });
  });
});

describe("page summary", () => {
  it("says what's shown", () => {
    expect(pageSummary(1, 0)).toBe("No clients");
    expect(pageSummary(1, 4)).toBe("Showing 1–4 of 4");
    expect(pageSummary(2, 57)).toBe("Showing 21–40 of 57");
    expect(pageSummary(3, 57)).toBe("Showing 41–57 of 57");
  });
});

describe("edit details", () => {
  it("tidies the name and normalises the mobile", () => {
    expect(clientEditSchema.parse({ id: ID, name: "  Jo   Bloggs ", phone: "07700 900123" })).toEqual({
      id: ID, name: "Jo Bloggs", phone: "+447700900123",
    });
  });
  it("refuses an empty name or a landline", () => {
    expect(clientEditSchema.safeParse({ id: ID, name: "   ", phone: "07700900123" }).success).toBe(false);
    const landline = clientEditSchema.safeParse({ id: ID, name: "Jo", phone: "0151 309 4681" });
    expect(landline.error?.issues[0]).toMatchObject({ path: ["phone"], message: PHONE_ERROR });
  });
});
