"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, THEME_STORAGE_KEYS, type PublicTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function currentTheme(): PublicTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Public site light/dark toggle. Shows the theme actually applied (set before paint by the inline script).
 * Server render shows nothing theme-specific to avoid a mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<PublicTheme | null>(subscribe, currentTheme, () => null);
  const next: PublicTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme("site", next);
        try {
          localStorage.setItem(THEME_STORAGE_KEYS.site, next);
        } catch {
          // Private mode: the choice lasts for this page only.
        }
      }}
      aria-label={theme ? `Switch to ${next} theme` : "Switch theme"}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      {theme === "dark" ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
