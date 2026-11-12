import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const metadata: Metadata = { title: "Design tokens", robots: { index: false, follow: false } };

const swatches = [
  ["background", "foreground"],
  ["card", "card-foreground"],
  ["muted", "muted-foreground"],
  ["primary", "primary-foreground"],
  ["secondary", "secondary-foreground"],
  ["accent", "accent-foreground"],
  ["destructive", "destructive-foreground"],
  ["status-request", "status-request-foreground"],
  ["status-confirmed", "status-confirmed-foreground"],
  ["status-done", "status-done-foreground"],
  ["status-noshow", "status-noshow-foreground"],
  ["status-cancelled", "status-cancelled-foreground"],
] as const;

/** Dev-only reference sheet for the design tokens (phase 0). Not available in production builds. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-extrabold">Design tokens</h1>
        <ThemeToggle />
      </div>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold">Type scale</h2>
        <p className="text-display font-extrabold">Display <span className="marker">Salsa</span></p>
        <p className="font-heading text-h1 font-extrabold">Heading 1</p>
        <p className="font-heading text-h2 font-bold">Heading 2</p>
        <p className="font-heading text-h3 font-bold">Heading 3</p>
        <p className="text-lead text-muted-foreground">Lead paragraph for intros and summaries.</p>
        <p className="text-body">Body text. Walk-ins welcome; bookings are requests until the shop replies.</p>
        <p className="text-label font-semibold tracking-[0.14em] text-muted-foreground uppercase">Small label</p>
        <p className="flex gap-6">
          <span className="price text-price">£17</span>
          <span className="price text-price">£118</span>
          <span className="price text-price">£9</span>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-bold">Colour pairs</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {swatches.map(([bg, fg]) => (
            <li
              key={bg}
              className="rounded-lg border p-4 text-sm font-medium"
              style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
            >
              {bg}
            </li>
          ))}
        </ul>
        <div aria-hidden className="pole-stripe h-3 rounded-full" />
      </section>

      <section className="space-y-4">
        <h2 className="text-h2 font-bold">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="pop">Book now</Button>
          <Button>Primary</Button>
          <Button variant="ink">Ink</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Cancel booking</Button>
          <Button variant="link">Link</Button>
        </div>
      </section>

      <section className="max-w-sm space-y-4">
        <h2 className="text-h2 font-bold">Form parts</h2>
        <div className="space-y-2">
          <Label htmlFor="d-name">Your name</Label>
          <Input id="d-name" autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="d-select">Service</Label>
          <NativeSelect id="d-select" className="w-full">
            <NativeSelectOption>Hair cut</NativeSelectOption>
            <NativeSelectOption>Skin fade</NativeSelectOption>
          </NativeSelect>
        </div>
        <p role="alert" className="text-sm font-medium text-destructive">
          Please enter a UK mobile number, e.g. 07123 456789
        </p>
      </section>
    </main>
  );
}
