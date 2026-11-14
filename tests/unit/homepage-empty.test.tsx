import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Gallery } from "@/components/public/gallery";
import { Hero } from "@/components/public/hero";
import { sectionLinks } from "@/components/public/nav";
import { Reviews } from "@/components/public/reviews";
import { ServicesList } from "@/components/public/services-list";
import { Slideshow } from "@/components/public/slideshow";
import { Team } from "@/components/public/team";
import type { SiteContent } from "@/lib/site-content";

/** Day one: no photos, no team, no reviews, no rating. Every section must degrade gracefully. */
const empty: SiteContent = {
  shopHours: {},
  onlineBooking: true,
  googleRating: null,
  googleReviewCount: null,
  googleReviewUrl: null,
  walkInText: null,
  discountText: null,
  shopPhoto: null,
  services: [],
  team: [],
  slideshow: [],
  recentCuts: [],
  reviews: [],
  closures: [],
};

describe("homepage empty states", () => {
  it("sections with no data render nothing", () => {
    const { container } = render(
      <>
        <ServicesList services={[]} discountText={null} />
        <Team team={[]} />
        <Reviews reviews={[]} googleRating={null} googleReviewCount={null} googleReviewUrl={null} />
        <Gallery photos={[]} />
        <Slideshow photos={[]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("the hero falls back to the logo and hides the rating", () => {
    render(<Hero content={empty} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Salsa Barber");
    expect(screen.getByAltText("Salsa Barber logo")).toBeInTheDocument();
    expect(screen.queryByText(/on Google/)).toBeNull();
    expect(screen.getByRole("link", { name: "Book a cut" })).toHaveAttribute("href", "/book");
  });

  it("the nav only links to sections that exist", () => {
    expect(sectionLinks(empty)).toEqual([{ href: "/#visit", label: "Visit" }]);
    expect(sectionLinks({ ...empty, googleRating: 4.8 }).map((l) => l.label)).toEqual(["Reviews", "Visit"]);
  });

  it("a rating with no review cards still shows the summary", () => {
    render(<Reviews reviews={[]} googleRating={4.8} googleReviewCount={12} googleReviewUrl="https://g.page/r/x" />);
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("12 Google reviews")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Customer reviews" })).toBeNull();
  });

  it("services show length and bookable days, linking to the booking flow", () => {
    render(
      <ServicesList
        discountText="10% off on Tuesdays"
        services={[{ id: "s1", name: "OAP Cut (Mon–Thurs)", pricePence: 1400, durationMin: 30, bookableDays: [1, 2, 3, 4] }]}
      />,
    );
    const link = screen.getByRole("link", { name: /OAP Cut/ });
    expect(link).toHaveAttribute("href", "/book?service=s1");
    expect(link).toHaveAccessibleName(/^OAP Cut \(Mon–Thurs\)\s*£14\s*30 min · Mon–Thu only, book now$/);
    expect(screen.getByText("10% off on Tuesdays")).toBeInTheDocument();
  });
});
