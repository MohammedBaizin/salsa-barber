"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "./form-parts";

/**
 * Installed-app extras for the dashboard: the service worker (offline screen + alerts), the number on the app icon,
 * and an "Install the app" card.
 */

const SW_SCOPE = "/dashboard";

/** Registers the dashboard's service worker on every dashboard visit, so the offline screen works from day one. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: SW_SCOPE }).catch(() => {});
  }, []);
  return null;
}

/** Shows the number of booking requests waiting on the installed app's icon (where the phone supports it). */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
  }, [count]);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type Device = "checking" | "installed" | "ios" | "other";
const subscribeNothing = () => () => {};

/**
 * "Install the app" card. Android / desktop Chrome: an Install button (the browser's own prompt). iPhone / iPad: the
 * Share → Add to Home Screen steps. Hidden when already running as the installed app, or when the browser can't
 * install it.
 */
export function InstallAppCard() {
  const device = useSyncExternalStore<Device>(
    subscribeNothing,
    () => (isStandalone() ? "installed" : isIos() ? "ios" : "other"),
    () => "checking",
  );
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (device === "checking" || device === "installed" || installed) return null;
  if (device === "other" && !prompt) return null;

  return (
    <Card
      id="install-app"
      title="Install the app"
      description="Put the dashboard on your Home Screen: it opens full screen like an app, shows how many requests are waiting on its icon, and can send booking alerts."
    >
      {device === "ios" ? (
        <ol className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-link">
              <Share className="size-4" />
            </span>
            <span>
              In Safari, tap <strong>Share</strong> (the square with an arrow).
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-link">
              <SquarePlus className="size-4" />
            </span>
            <span>
              Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Open the dashboard from the new icon.
            </span>
          </li>
        </ol>
      ) : (
        <Button
          variant="pop"
          onClick={async () => {
            if (!prompt) return;
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setPrompt(null);
          }}
        >
          <Download aria-hidden />
          Install the app
        </Button>
      )}
    </Card>
  );
}
