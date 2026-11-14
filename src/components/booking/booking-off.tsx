import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OpeningHours } from "@/components/public/opening-hours";
import type { WeeklyHours } from "@/lib/domain/hours";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Shown when online booking is off (or nothing can be booked): call or WhatsApp instead. */
export function BookingOff({ hours, walkInText, reason = "off" }: { hours: WeeklyHours; walkInText: string | null; reason?: "off" | "empty" }) {
  const { phone, whatsapp } = site;
  return (
    <div data-testid="booking-off">
      <p className="text-lead">
        {reason === "off"
          ? "Online booking isn't available right now. Give us a call or send a WhatsApp and we'll find you a time."
          : "There's nothing to book online at the moment. Give us a call or send a WhatsApp and we'll find you a time."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "pop", size: "lg" }))}>
          <Phone aria-hidden />
          Call {phone.display}
        </a>
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.e164.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            <MessageCircle aria-hidden />
            WhatsApp
          </a>
        )}
      </div>
      {walkInText && <p className="mt-6 font-semibold">{walkInText}</p>}
      <div className="mt-10 rounded-3xl border bg-card p-6">
        <h2 className="text-h3 font-bold">Opening hours</h2>
        <OpeningHours hours={hours} className="mt-4" />
      </div>
    </div>
  );
}
