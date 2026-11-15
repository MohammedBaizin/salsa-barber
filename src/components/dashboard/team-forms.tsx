"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, Check, Copy, KeyRound, Power, ShieldCheck, Trash2, UserCog, UserPlus, X } from "lucide-react";
import {
  addTimeOff, changeRole, createPerson, deleteAccount, removePhoto, removeTimeOff, resetPassword, resetTwoStep, saveHours, savePhoto, saveProfile,
  saveServices, setActive,
} from "@/app/(staff)/dashboard/team/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { WeeklyHours } from "@/lib/domain/hours";
import { initials, ROLE_LABELS, USERNAME_RULE, type Role } from "@/lib/domain/team";
import { addDays, dateKey, formatDay } from "@/lib/domain/time";
import { PHOTO_ACCEPT } from "@/lib/images/shrink";
import { cn } from "@/lib/utils";
import { Card, ConfirmBar, Field, Form, FormError, SaveButton, useSave, WeeklyHoursFields } from "./form-parts";
import { formWithPhoto, usePhotoPick } from "./photo-pick";
import { Sheet, SheetActions } from "./sheet";

/**
 * On/off setting as a row: title and hint on the left, a switch on the right. It's a real checkbox (styled as a
 * switch), so forms, labels and keyboard work as usual.
 */
function Toggle({ name, label, hint, defaultChecked, disabled }: { name: string; label: string; hint?: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label
      className={cn(
        "flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border bg-background/50 px-4 py-3 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/[0.06]",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground/30 transition-colors outline-none before:absolute before:top-1 before:left-1 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-5 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed motion-reduce:before:transition-none"
      />
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
    <Card title="Profile" description="How they appear in the dashboard and on the website.">
      <Form onSubmit={submit} className="space-y-5">
        <input type="hidden" name="id" value={member.id} />
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="p-name" error={state.fields.displayName}>
              <Input id="p-name" name="displayName" defaultValue={member.name} maxLength={60} />
            </Field>
            <Field label="Title" htmlFor="p-title" hint="e.g. Barber, Senior barber" error={state.fields.title}>
              <Input id="p-title" name="title" defaultValue={member.title ?? ""} maxLength={60} />
            </Field>
          </div>
          <Field label="Bio (website)" htmlFor="p-bio" hint="A line or two customers see on the website." error={state.fields.bio}>
            <textarea
              id="p-bio"
              name="bio"
              defaultValue={member.bio ?? ""}
              maxLength={600}
              rows={3}
              className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Visibility</p>
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
          </div>
        </fieldset>
        <FormError>{state.error}</FormError>
        {readOnly ? null : <SaveButton pending={pending} />}
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Profile header with the photo (changed right here: tap the camera, then Save photo)
// ---------------------------------------------------------------------------

function StatusPill({ on, children, tone = "on" }: { on: boolean; children: string; tone?: "on" | "off" }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 text-xs font-semibold text-white/85">
      <span aria-hidden className={cn("size-1.5 rounded-full", tone === "off" ? "bg-destructive" : on ? "bg-status-done-foreground" : "bg-white/30")} />
      {children}
    </span>
  );
}

export function MemberHeader({
  member,
  isSelf,
  readOnly,
}: {
  member: { id: string; name: string; username: string; role: Role; title: string | null; photoUrl: string | null; bookable: boolean; showOnSite: boolean; active: boolean };
  isSelf: boolean;
  readOnly: boolean;
}) {
  const pick = usePhotoPick();
  const upload = useSave(savePhoto, () => pick.clear());
  const remove = useSave(removePhoto);
  const shown = pick.picked?.url ?? member.photoUrl;
  const fieldError = pick.error ?? upload.state.fields.photo;
  const canPhoto = !readOnly && member.role !== "admin";
  const status = pick.optimising ? "Optimising…" : (fieldError ?? (pick.picked ? `Ready: ${pick.picked.note}` : null));

  return (
    <section
      aria-label="Profile summary"
      className="dark relative isolate overflow-hidden rounded-[1.75rem] border border-white/10 bg-background p-5 text-foreground shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)] sm:p-6"
    >
      <div aria-hidden className="glow-spot absolute -top-32 -right-20 -z-10 size-80 opacity-90" />
      <Form onSubmit={(e) => upload.send(formWithPhoto(e, pick.picked))} className="flex items-center gap-4 sm:gap-5">
        <input type="hidden" name="id" value={member.id} />
        <div className="relative w-fit shrink-0">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview (blob:) or the saved photo
            <img src={shown} alt={member.name} className="size-20 rounded-3xl border border-white/10 object-cover sm:size-28" data-testid="team-photo" />
          ) : (
            <span
              aria-hidden
              className="inline-flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary),black_30%)] font-heading text-2xl font-extrabold text-primary-foreground sm:size-28 sm:text-3xl"
            >
              {initials(member.name)}
            </span>
          )}
          {canPhoto ? (
            <label
              htmlFor="photo-file"
              className="absolute -right-2 -bottom-2 inline-flex size-10 cursor-pointer sm:size-11 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/60"
            >
              <Camera aria-hidden className="size-4" />
              <span className="sr-only">Choose a photo</span>
              <input
                id="photo-file"
                type="file"
                accept={PHOTO_ACCEPT}
                onChange={(e) => void pick.pick(e.target.files?.[0])}
                aria-describedby="photo-file-status"
                aria-invalid={fieldError ? true : undefined}
                className="sr-only"
              />
            </label>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl leading-tight font-extrabold tracking-tight sm:text-[2rem]">{member.name}</h1>
          <p className="mt-0.5 text-sm text-white/70">
            {ROLE_LABELS[member.role]}
            {member.title && member.title !== ROLE_LABELS[member.role] ? ` · ${member.title}` : ""}
            {member.username ? ` · @${member.username}` : ""}
            {isSelf ? " · you" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!member.active ? (
              <StatusPill on tone="off">
                Switched off
              </StatusPill>
            ) : member.role === "admin" ? (
              <StatusPill on={false}>Support account</StatusPill>
            ) : (
              <>
                <StatusPill on={member.bookable}>{member.bookable ? "Takes bookings" : "No bookings"}</StatusPill>
                <StatusPill on={member.showOnSite}>{member.showOnSite ? "On the website" : "Hidden from website"}</StatusPill>
              </>
            )}
          </div>

          {canPhoto ? (
            <div className="mt-4 space-y-2">
              <p id="photo-file-status" aria-live="polite" className={cn("text-sm empty:hidden", fieldError ? "font-medium text-destructive" : "text-white/70")}>
                {status ?? (member.photoUrl ? "" : "No photo yet: tap the camera to add one.")}
              </p>
              <div className="flex flex-wrap gap-2 empty:hidden">
                {pick.picked || pick.optimising ? (
                  <>
                    <Button type="submit" variant="pop" size="sm" disabled={upload.pending || pick.optimising || !pick.picked}>
                      <Check aria-hidden />
                      {upload.pending ? "Uploading…" : "Save photo"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => pick.clear()} disabled={upload.pending}>
                      <X aria-hidden />
                      Cancel
                    </Button>
                  </>
                ) : member.photoUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
            </div>
          ) : null}
        </div>
      </Form>
      <FormError>{upload.state.error ?? remove.state.error}</FormError>
    </section>
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
  const [chosen, setChosen] = useState(() => new Set(selected));
  const toggle = (id: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <Card title="Services" description="What they can be booked for.">
      <Form onSubmit={submit} className="space-y-4">
        <input type="hidden" name="id" value={memberId} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {chosen.size} of {services.length} selected
          </p>
          {readOnly ? null : (
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(new Set(services.map((s) => s.id)))}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
        <fieldset disabled={readOnly} className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Services they do</legend>
          {services.map((s) => (
            <label
              key={s.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border bg-background/50 px-3.5 py-2.5 transition-colors has-[:checked]:border-primary/60 has-[:checked]:bg-primary/[0.08] has-[:disabled]:cursor-default"
            >
              <input
                type="checkbox"
                name="service"
                value={s.id}
                checked={chosen.has(s.id)}
                onChange={(e) => toggle(s.id, e.target.checked)}
                className="size-5 shrink-0 accent-[var(--primary)]"
              />
              <span className="min-w-0 text-sm font-medium">
                {s.name}
                {s.active ? "" : <span className="font-normal text-muted-foreground"> (switched off)</span>}
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
        <ul className="space-y-2" data-testid="time-off-list">
          {entries.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-background/50 py-2 pr-2 pl-4">
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
        <p className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No time off booked.</p>
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

/** One account setting: icon, title and explanation, with its control below. */
function AccountRow({ icon: Icon, title, children, description }: { icon: typeof KeyRound; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-link">
        <Icon className="size-[1.125rem]" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

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
    <div className="space-y-5">
      <Card title="Account" description={<>Signs in as <strong>{member.username}</strong> (the username can&apos;t be changed).</>}>
        <div className="divide-y">
          <AccountRow
            icon={UserCog}
            title="Role"
            description={can.changeRole ? "What they can see and change in the dashboard." : <>{ROLE_LABELS[member.role]}</>}
          >
            {can.changeRole ? (
              <Form onSubmit={role.submit} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={member.id} />
                <Field label="Role" htmlFor="acc-role" className="min-w-40 flex-1 sm:flex-none">
                  <NativeSelect id="acc-role" name="role" defaultValue={member.role} className="w-full">
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
            ) : null}
          </AccountRow>

          {can.resetPassword ? (
            <AccountRow icon={KeyRound} title="Password" description="Gives them a new one-time password and signs them out everywhere.">
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
            </AccountRow>
          ) : null}

          {can.reset2fa ? (
            <AccountRow
              icon={ShieldCheck}
              title="Two-step sign-in"
              description={<span data-testid="member-two-step">{twoStepOn ? "On: they enter a code from an authenticator app after their password." : "Off."}</span>}
            >
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
            </AccountRow>
          ) : null}

          {can.switchOff ? (
            <AccountRow
              icon={Power}
              title={member.active ? "Switch off" : "Switched off"}
              description={
                member.active
                  ? "They can't sign in and aren't offered for bookings or shown on the website. Their history stays."
                  : "They can't sign in. Switch them back on to restore their access."
              }
            >
              {switchArmed ? (
                <p role="alert" className="rounded-2xl border border-status-request-foreground/40 bg-status-request p-3 text-sm text-status-request-foreground">
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
            </AccountRow>
          ) : null}
        </div>
        <FormError>{role.state.error ?? reset.state.error ?? reset2fa.state.error ?? active.state.error}</FormError>
      </Card>

      {can.switchOff ? (
        <section aria-labelledby="danger-heading" className="space-y-3 rounded-3xl border border-destructive/40 bg-destructive/[0.04] p-5 sm:p-7">
          <div>
            <h2 id="danger-heading" className="font-heading text-xl font-bold tracking-tight text-destructive">
              Danger zone
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deleting removes their login for good. If they have past bookings, their name stays on those for the records.
            </p>
          </div>
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
              <Button type="button" variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setConfirm("delete")}>
                <Trash2 aria-hidden />
                Delete account
              </Button>
            )
          ) : (
            <p className="text-sm font-medium" data-testid="delete-blocked">
              {member.name} has {upcomingBookings === 1 ? "1 upcoming booking" : `${upcomingBookings} upcoming bookings`}. Move or cancel{" "}
              {upcomingBookings === 1 ? "it" : "them"} before deleting the account.
            </p>
          )}
          <FormError>{remove.state.error}</FormError>
        </section>
      ) : null}
    </div>
  );
}
