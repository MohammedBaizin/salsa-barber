import { describe, expect, it } from "vitest";
import {
  acceptedMessage, cancelledMessage, customerChangeRequest, declinedMessage, dueBackMessage, firstName, manageUrl, smsLink,
  updatedMessage, whatsappLink, type MessageBooking, type MessageShop,
} from "@/lib/domain/messages";

const shop: MessageShop = {
  name: "Salsa Barber",
  address: "41 Liverpool Road South, Maghull L31 7BN",
  phoneDisplay: "0151 309 4681",
  siteUrl: "https://example.test/",
  bookingEnabled: true,
};

const booking: MessageBooking = {
  name: "Ben  Smith",
  serviceName: "Skin Fade",
  barberName: "Sam",
  startsAt: new Date("2026-10-09T15:00:00Z"), // Fri 9 Oct, 4:00pm BST
  pricePence: 1800,
  manageToken: "11111111-2222-4333-8444-555555555555",
};

const MANAGE = "https://example.test/booking/11111111-2222-4333-8444-555555555555";

describe("customer messages (exact text)", () => {
  it("accepted", () => {
    expect(acceptedMessage(booking, shop)).toBe(
      [
        "Hi Ben, your booking at Salsa Barber is confirmed.",
        "",
        "Skin Fade with Sam",
        "Fri 9 Oct, 4:00pm",
        "£18",
        "",
        "41 Liverpool Road South, Maghull L31 7BN",
        "",
        `View, change or cancel: ${MANAGE}`,
        "",
        "See you soon,",
        "Salsa Barber",
      ].join("\n"),
    );
  });

  it("declined, with a reason and a rebook link while online booking is on", () => {
    expect(declinedMessage(booking, shop, "  Fully booked\nthat afternoon ")).toBe(
      [
        "Hi Ben, sorry, we can't fit in your Skin Fade on Fri 9 Oct, 4:00pm.",
        "Fully booked that afternoon",
        "",
        "You can book another time here: https://example.test/book",
        "",
        "Salsa Barber",
      ].join("\n"),
    );
  });

  it("declined without a reason, booking off -> call instead of a link", () => {
    const text = declinedMessage(booking, { ...shop, bookingEnabled: false });
    expect(text).toContain("Please call us on 0151 309 4681 to find another time.");
    expect(text).not.toContain("/book");
    expect(text.split("\n")[1]).toBe("");
  });

  it("updated lists what changed", () => {
    const text = updatedMessage(booking, shop, {
      previousStartsAt: new Date("2026-10-08T10:00:00Z"),
      previousBarberName: "Ali",
      previousServiceName: "Hair Cut",
    });
    expect(text).toBe(
      [
        "Hi Ben, your booking at Salsa Barber has changed.",
        "",
        "New time: Fri 9 Oct, 4:00pm (was Thu 8 Oct, 11:00am)",
        "Now with Sam (was Ali)",
        "Service: Skin Fade, £18 (was Hair Cut)",
        "",
        "Skin Fade with Sam",
        "Fri 9 Oct, 4:00pm",
        "£18",
        "",
        "41 Liverpool Road South, Maghull L31 7BN",
        "",
        `View, change or cancel: ${MANAGE}`,
        "",
        "Salsa Barber",
      ].join("\n"),
    );
  });

  it("cancelled", () => {
    expect(cancelledMessage(booking, shop)).toBe(
      [
        "Hi Ben, your Skin Fade at Salsa Barber on Fri 9 Oct, 4:00pm has been cancelled.",
        "",
        "You can book another time here: https://example.test/book",
        "",
        "Salsa Barber",
      ].join("\n"),
    );
  });

  it("due-back reminder", () => {
    expect(dueBackMessage("Alex Jones", shop)).toBe(
      ["Hi Alex, it's been a while since your last visit to Salsa Barber.", "", "Book your next visit here: https://example.test/book", "", "Salsa Barber"].join("\n"),
    );
    expect(dueBackMessage("Alex", { ...shop, bookingEnabled: false })).toContain("Give us a call on 0151 309 4681");
  });

  it("customer's change request to the shop", () => {
    expect(customerChangeRequest(booking, shop)).toBe(
      ["Hi Salsa Barber, I'd like to change my booking:", "Skin Fade with Sam, Fri 9 Oct, 4:00pm.", "Name: Ben  Smith", `Booking: ${MANAGE}`].join("\n"),
    );
  });

  it("contains no emoji and never the customer's phone number", () => {
    const all = [acceptedMessage(booking, shop), declinedMessage(booking, shop), cancelledMessage(booking, shop), updatedMessage(booking, shop, {})].join("\n");
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(all).not.toMatch(/07\d{3}|\+447/);
  });
});

describe("links", () => {
  it("builds wa.me and sms: links with encoded text", () => {
    expect(whatsappLink("+447123456789", "Hi Ben & co\nsee you")).toBe("https://wa.me/447123456789?text=Hi%20Ben%20%26%20co%0Asee%20you");
    expect(smsLink("+447123456789", "Hi Ben")).toBe("sms:+447123456789?&body=Hi%20Ben");
  });

  it("manage links and first names", () => {
    expect(manageUrl({ siteUrl: "https://example.test" }, "abc")).toBe("https://example.test/booking/abc");
    expect(firstName("  Mary Ann Smith ")).toBe("Mary");
  });
});
