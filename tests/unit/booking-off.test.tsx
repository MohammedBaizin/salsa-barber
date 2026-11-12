import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingOff } from "@/components/booking/booking-off";

describe("booking off panel", () => {
  it("offers Call and WhatsApp with the shop's number, plus hours", () => {
    render(<BookingOff hours={{ "1": { open: "09:00", close: "18:30" } }} walkInText="Walk-ins welcome." />);
    expect(screen.getByRole("link", { name: /Call 0151 309 4681/ })).toHaveAttribute("href", "tel:+441513094681");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/441513094681");
    expect(screen.getByText("Walk-ins welcome.")).toBeInTheDocument();
    expect(screen.getByText("9:00am–6:30pm")).toBeInTheDocument();
    expect(screen.getByText(/isn't available right now/)).toBeInTheDocument();
  });

  it("explains when there's nothing to book", () => {
    render(<BookingOff hours={{}} walkInText={null} reason="empty" />);
    expect(screen.getByText(/nothing to book online/)).toBeInTheDocument();
  });
});
