"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addClosure, removeClosure, saveBookingRules, saveGoogle, saveOpeningHours, savePublicTheme, saveWebsiteNotes,
} from "@/app/(staff)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SaveState } from "@/lib/dashboard/action-state";
import type { WeeklyHours } from "@/lib/domain/hours";
import { CHANGE_CUTOFF_CHOICES, CLOSURE_MAX_DAYS_AHEAD, MIN_NOTICE_CHOICES, noticeLabel } from "@/lib/domain/settings";
import { addDays, dateKey, formatDay } from "@/lib/domain/time";
import { cn } from "@/lib/utils";
import { Card, Field, Form, FormError, SaveButton, useSave, WeeklyHoursFields } from "./form-parts";

/**
 * Settings cards (spec §8.8), each saved on its own. Hours and closed days warn about existing bookings first
 * ("Save anyway" / "Add anyway"); changing anything in the form puts the normal button back.
 */

/** A warning from the last answer stays "armed" until the form is changed. */
function useWarning(state: SaveState) {
  const [changedAt, setChangedAt] = useState(-1);
  const armed = Boolean(state.warning) && changedAt !== state.attempt;
  return { armed, reset: () => setChangedAt(state.attempt) };
}

function WarningBox({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border-2 border-status-request-foreground bg-status-request p-3 text-sm text-status-request-foreground">
      {children}
    </p>
  );
}

const describedBy = (id: string, opts: { hint?: boolean; error?: string }) =>
  [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

export function OpeningHoursForm({ hours }: { hours: WeeklyHours }) {
  const { state, submit, pending } = useSave(saveOpeningHours);
  const warning = useWarning(state);
  return (
    <Card
      id="hours"
      title="Opening hours"
      description="Shown on the website. Online booking only offers times inside these hours (and each barber's own). Existing bookings are never moved."
    >
      <Form onSubmit={submit} onChange={warning.reset} className="space-y-4">
        <input type="hidden" name="anyway" value={warning.armed ? "1" : "0"} />
        <WeeklyHoursFields legend="Opening hours" offLabel="Closed" hours={hours} errors={state.fields} readOnly={false} />
        <WarningBox>{warning.armed ? state.warning : null}</WarningBox>
        <FormError>{state.error}</FormError>
        <SaveButton pending={pending}>{warning.armed ? "Save anyway" : "Save opening hours"}</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Closed days
// ---------------------------------------------------------------------------

export function ClosedDaysForm({ closures }: { closures: { id: string; date: string; reason: string | null }[] }) {
  const add = useSave(addClosure);
  const remove = useSave(removeClosure);
  const warning = useWarning(add.state);
  const [today] = useState(() => dateKey(new Date()));
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const dateError = add.state.fields.closedOn;
  // Empty the form once a day is added (adjusting state while rendering, not in an effect).
  const [clearedAt, setClearedAt] = useState(0);
  if (add.state.done && clearedAt !== add.state.attempt) {
    setClearedAt(add.state.attempt);
    setDate("");
    setReason("");
  }

  return (
    <Card
      id="closed-days"
      title="Closed days"
      description="Whole days the shop is shut, e.g. bank holidays. Shown on the website; online booking skips them."
    >
      {closures.length ? (
        <ul className="divide-y rounded-xl border" data-testid="closed-days">
          {closures.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">{formatDay(c.date)} {c.date.slice(0, 4)}</span>
                {c.reason ? <span className="block text-sm text-muted-foreground">{c.reason}</span> : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={remove.pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("closureId", c.id);
                  remove.send(data);
                }}
              >
                <Trash2 aria-hidden />
                Remove
                <span className="sr-only"> closed day {formatDay(c.date)}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No closed days coming up.</p>
      )}
      <Form onSubmit={add.submit} onChange={warning.reset} className="space-y-4">
        <input type="hidden" name="anyway" value={warning.armed ? "1" : "0"} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" htmlFor="closed-on" error={dateError}>
            <Input
              id="closed-on"
              name="closedOn"
              type="date"
              value={date}
              min={today}
              max={addDays(today, CLOSURE_MAX_DAYS_AHEAD)}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={describedBy("closed-on", { error: dateError })}
            />
          </Field>
          <Field label="Reason (optional, shown on the website)" htmlFor="closed-reason" error={add.state.fields.reason}>
            <Input id="closed-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} placeholder="e.g. Bank holiday" />
          </Field>
        </div>
        <WarningBox>{warning.armed ? add.state.warning : null}</WarningBox>
        <FormError>{add.state.error ?? remove.state.error}</FormError>
        <SaveButton pending={add.pending}>{warning.armed ? "Add anyway" : "Add closed day"}</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Booking rules
// ---------------------------------------------------------------------------

export type BookingRules = {
  minNoticeMinutes: number;
  bookingWindowDays: number;
  dueBackWeeks: number;
  maxOpenRequests: number;
  changeCutoffMinutes: number;
};

function ChoiceSelect({
  id,
  name,
  choices,
  value,
  label,
  error,
  hint,
}: {
  id: string;
  name: string;
  choices: readonly number[];
  value: number;
  label: (n: number) => string;
  error?: string;
  hint?: boolean;
}) {
  const all = choices.includes(value) ? choices : [...choices, value].sort((a, b) => a - b);
  return (
    <NativeSelect
      id={id}
      name={name}
      defaultValue={String(value)}
      className="w-full"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, { hint, error })}
    >
      {all.map((n) => (
        <NativeSelectOption key={n} value={n}>
          {label(n)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function NumberField({
  id,
  name,
  label,
  hint,
  value,
  min,
  max,
  error,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint: true, error })}
      />
    </Field>
  );
}

export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const { state, submit, pending } = useSave(saveBookingRules);
  const f = state.fields;
  return (
    <Card id="booking-rules" title="Booking rules" description="How online booking behaves. Bookings made by staff aren't limited by these.">
      <Form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum notice" htmlFor="rule-notice" hint="How soon before a time customers can still ask for it." error={f.minNoticeMinutes}>
            <ChoiceSelect id="rule-notice" name="minNoticeMinutes" choices={MIN_NOTICE_CHOICES} value={rules.minNoticeMinutes} label={noticeLabel} error={f.minNoticeMinutes} hint />
          </Field>
          <NumberField
            id="rule-window"
            name="bookingWindowDays"
            label="How far ahead (days)"
            hint="Including today: 30 means today and the next 29 days."
            value={rules.bookingWindowDays}
            min={1}
            max={365}
            error={f.bookingWindowDays}
          />
          <NumberField
            id="rule-due-back"
            name="dueBackWeeks"
            label="Due back after (weeks)"
            hint="Clients show as Due back this long after their last visit."
            value={rules.dueBackWeeks}
            min={1}
            max={52}
            error={f.dueBackWeeks}
          />
          <NumberField
            id="rule-requests"
            name="maxOpenRequests"
            label="Waiting requests per phone"
            hint="How many unanswered requests one number can have at once."
            value={rules.maxOpenRequests}
            min={1}
            max={20}
            error={f.maxOpenRequests}
          />
          <Field
            label="Change or cancel cut-off"
            htmlFor="rule-cutoff"
            hint="Customers can change or cancel online until this long before."
            error={f.changeCutoffMinutes}
          >
            <ChoiceSelect
              id="rule-cutoff"
              name="changeCutoffMinutes"
              choices={CHANGE_CUTOFF_CHOICES}
              value={rules.changeCutoffMinutes}
              label={(n) => (n === 0 ? "Up to the start time" : `${noticeLabel(n)} before`)}
              error={f.changeCutoffMinutes}
              hint
            />
          </Field>
        </div>
        <FormError>{state.error}</FormError>
        <SaveButton pending={pending}>Save booking rules</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Google rating
// ---------------------------------------------------------------------------

export function GoogleForm({ google }: { google: { rating: number | null; count: number | null; url: string | null } }) {
  const { state, submit, pending } = useSave(saveGoogle);
  const f = state.fields;
  return (
    <Card id="google" title="Google rating" description="Copy these from the shop's Google profile. Leave the rating blank to hide it on the website.">
      <Form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rating (0 to 5)" htmlFor="google-rating" error={f.rating}>
            <Input
              id="google-rating"
              name="rating"
              inputMode="decimal"
              defaultValue={google.rating?.toFixed(1) ?? ""}
              placeholder="e.g. 4.8"
              aria-invalid={f.rating ? true : undefined}
              aria-describedby={describedBy("google-rating", { error: f.rating })}
            />
          </Field>
          <Field label="Number of reviews" htmlFor="google-count" error={f.count}>
            <Input
              id="google-count"
              name="count"
              inputMode="numeric"
              defaultValue={google.count ?? ""}
              aria-invalid={f.count ? true : undefined}
              aria-describedby={describedBy("google-count", { error: f.count })}
            />
          </Field>
        </div>
        <Field label="Link to the Google reviews" htmlFor="google-url" hint="Must start with https://" error={f.url}>
          <Input
            id="google-url"
            name="url"
            type="url"
            inputMode="url"
            defaultValue={google.url ?? ""}
            placeholder="https://"
            aria-invalid={f.url ? true : undefined}
            aria-describedby={describedBy("google-url", { hint: true, error: f.url })}
          />
        </Field>
        <FormError>{state.error}</FormError>
        <SaveButton pending={pending}>Save Google rating</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Website notes
// ---------------------------------------------------------------------------

function NoteField({ id, name, label, hint, value, error }: { id: string; name: string; label: string; hint: string; value: string; error?: string }) {
  const [text, setText] = useState(value);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={200}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint: true, error })}
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
        )}
      />
      <p className="text-right text-xs text-muted-foreground" aria-hidden>
        {text.length}/200
      </p>
    </Field>
  );
}

export function WebsiteNotesForm({ notes }: { notes: { walkInText: string | null; discountText: string | null } }) {
  const { state, submit, pending } = useSave(saveWebsiteNotes);
  return (
    <Card id="website-notes" title="Website notes" description="Short lines on the homepage. Leave one blank to hide it. Line breaks become spaces.">
      <Form onSubmit={submit} className="space-y-4">
        <NoteField
          id="note-walk-in"
          name="walkInText"
          label="Walk-ins"
          hint="e.g. Walk-ins welcome whenever a chair is free."
          value={notes.walkInText ?? ""}
          error={state.fields.walkInText}
        />
        <NoteField
          id="note-discount"
          name="discountText"
          label="Offer or discount"
          hint="e.g. OAP cuts £14 Monday to Thursday."
          value={notes.discountText ?? ""}
          error={state.fields.discountText}
        />
        <FormError>{state.error}</FormError>
        <SaveButton pending={pending}>Save website notes</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Website theme
// ---------------------------------------------------------------------------

export function WebsiteThemeForm({ theme }: { theme: "light" | "dark" }) {
  const { state, submit, pending } = useSave(savePublicTheme);
  return (
    <Card
      id="website-theme"
      title="Website theme"
      description="What new visitors see first. Visitors who pick a theme with the switch on the website keep their choice."
    >
      <Form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-1">
          <legend className="sr-only">Website theme</legend>
          {(["dark", "light"] as const).map((t) => (
            <label key={t} className="flex min-h-11 items-center gap-3">
              <input type="radio" name="publicTheme" value={t} defaultChecked={theme === t} className="size-5 accent-foreground" />
              <span className="font-medium">{t === "dark" ? "Dark" : "Light"}</span>
            </label>
          ))}
        </fieldset>
        <FormError>{state.error}</FormError>
        <SaveButton pending={pending}>Save website theme</SaveButton>
      </Form>
    </Card>
  );
}
