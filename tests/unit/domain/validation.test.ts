import { describe, expect, it } from "vitest";
import {
  BOOKING_ERROR_CODES, bookingErrorMessage, bookingRequestSchema, cleanName, fieldErrors, GENERIC_ERROR, isOverlapError, nameSchema,
} from "@/lib/domain/validation";

const valid = {
  serviceId: "6f1c2b8e-9d3a-4c5b-8e7f-1a2b3c4d5e6f",
  barberId: null,
  start: "2026-11-20T10:00:00.000Z",
  name: "  Ben   Smith ",
  phone: "07123 456789",
  website: "",
};

describe("bookingRequestSchema", () => {
  it("accepts a valid request and normalises name and phone", () => {
    const r = bookingRequestSchema.parse(valid);
    expect(r.name).toBe("Ben Smith");
    expect(r.phone).toBe("+447123456789");
    expect(r.barberId).toBeNull();
  });

  it("refuses a filled honeypot", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(false);
  });

  it("gives field errors with the spec's phone message", () => {
    const r = bookingRequestSchema.safeParse({ ...valid, phone: "0151 309 4681", name: "   " });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toEqual({
      phone: "Please enter a UK mobile number, e.g. 07123 456789",
      name: "Please enter your name.",
    });
  });

  it("refuses bad ids and times", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, serviceId: "x" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, start: "tomorrow" }).success).toBe(false);
  });
});

describe("names", () => {
  it("collapses whitespace and limits to 80 characters", () => {
    expect(cleanName(" a \n b\t c ")).toBe("a b c");
    expect(nameSchema.safeParse("x".repeat(80)).success).toBe(true);
    expect(nameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });
});

describe("error codes", () => {
  it("every RPC code has its own friendly message", () => {
    const messages = BOOKING_ERROR_CODES.map(bookingErrorMessage);
    expect(new Set(messages).size).toBe(BOOKING_ERROR_CODES.length);
    expect(messages).not.toContain(GENERIC_ERROR);
  });

  it("finds a code inside a database error message, otherwise a generic message", () => {
    expect(bookingErrorMessage("ERROR: slot_taken")).toBe(bookingErrorMessage("slot_taken"));
    expect(bookingErrorMessage("something odd")).toBe(GENERIC_ERROR);
    expect(bookingErrorMessage(undefined)).toBe(GENERIC_ERROR);
  });

  it("recognises double-booking errors", () => {
    expect(isOverlapError({ code: "23P01" })).toBe(true);
    expect(isOverlapError({ code: "23505" })).toBe(false);
    expect(isOverlapError(null)).toBe(false);
  });
});
