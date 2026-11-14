"use client";

import { useEffect, useState } from "react";

/**
 * The sticky <header>. Sets data-scrolled once the page moves, so the bar can turn from a clear, full-width row
 * into a narrower floating glass pill (styled with group-data-[scrolled=true]/header: in SiteHeader).
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="group/header sticky top-0 z-40 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3"
    >
      {children}
    </header>
  );
}
