"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Send, X } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/(staff)/dashboard/push-actions";
import { Button } from "@/components/ui/button";
import { OFFLINE_ERROR } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";
import { Card, notify } from "./form-parts";

/**
 * Booking alerts on this device (spec §8.10, §10, §11). The service worker (/sw.js, scope /dashboard) only shows
 * pushes; nothing is cached. Permission is only ever asked for from a tap.
 */

type Support = "checking" | "unsupported" | "ios-tab" | "ok";
type Device = { support: Support; permission: NotificationPermission | null; endpoint: string | null; standalone: boolean };

const SCOPE = "/dashboard";

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Wait on the registration itself: navigator.serviceWorker.ready never resolves after arriving from /login. */
function register(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: SCOPE });
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** `sync`: re-save this device's subscription (done once per page, by the notifications bar in the layout). */
function usePushDevice(pushKey: string | null, sync = false) {
  const [device, setDevice] = useState<Device>({ support: "checking", permission: null, endpoint: null, standalone: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const standalone = isStandalone();
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        if (!cancelled) setDevice({ support: isIos() && !standalone ? "ios-tab" : "unsupported", permission: null, endpoint: null, standalone });
        return;
      }
      let endpoint: string | null = null;
      try {
        const registration = await register();
        const subscription = await registration.pushManager.getSubscription();
        endpoint = subscription?.endpoint ?? null;
        // Keep the server's copy in step (e.g. after signing out and in again on this device).
        if (sync && subscription && pushKey && Notification.permission === "granted") await savePushSubscription(subscription.toJSON());
      } catch {
        // No service worker (e.g. private mode): alerts just stay off.
      }
      if (!cancelled) setDevice({ support: "ok", permission: Notification.permission, endpoint, standalone });
    })();
    return () => {
      cancelled = true;
    };
  }, [pushKey, sync]);

  const run = useCallback(async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(navigator.onLine === false ? OFFLINE_ERROR : e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOn = () =>
    run(async () => {
      if (!pushKey) return;
      const permission = await Notification.requestPermission();
      setDevice((d) => ({ ...d, permission }));
      if (permission !== "granted") return;
      const registration = await register();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
      const r = await savePushSubscription(subscription.toJSON());
      if (r.error) throw new Error(r.error);
      setDevice((d) => ({ ...d, endpoint: subscription.endpoint }));
      notify("Booking alerts are on for this device.");
    });

  const turnOff = () =>
    run(async () => {
      const registration = await register();
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? device.endpoint;
      await subscription?.unsubscribe();
      if (endpoint) await removePushSubscription(endpoint);
      setDevice((d) => ({ ...d, endpoint: null }));
      notify("Booking alerts are off for this device.");
    });

  const test = () =>
    run(async () => {
      if (!device.endpoint) return;
      const r = await sendTestPush(device.endpoint);
      if (r.error) throw new Error(r.error);
      notify("Test alert sent. It should appear in a few seconds.");
    });

  return { device, busy, error, turnOn, turnOff, test, on: Boolean(device.endpoint) && device.permission === "granted" };
}

function HowToFix() {
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-4">How to fix</summary>
      <div className="space-y-2 pb-2">
        <p>
          <strong>iPhone:</strong> Settings → Notifications → {"“Salsa Dashboard”"} → turn on Allow Notifications. Then come back here and tap Turn on.
        </p>
        <p>
          <strong>Android (Chrome):</strong> tap the lock or settings icon next to the address (or long-press the app icon → App info) → Notifications →
          Allow. Then tap Turn on.
        </p>
        <p>
          <strong>Computer:</strong> click the icon left of the address bar → Notifications → Allow, then reload the page.
        </p>
      </div>
    </details>
  );
}

function AddToHomeScreen() {
  return (
    <p className="text-sm">
      On iPhone, alerts need the dashboard on your Home Screen: tap the Share button in Safari, then <strong>Add to Home Screen</strong>, open it from
      there and sign in. (iOS 16.4 or later.)
    </p>
  );
}

// ---------------------------------------------------------------------------
// Account → Booking alerts on this phone
// ---------------------------------------------------------------------------

export function AlertsCard({ pushKey }: { pushKey: string | null }) {
  const { device, busy, error, turnOn, turnOff, test, on } = usePushDevice(pushKey);
  return (
    <Card
      id="alerts"
      title="Booking alerts on this device"
      description="An alert when a booking request comes in, or a customer changes or cancels. Owners see every booking; barbers see their own. Phone numbers are never shown."
    >
      <div data-testid="alerts-state" className="space-y-3">
        {!pushKey ? (
          <p>Booking alerts aren&apos;t set up for this shop yet. The admin needs to add the alert keys (see the launch guide).</p>
        ) : device.support === "checking" ? (
          <p className="text-muted-foreground">Checking this device…</p>
        ) : device.support === "ios-tab" ? (
          <AddToHomeScreen />
        ) : device.support === "unsupported" ? (
          <p>This browser can&apos;t show booking alerts. Try Chrome, Safari, Firefox or Edge.</p>
        ) : device.permission === "denied" ? (
          <>
            <p className="font-semibold">Alerts are blocked for this site on this device.</p>
            <HowToFix />
          </>
        ) : on ? (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <BellRing aria-hidden className="size-5" /> On for this device
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={test}>
                <Send aria-hidden />
                Send a test
              </Button>
              <Button variant="outline" disabled={busy} onClick={turnOff}>
                <BellOff aria-hidden />
                Turn off
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <BellOff aria-hidden className="size-5" /> Off for this device
            </p>
            <Button variant="pop" disabled={busy} onClick={turnOn}>
              <BellRing aria-hidden />
              {busy ? "Turning on…" : "Turn on booking alerts"}
            </Button>
          </>
        )}
        {error ? (
          <p role="alert" className="rounded-lg border border-destructive px-3 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notifications bar (installed app, and iPhone Safari tabs) until alerts are on
// ---------------------------------------------------------------------------

const NOT_NOW = "salsa-alerts-not-now";

export function NotificationsBar({ pushKey }: { pushKey: string | null }) {
  const { device, busy, error, turnOn, on } = usePushDevice(pushKey, true);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    // Read after hydration (sessionStorage isn't on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a browser-only value
    setHidden(sessionStorage.getItem(NOT_NOW) === "1");
  }, []);

  const relevant = pushKey && !on && (device.standalone || device.support === "ios-tab") && device.support !== "unsupported" && device.support !== "checking";
  if (!relevant || hidden) return null;
  const notNow = () => {
    sessionStorage.setItem(NOT_NOW, "1");
    setHidden(true);
  };
  return (
    <aside aria-label="Booking alerts" className="border-b bg-status-request px-4 py-3 text-status-request-foreground" data-testid="notifications-bar">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <BellRing aria-hidden className="size-5 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          {device.support === "ios-tab" ? (
            <AddToHomeScreen />
          ) : device.permission === "denied" ? (
            <>
              <p className="font-semibold">Booking alerts are blocked on this device.</p>
              <HowToFix />
            </>
          ) : (
            <p className="font-semibold">Get an alert on this phone when a booking request comes in.</p>
          )}
          {error ? <p role="alert" className="font-medium">{error}</p> : null}
        </div>
        <div className="flex gap-2">
          {device.support === "ok" && device.permission !== "denied" ? (
            <Button size="sm" variant="ink" disabled={busy} onClick={turnOn}>
              Turn on
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={notNow}>
            <X aria-hidden />
            Not now
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Today: a one-time offer in browsers that can show alerts
// ---------------------------------------------------------------------------

const OFFERED = "salsa-alerts-offered";

export function AlertsOffer({ pushKey }: { pushKey: string | null }) {
  const { device, busy, error, turnOn, on } = usePushDevice(pushKey);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a browser-only value
    setDismissed(localStorage.getItem(OFFERED) === "1");
  }, []);
  // The installed app has the bar instead; blocked or unsupported browsers aren't offered anything.
  if (!pushKey || dismissed || on || device.standalone || device.support !== "ok" || device.permission !== "default") return null;
  const done = () => {
    localStorage.setItem(OFFERED, "1");
    setDismissed(true);
  };
  return (
    <section aria-label="Booking alerts offer" className={cn("flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed p-4")} data-testid="alerts-offer">
      <BellRing aria-hidden className="size-6 shrink-0" />
      <p className="min-w-0 flex-1">Get an alert on this device when a booking request comes in?</p>
      <div className="flex gap-2">
        <Button
          variant="pop"
          size="sm"
          disabled={busy}
          onClick={async () => {
            await turnOn();
            done();
          }}
        >
          Turn on
        </Button>
        <Button variant="ghost" size="sm" onClick={done}>
          No thanks
        </Button>
      </div>
      {error ? <p role="alert" className="w-full text-sm font-medium text-destructive">{error}</p> : null}
    </section>
  );
}
