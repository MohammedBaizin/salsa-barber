"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Copy, MapPin, MessageCircle, Phone, Plus, XCircle } from "lucide-react";
import { cancelBooking, type CancelState } from "@/app/(public)/booking/[token]/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { safely } from "@/lib/connection";
import { cn } from "@/lib/utils";

const initial: CancelState = { error: null, done: false, attempt: 0 };
const cancelSafely = safely(cancelBooking);

/**
 * The customer's actions on their private page (spec §4.4): Change, Cancel (asks first), WhatsApp the shop with
 * the booking prefilled, Call, Directions, Book another, Copy link. Change and Cancel only before the cut-off.
 */
export function ManageActions({
  token,
  canCancel,
  active,
  past,
  cutoffText,
  changeHref,
  anotherHref,
  whatsappHref,
  phone,
  directionsUrl,
}: {
  token: string;
  /** Before the cut-off and still pending/confirmed (the database checks again). */
  canCancel: boolean;
  active: boolean;
  /** The appointment time has gone. */
  past: boolean;
  /** e.g. "2 hours" */
  cutoffText: string;
  /** Null when changing isn't possible (after the cut-off, or online booking is off). */
  changeHref: string | null;
  anotherHref: string | null;
  whatsappHref: string | null;
  phone: { display: string; e164: string };
  directionsUrl: string;
}) {
  const [state, action, pending] = useActionState(cancelSafely, initial);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) keep.current?.focus();
  }, [asking]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Clipboard blocked: the address bar still has the link.
    }
  };

  return (
    <section aria-labelledby="manage-title" className="mt-8 space-y-4">
      <h2 id="manage-title" className="sr-only">
        Manage your booking
      </h2>

      {canCancel ? (
        <div className="flex flex-wrap gap-3">
          {changeHref ? (
            <Link href={changeHref} className={cn(buttonVariants({ variant: "pop" }))}>
              <CalendarClock aria-hidden />
              Change
            </Link>
          ) : null}
          {asking ? null : (
            <Button variant="outline" onClick={() => setAsking(true)}>
              <XCircle aria-hidden />
              Cancel booking
            </Button>
          )}
        </div>
      ) : active && past ? (
        <p className="rounded-2xl border p-4" data-testid="too-late">
          This appointment time has passed. To book again, use Book another below or call the shop.
        </p>
      ) : active ? (
        <p className="rounded-2xl border p-4" data-testid="too-late">
          It&apos;s less than {cutoffText} before your appointment, so it can&apos;t be changed or cancelled online. Please message or call the shop.
        </p>
      ) : null}

      {asking && canCancel ? (
        <form action={action} role="group" aria-label="Cancel this booking?" className="rounded-2xl border-2 border-destructive bg-card p-5">
          <input type="hidden" name="token" value={token} />
          <p className="font-semibold">Cancel this booking? The time is given to someone else.</p>
          <div className="mt-3 flex flex-wrap gap-2 [&>*]:flex-1">
            <Button ref={keep} type="button" variant="outline" onClick={() => setAsking(false)}>
              Keep booking
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || state.done}>
              {pending ? "Cancelling…" : "Yes, cancel it"}
            </Button>
          </div>
        </form>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
            <MessageCircle aria-hidden />
            WhatsApp the shop
          </a>
        ) : null}
        <a href={`tel:${phone.e164}`} className={cn(buttonVariants({ variant: "outline" }))}>
          <Phone aria-hidden />
          Call {phone.display}
        </a>
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
          <MapPin aria-hidden />
          Directions
        </a>
        {anotherHref ? (
          <Link href={anotherHref} className={cn(buttonVariants({ variant: "outline" }))}>
            <Plus aria-hidden />
            Book another
          </Link>
        ) : null}
        <Button variant="outline" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Link copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Keep this page&apos;s link: it&apos;s the only way to see this booking online.
      </p>
    </section>
  );
}
