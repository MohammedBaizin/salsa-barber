"use client";

import { useState, useSyncExternalStore } from "react";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";

const CONSENT_KEY = "salsa-map-consent";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readConsent = () => {
  try {
    return localStorage.getItem(CONSENT_KEY) === "yes";
  } catch {
    return false;
  }
};

/**
 * Map card: a styled static preview first. The Google Maps embed loads ONLY after the visitor taps
 * "Show map" (no request to Google before); the choice is remembered on this device.
 */
export function MapCard() {
  const remembered = useSyncExternalStore(subscribe, readConsent, () => false);
  const [shown, setShown] = useState(false);
  const showMap = remembered || shown;
  const { maps, address } = site;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <div className="relative aspect-[4/3] flex-1 bg-muted sm:aspect-[16/10] lg:aspect-auto lg:min-h-80">
        {showMap ? (
          <iframe
            src={maps.embedUrl}
            title={`Map showing ${site.name}`}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            data-testid="map-embed"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center" data-testid="map-preview">
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:28px_28px]"
            />
            <span className="relative inline-flex size-14 items-center justify-center rounded-full bg-highlight text-highlight-foreground shadow-pop">
              <MapPin aria-hidden className="size-7" />
            </span>
            <p className="relative font-semibold">
              {address.street}, {address.area} {address.postcode}
            </p>
            <Button
              type="button"
              variant="ink"
              className="relative"
              onClick={() => {
                setShown(true);
                try {
                  localStorage.setItem(CONSENT_KEY, "yes");
                } catch {
                  // private mode: show it this time only
                }
                listeners.forEach((l) => l());
              }}
            >
              Show map
            </Button>
            <p className="relative max-w-xs text-xs text-muted-foreground">Loads Google Maps, which may set cookies.</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-5 py-2">
        <a href={maps.directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-link underline underline-offset-4 hover:no-underline">
          <Navigation aria-hidden className="size-4" />
          Directions (Google Maps)
        </a>
        <a href={maps.appleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-link underline underline-offset-4 hover:no-underline">
          Open in Apple Maps
        </a>
      </div>
    </div>
  );
}
