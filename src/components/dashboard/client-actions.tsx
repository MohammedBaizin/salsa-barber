"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { CalendarPlus, MessageCircle, MessageSquareText, Pencil, Phone, Trash2 } from "lucide-react";
import { deleteClient, updateClient, type ClientFormState } from "@/app/(staff)/dashboard/clients/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safely } from "@/lib/connection";
import { dueBackMessage, smsLink, whatsappLink } from "@/lib/domain/messages";
import { formatUkMobile, waDigits } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";
import { useBookings, type NewBookingDefaults } from "./bookings-provider";
import { ConfirmBar, Field, FormError } from "./form-parts";
import { SheetActions } from "./sheet";

const initial: ClientFormState = { error: null, fields: {}, saved: 0 };
const safeUpdate = safely(updateClient);
const safeDelete = safely(deleteClient);

type Client = { id: string; name: string; phone: string };

/** Call / WhatsApp / SMS. Due-back clients get the reminder text ready. */
export function ContactLinks({ client, dueBack }: { client: Client; dueBack: boolean }) {
  const { setup } = useBookings();
  const text = dueBack ? dueBackMessage(client.name, setup.shop) : "";
  return (
    <div className="flex flex-wrap gap-2" data-testid="contact-links">
      <a href={`tel:${client.phone}`} className={cn(buttonVariants({ variant: "outline" }))}>
        <Phone aria-hidden />
        Call
      </a>
      <a
        href={text ? whatsappLink(client.phone, text) : `https://wa.me/${waDigits(client.phone)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        <MessageCircle aria-hidden />
        {dueBack ? "WhatsApp reminder" : "WhatsApp"}
      </a>
      <a href={text ? smsLink(client.phone, text) : `sms:${client.phone}`} className={cn(buttonVariants({ variant: "outline" }))}>
        <MessageSquareText aria-hidden />
        {dueBack ? "SMS reminder" : "SMS"}
      </a>
    </div>
  );
}

/** "Book again": usual service and barber, three weeks ahead at their usual time, then the confirmation message. */
export function BookAgainButton({ client, date, defaults }: { client: Client; date: string; defaults: NewBookingDefaults }) {
  const { show, setup } = useBookings();
  const canBook = setup.actor.role !== "barber" ? setup.barbers.length > 0 : setup.barbers.some((b) => b.id === setup.actor.staffId);
  if (!canBook) return null;
  return (
    <Button
      variant="pop"
      onClick={() =>
        show({
          kind: "new",
          mode: "phone",
          date,
          title: `Book again: ${client.name}`,
          defaults: { ...defaults, name: client.name, phone: formatUkMobile(client.phone) },
        })
      }
    >
      <CalendarPlus aria-hidden />
      Book again
    </Button>
  );
}

function EditForm({ client }: { client: Client }) {
  const { close, notify } = useBookings();
  const [state, action, pending] = useActionState(safeUpdate, initial);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(formatUkMobile(client.phone));
  useEffect(() => {
    if (state.saved) {
      close();
      notify("Details saved.");
    }
  }, [state.saved, close, notify]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={client.id} />
      <Field label="Name" htmlFor="client-name" error={state.fields.name}>
        <Input id="client-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={Boolean(state.fields.name) || undefined} />
      </Field>
      <Field label="Mobile" htmlFor="client-phone" error={state.fields.phone}>
        <Input
          id="client-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(state.fields.phone) || undefined}
        />
      </Field>
      <p className="text-sm text-muted-foreground">Past bookings and messages already sent aren&apos;t changed.</p>
      <FormError>{state.error}</FormError>
      <SheetActions>
        <Button type="submit" variant="pop" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </SheetActions>
    </form>
  );
}

function DeletePanel({ client, upcoming }: { client: Client; upcoming: number }) {
  const [state, action, pending] = useActionState(safeDelete, initial);
  const [confirming, setConfirming] = useState(false);
  const run = () => {
    const data = new FormData();
    data.set("id", client.id);
    startTransition(() => action(data));
  };
  return (
    <div className="space-y-4">
      <p>Only do this when {client.name} asks to be removed. It can&apos;t be undone.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>
          {upcoming === 0
            ? "They have no upcoming bookings."
            : `${upcoming === 1 ? "Their 1 upcoming booking is" : `Their ${upcoming} upcoming bookings are`} cancelled. They aren't messaged automatically.`}
        </li>
        <li>Past visits stay in the takings, without their name.</li>
        <li>Their name and number are removed, including from the activity log.</li>
      </ul>
      <FormError>{state.error}</FormError>
      {confirming ? (
        <ConfirmBar
          question={`Delete ${client.name} for good?`}
          confirmLabel="Delete client"
          pending={pending}
          onKeep={() => setConfirming(false)}
          onConfirm={run}
        />
      ) : (
        <SheetActions>
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete client
          </Button>
        </SheetActions>
      )}
    </div>
  );
}

/** Owner/admin: Edit details and Delete client. */
export function ManageClientButtons({ client, upcoming }: { client: Client; upcoming: number }) {
  const { show } = useBookings();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => show({ kind: "panel", title: "Edit details", description: client.name, content: <EditForm client={client} /> })}>
        <Pencil aria-hidden />
        Edit details
      </Button>
      <Button
        variant="outline"
        className="text-destructive"
        onClick={() => show({ kind: "panel", title: "Delete client", description: client.name, content: <DeletePanel client={client} upcoming={upcoming} /> })}
      >
        <Trash2 aria-hidden />
        Delete client
      </Button>
    </div>
  );
}
