"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, ImageUp, KeyRound, Power, Trash2, UserPlus } from "lucide-react";
import {
  addTimeOff, changeRole, createPerson, deleteAccount, removePhoto, removeTimeOff, resetPassword, resetTwoStep, saveHours, savePhoto, saveProfile,
  saveServices, setActive,
} from "@/app/(staff)/dashboard/team/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { WeeklyHours } from "@/lib/domain/hours";
import { ROLE_LABELS, USERNAME_RULE, type Role } from "@/lib/domain/team";
import { addDays, dateKey, formatDay } from "@/lib/domain/time";
import { PHOTO_ACCEPT } from "@/lib/images/shrink";
import { cn } from "@/lib/utils";
import { Card, ConfirmBar, Field, Form, FormError, SaveButton, useSave, WeeklyHoursFields } from "./form-parts";
import { formWithPhoto, usePhotoPick } from "./photo-pick";
import { Sheet, SheetActions } from "./sheet";

function Toggle({ name, label, hint, defaultChecked, disabled }: { name: string; label: string; hint?: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-11 items-start gap-3", disabled && "opacity-60")}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="mt-1 size-5 shrink-0 accent-foreground" />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Temporary password shown once, with a copy button. */
function PasswordReveal({ password, name }: { password: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border-2 border-foreground p-4" data-testid="temp-password">
      <p className="font-semibold">Temporary password for {name}</p>
      <p className="font-mono text-2xl tracking-wider select-all" data-testid="temp-password-value">
        {password}
      </p>
      <p className="text-sm text-muted-foreground">
        Shown once. Give it to them in person or by message; they can change it on their Account page after signing in.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          } catch {
            // Clipboard blocked: the password is selectable.
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy password"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add a person (owner: barbers; admin: any role)
// ---------------------------------------------------------------------------

export function AddPersonButton({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  if (!roles.length) return null;
  return (
    <>
      <Button
        variant="pop"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <UserPlus aria-hidden />
        {roles.length === 1 ? "Add barber" : "Add person"}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={roles.length === 1 ? "Add a barber" : "Add a person"}>
        {open ? <AddPersonForm key={round} roles={roles} /> : null}
      </Sheet>
    </>
  );
}

function AddPersonForm({ roles }: { roles: Role[] }) {
  const { state, submit, pending } = useSave(createPerson);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>(roles[0]);

  if (state.done?.password) {
    return (
      <div className="space-y-4">
        <PasswordReveal password={state.done.password} name={name} />
        <p className="text-sm">
          Username: <strong>{username.trim().toLowerCase()}</strong>. They start hidden from the website and not taking bookings, with the
          shop&apos;s hours and every service.
        </p>
        <SheetActions>
          <Link href={`/dashboard/team/${state.done.id}`} className={cn(buttonVariants({ variant: "pop" }))}>
            Open their profile
          </Link>
        </SheetActions>
      </div>
    );
  }
  return (
    <Form onSubmit={submit} className="space-y-4">
      <Field label="Name" htmlFor="new-name" error={state.fields.displayName} hint="As shown in the dashboard and on the website.">
        <Input id="new-name" name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
      </Field>
      <Field label="Username" htmlFor="new-username" error={state.fields.username} hint={`For signing in. ${USERNAME_RULE} Can't be changed later.`}>
        <Input
          id="new-username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          aria-describedby="new-username-hint"
        />
      </Field>
      {roles.length > 1 ? (
        <Field label="Role" htmlFor="new-role">
          <NativeSelect id="new-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full">
            {roles.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {ROLE_LABELS[r]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <input type="hidden" name="role" value={roles[0]} />
      )}
      <FormError>{state.error}</FormError>
      <SheetActions>
        <SaveButton pending={pending}>Create account</SaveButton>
      </SheetActions>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function ProfileForm({
  member,
  readOnly,
}: {
  member: { id: string; name: string; title: string | null; bio: string | null; bookable: boolean; showOnSite: boolean; role: Role };
  readOnly: boolean;
}) {
  const { state, submit, pending } = useSave(saveProfile);
  const isAdmin = member.role === "admin";
  return (
    <Card title="Profile">
      <Form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="id" value={member.id} />
        <fieldset disabled={readOnly} className="space-y-4">
          <Field label="Name" htmlFor="p-name" error={state.fields.displayName}>
            <Input id="p-name" name="displayName" defaultValue={member.name} maxLength={60} />
          </Field>
          <Field label="Title" htmlFor="p-title" hint="e.g. Barber, Senior barber" error={state.fields.title}>
            <Input id="p-title" name="title" defaultValue={member.title ?? ""} maxLength={60} />
          </Field>
          <Field label="Bio (website)" htmlFor="p-bio" error={state.fields.bio}>
            <textarea
              id="p-bio"
              name="bio"
              defaultValue={member.bio ?? ""}
              maxLength={600}
              rows={4}
              className="w-full rounded-lg border border-input bg-card px-3.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          </Field>
          <Toggle
            name="bookable"
            label="Takes bookings"
            hint={isAdmin ? "The admin account never takes bookings." : "Customers can book them online; staff can book them in."}
            defaultChecked={member.bookable}
            disabled={isAdmin}
          />
          <Toggle
            name="showOnSite"
            label="Show on the website"
            hint={isAdmin ? "The admin account is never shown." : "Name, title, bio and photo in the team section."}
            defaultChecked={member.showOnSite}
            disabled={isAdmin}
          />
        </fieldset>
        <FormError>{state.error}</FormError>
        {readOnly ? null : <SaveButton pending={pending} />}
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

export function PhotoForm({ member, readOnly }: { member: { id: string; name: string; photoUrl: string | null }; readOnly: boolean }) {
  const pick = usePhotoPick();
  const upload = useSave(savePhoto, () => pick.clear());
  const remove = useSave(removePhoto);
  const shown = pick.picked?.url ?? member.photoUrl;
  const fieldError = pick.error ?? upload.state.fields.photo;
  return (
    <Card title="Photo" description="Square photos work best. Saved as a small WebP with location and camera details removed.">
      <div className="flex flex-wrap items-center gap-4">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview (blob:) or the saved photo
          <img src={shown} alt={`${member.name}`} className="size-28 rounded-2xl border object-cover" data-testid="team-photo" />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">No photo</div>
        )}
        {readOnly ? null : (
          <Form onSubmit={(e) => upload.send(formWithPhoto(e, pick.picked))} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={member.id} />
            <label htmlFor="photo-file" className="text-sm font-medium">
              Choose a photo
            </label>
            <input
              id="photo-file"
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={(e) => void pick.pick(e.target.files?.[0])}
              aria-describedby="photo-file-status"
              aria-invalid={fieldError ? true : undefined}
              className="max-w-64 text-sm file:mr-3 file:h-11 file:rounded-lg file:border-2 file:border-foreground file:bg-transparent file:px-4 file:font-semibold"
            />
            <p id="photo-file-status" aria-live="polite" className={cn("text-sm", fieldError ? "font-medium text-destructive" : "text-muted-foreground")}>
              {pick.optimising ? "Optimising…" : (fieldError ?? (pick.picked ? `Ready: ${pick.picked.note}` : "JPEG, PNG, WebP or iPhone photos."))}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="pop" disabled={upload.pending || pick.optimising || !pick.picked}>
                <ImageUp aria-hidden />
                {upload.pending ? "Uploading…" : "Save photo"}
              </Button>
              {member.photoUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={remove.pending}
                  onClick={() => {
                    const data = new FormData();
                    data.set("id", member.id);
                    pick.clear();
                    remove.send(data);
                  }}
                >
                  <Trash2 aria-hidden />
                  Remove photo
                </Button>
              ) : null}
            </div>
          </Form>
        )}
      </div>
      <FormError>{upload.state.error ?? remove.state.error}</FormError>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function ServicesForm({
  memberId,
  services,
  selected,
  readOnly,
}: {
  memberId: string;
  services: { id: string; name: string; active: boolean }[];
  selected: string[];
  readOnly: boolean;
}) {
  const { state, submit, pending } = useSave(saveServices);
  return (
    <Card title="Services" description="What they can be booked for.">
      <Form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="id" value={memberId} />
        <fieldset disabled={readOnly} className="grid gap-1 sm:grid-cols-2">
          <legend className="sr-only">Services they do</legend>
          {services.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="service" value={s.id} defaultChecked={selected.includes(s.id)} className="size-5 accent-foreground" />
              <span>
                {s.name}
                {s.active ? "" : <span className="text-sm text-muted-foreground"> (switched off)</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <FormError>{state.error}</FormError>
        {readOnly ? null : <SaveButton pending={pending} />}
      </Form>
    </Card>
  );
}

export function HoursForm({ memberId, hours, readOnly }: { memberId: string; hours: WeeklyHours; readOnly: boolean }) {
  const { state, submit, pending } = useSave(saveHours);
  return (
    <Card title="Working hours" description="Online booking only offers times inside these hours (and the shop's).">
      <Form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="id" value={memberId} />
        <WeeklyHoursFields legend="Working hours" offLabel="Not working" hours={hours} errors={state.fields} readOnly={readOnly} />
        <FormError>{state.error}</FormError>
        {readOnly ? null : <SaveButton pending={pending} />}
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export function TimeOffForm({
  memberId,
  entries,
  readOnly,
}: {
  memberId: string;
  entries: { id: string; startsOn: string; endsOn: string; reason: string | null }[];
  readOnly: boolean;
}) {
  const add = useSave(addTimeOff);
  const remove = useSave(removeTimeOff);
  const [today] = useState(() => dateKey(new Date()));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [warnedAt, setWarnedAt] = useState(-1);
  const armed = Boolean(add.state.warning) && warnedAt !== add.state.attempt;

  return (
    <Card title="Time off" description="Whole days. Online booking won't offer these days; existing bookings stay put.">
      {entries.length ? (
        <ul className="divide-y rounded-xl border" data-testid="time-off-list">
          {entries.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">
                  {t.startsOn === t.endsOn ? formatDay(t.startsOn) : `${formatDay(t.startsOn)} – ${formatDay(t.endsOn)}`}
                </span>
                {t.reason ? <span className="block text-sm text-muted-foreground">{t.reason}</span> : null}
              </span>
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={remove.pending}
                  onClick={() => {
                    const data = new FormData();
                    data.set("timeOffId", t.id);
                    remove.send(data);
                  }}
                >
                  <Trash2 aria-hidden />
                  Remove
                  <span className="sr-only">
                    {" "}
                    time off from {formatDay(t.startsOn)}
                  </span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No time off booked.</p>
      )}
      {readOnly ? null : (
        <Form onSubmit={add.submit} onChange={() => setWarnedAt(add.state.attempt)} className="space-y-4">
          <input type="hidden" name="staffId" value={memberId} />
          <input type="hidden" name="anyway" value={armed ? "1" : "0"} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day" htmlFor="off-from" error={add.state.fields.startsOn}>
              <Input
                id="off-from"
                name="startsOn"
                type="date"
                value={from}
                min={today}
                max={addDays(today, 365)}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (e.target.value > to) setTo(e.target.value);
                }}
              />
            </Field>
            <Field label="Last day" htmlFor="off-to" error={add.state.fields.endsOn}>
              <Input id="off-to" name="endsOn" type="date" value={to} min={from} max={addDays(today, 365)} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason (optional, staff only)" htmlFor="off-reason" error={add.state.fields.reason}>
            <Input id="off-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={100} />
          </Field>
          {armed ? (
            <p role="alert" className="rounded-xl border-2 border-status-request-foreground bg-status-request p-3 text-sm text-status-request-foreground">
              {add.state.warning}
            </p>
          ) : null}
          <FormError>{add.state.error ?? remove.state.error}</FormError>
          <SaveButton pending={add.pending}>{armed ? "Add anyway" : "Add time off"}</SaveButton>
        </Form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Account: role, password, switch off/on, delete
// ---------------------------------------------------------------------------

export function AccountSection({
  member,
  can,
  upcomingBookings,
  twoStepOn,
}: {
  member: { id: string; name: string; username: string; role: Role; active: boolean };
  can: { resetPassword: boolean; reset2fa: boolean; switchOff: boolean; delete: boolean; changeRole: boolean };
  upcomingBookings: number;
  twoStepOn: boolean;
}) {
  const role = useSave(changeRole);
  const reset = useSave(resetPassword);
  const reset2fa = useSave(resetTwoStep);
  const active = useSave(setActive);
  const remove = useSave(deleteAccount);
  const [confirm, setConfirm] = useState<"reset" | "reset2fa" | "delete" | null>(null);
  const [warnedAt, setWarnedAt] = useState(-1);
  const switchArmed = Boolean(active.state.warning) && warnedAt !== active.state.attempt;
  const send = (run: (d: FormData) => void, fields: Record<string, string>) => {
    const data = new FormData();
    data.set("id", member.id);
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    run(data);
  };

  return (
    <Card title="Account" description={<>Username <strong>{member.username}</strong> (can&apos;t be changed).</>}>
      {can.changeRole ? (
        <Form onSubmit={role.submit} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={member.id} />
          <Field label="Role" htmlFor="acc-role">
            <NativeSelect id="acc-role" name="role" defaultValue={member.role} className="min-w-40">
              {(["barber", "owner", "admin"] as const).map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {ROLE_LABELS[r]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" variant="outline" disabled={role.pending}>
            {role.pending ? "Saving…" : "Change role"}
          </Button>
        </Form>
      ) : (
        <p>
          Role: <strong>{ROLE_LABELS[member.role]}</strong>
        </p>
      )}

      {can.resetPassword ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Password</h3>
          {reset.state.done?.password ? (
            <PasswordReveal password={reset.state.done.password} name={member.name} />
          ) : confirm === "reset" ? (
            <ConfirmBar
              question={`Give ${member.name} a new password? They'll be signed out everywhere.`}
              confirmLabel="Reset password"
              pending={reset.pending}
              onKeep={() => setConfirm(null)}
              onConfirm={() => send(reset.send, {})}
            />
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirm("reset")}>
              <KeyRound aria-hidden />
              Reset password
            </Button>
          )}
        </div>
      ) : null}

      {can.reset2fa ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Two-step sign-in</h3>
          <p data-testid="member-two-step">{twoStepOn ? "On: they enter a code from an authenticator app after their password." : "Off."}</p>
          {twoStepOn ? (
            confirm === "reset2fa" ? (
              <ConfirmBar
                question={`Reset two-step sign-in for ${member.name}? Their authenticator app stops working here and they're signed out everywhere. They can set it up again in Account.`}
                confirmLabel="Reset two-step sign-in"
                pending={reset2fa.pending}
                onKeep={() => setConfirm(null)}
                onConfirm={() => {
                  setConfirm(null);
                  send(reset2fa.send, {});
                }}
              />
            ) : (
              <Button type="button" variant="outline" onClick={() => setConfirm("reset2fa")}>
                Reset two-step sign-in
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {can.switchOff ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">{member.active ? "Switch off" : "Switched off"}</h3>
          <p className="text-sm text-muted-foreground">
            {member.active
              ? "They can't sign in and aren't offered for bookings or shown on the website. Their history stays."
              : "They can't sign in. Switch them back on to restore their access."}
          </p>
          {switchArmed ? (
            <p role="alert" className="rounded-xl border-2 border-status-request-foreground bg-status-request p-3 text-sm text-status-request-foreground">
              {active.state.warning}
            </p>
          ) : null}
          <Button
            type="button"
            variant={member.active ? "outline" : "pop"}
            disabled={active.pending}
            onClick={() => {
              setWarnedAt(-1);
              send(active.send, { active: member.active ? "0" : "1", anyway: switchArmed ? "1" : "0" });
            }}
          >
            <Power aria-hidden />
            {member.active ? (switchArmed ? "Switch off anyway" : "Switch off") : "Switch back on"}
          </Button>
        </div>
      ) : null}

      {can.switchOff ? (
        <div className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Delete account</h3>
          {can.delete ? (
            confirm === "delete" ? (
              <ConfirmBar
                question={`Delete ${member.name}'s account for good?`}
                confirmLabel="Delete account"
                pending={remove.pending}
                onKeep={() => setConfirm(null)}
                onConfirm={() => send(remove.send, {})}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Their login is removed. If they have past bookings, their name stays on those for the records.
                </p>
                <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirm("delete")}>
                  <Trash2 aria-hidden />
                  Delete account
                </Button>
              </>
            )
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="delete-blocked">
              {member.name} has {upcomingBookings === 1 ? "1 upcoming booking" : `${upcomingBookings} upcoming bookings`}. Move or cancel{" "}
              {upcomingBookings === 1 ? "it" : "them"} before deleting the account.
            </p>
          )}
        </div>
      ) : null}

      <FormError>{role.state.error ?? reset.state.error ?? reset2fa.state.error ?? active.state.error ?? remove.state.error}</FormError>
    </Card>
  );
}
