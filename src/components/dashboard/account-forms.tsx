"use client";

import { startTransition, useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { Check, Eye, EyeOff, KeyRound, ShieldCheck, ShieldOff, X } from "lucide-react";
import { changePassword, confirmTwoStep, startTwoStep, turnOffTwoStep, type EnrolState } from "@/app/(staff)/dashboard/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safely } from "@/lib/connection";
import { checkPassword, PASSWORD_MAX } from "@/lib/domain/password";
import { applyTheme, isDashboardTheme, THEME_STORAGE_KEYS, type DashboardTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Card, Field, Form, FormError, SaveButton, useSave } from "./form-parts";

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export function PasswordForm({ username, name }: { username: string; name: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const save = useSave(changePassword, () => {
    setCurrent("");
    setPassword("");
    setConfirm("");
  });
  const rules = checkPassword(password, { username, name });
  const f = save.state.fields;
  const type = show ? "text" : "password";
  return (
    <Card id="password" title="Password" description="Other people can't see your password, and the shop can only reset it, not read it.">
      <Form onSubmit={save.submit} className="space-y-4">
        {/* Lets password managers pair the new password with this account. */}
        <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
        <Field label="Current password" htmlFor="pw-current" error={f.current}>
          <Input id="pw-current" name="current" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={f.current ? true : undefined} />
        </Field>
        <Field label="New password" htmlFor="pw-new" error={f.password}>
          <Input
            id="pw-new"
            name="password"
            type={type}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="pw-rules"
            aria-invalid={f.password ? true : undefined}
          />
        </Field>
        <ul id="pw-rules" className="space-y-1 text-sm" aria-label="Password rules">
          {rules.checks.map((c) => (
            <li key={c.id} className={cn("flex items-start gap-2", c.ok ? "text-status-done-foreground" : "text-muted-foreground")}>
              {c.ok ? <Check aria-hidden className="mt-0.5 size-4 shrink-0" /> : <X aria-hidden className="mt-0.5 size-4 shrink-0" />}
              <span>
                {c.label}
                <span className="sr-only">{c.ok ? " (done)" : " (not yet)"}</span>
              </span>
            </li>
          ))}
        </ul>
        <Field label="New password again" htmlFor="pw-confirm" error={f.confirm}>
          <Input id="pw-confirm" name="confirm" type={type} autoComplete="new-password" maxLength={PASSWORD_MAX} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={f.confirm ? true : undefined} />
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5 accent-foreground" />
          {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          <span className="font-medium">Show passwords</span>
        </label>
        <FormError>{save.state.error}</FormError>
        <SaveButton pending={save.pending}>Change password</SaveButton>
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard theme (this device)
// ---------------------------------------------------------------------------

const THEME_EVENT = "dashboard:theme";

function readTheme(): DashboardTheme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEYS.dashboard);
    return isDashboardTheme(v) ? v : "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeChoice() {
  const theme = useSyncExternalStore<DashboardTheme | null>(subscribeTheme, readTheme, () => null);
  // "System" follows the phone's setting, live.
  useEffect(() => {
    if (theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("dashboard", media.matches ? "dark" : "light");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [theme]);

  const choose = (value: DashboardTheme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEYS.dashboard, value);
    } catch {
      // Private mode: lasts for this page only.
    }
    const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    applyTheme("dashboard", dark ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Card id="theme" title="Dashboard theme" description="For this device only. System follows your phone or computer's light/dark setting.">
      <fieldset className="flex flex-wrap gap-2" disabled={theme === null}>
        <legend className="sr-only">Dashboard theme</legend>
        {(["light", "dark", "system"] as const).map((t) => (
          <label
            key={t}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-4 font-semibold",
              theme === t ? "border-foreground bg-secondary text-secondary-foreground" : "border-input hover:bg-muted",
            )}
          >
            <input type="radio" name="dashboard-theme" value={t} checked={theme === t} onChange={() => choose(t)} className="sr-only" />
            {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
          </label>
        ))}
      </fieldset>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Two-step sign-in
// ---------------------------------------------------------------------------

const startSafely = safely(startTwoStep);
const noEnrol: EnrolState = { error: null, factorId: null, qr: null, secret: null, attempt: 0 };

function CodeField({ id, error }: { id: string; error?: string }) {
  return (
    <Field label="6-digit code from the app" htmlFor={id} error={error}>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        className="max-w-48 text-center font-mono text-xl tracking-[0.3em]"
        aria-invalid={error ? true : undefined}
      />
    </Field>
  );
}

export function TwoStepCard({ on }: { on: boolean }) {
  const [enrol, start, starting] = useActionState(startSafely, noEnrol);
  const confirm = useSave(confirmTwoStep);
  const off = useSave(turnOffTwoStep);
  const [turningOff, setTurningOff] = useState(false);

  return (
    <Card
      id="two-step"
      title="Two-step sign-in"
      description="After your password, also enter a code from an authenticator app on your phone (e.g. Google Authenticator, Microsoft Authenticator or 1Password)."
    >
      <p className="flex items-center gap-2 font-semibold" data-testid="two-step-status">
        {on ? <ShieldCheck aria-hidden className="size-5" /> : <ShieldOff aria-hidden className="size-5" />}
        {on ? "On for your account" : "Off"}
      </p>

      {on ? (
        turningOff ? (
          <Form onSubmit={off.submit} className="space-y-4">
            <p>To turn it off, enter a current code from your authenticator app.</p>
            <CodeField id="off-code" error={off.state.fields.code} />
            <FormError>{off.state.fields.code ? null : off.state.error}</FormError>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setTurningOff(false)}>
                Keep it on
              </Button>
              <SaveButton pending={off.pending}>Turn off</SaveButton>
            </div>
          </Form>
        ) : (
          <Button variant="outline" onClick={() => setTurningOff(true)}>
            Turn off two-step sign-in
          </Button>
        )
      ) : enrol.factorId && enrol.qr ? (
        <Form onSubmit={confirm.submit} className="space-y-4">
          <input type="hidden" name="factorId" value={enrol.factorId} />
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Scan this QR code with your authenticator app.
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code (SVG data URL from Supabase Auth) */}
              <img src={enrol.qr} alt="QR code for your authenticator app" className="mt-2 size-48 rounded-lg bg-white p-2" />
            </li>
            <li>
              Can&apos;t scan it? Type this key into the app instead:
              <code className="mt-1 block font-mono text-sm break-all select-all" data-testid="totp-secret">
                {enrol.secret}
              </code>
            </li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <CodeField id="on-code" error={confirm.state.fields.code} />
          <FormError>{confirm.state.fields.code ? null : confirm.state.error}</FormError>
          <SaveButton pending={confirm.pending}>Turn on</SaveButton>
        </Form>
      ) : (
        <>
          {enrol.error ? <FormError>{enrol.error}</FormError> : null}
          <Button variant="pop" disabled={starting} onClick={() => startTransition(() => start())}>
            <KeyRound aria-hidden />
            {starting ? "Getting a key…" : "Set up two-step sign-in"}
          </Button>
        </>
      )}
    </Card>
  );
}
