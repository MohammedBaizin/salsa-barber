import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { ToastHost } from "@/components/dashboard/form-parts";
import { HeaderBar, HeaderSkeleton } from "@/components/dashboard/header";
import { NotificationsBar } from "@/components/dashboard/push";
import { SideNav, TabBar } from "@/components/dashboard/nav";
import { Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { navItems } from "@/lib/dashboard/nav";
import { vapidKeys } from "@/lib/push/server";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: `%s · ${site.shortName} Dashboard` },
  robots: { index: false, follow: false },
  // Installable staff app (staff pages only): Add to Home Screen opens the dashboard full screen.
  manifest: "/dashboard.webmanifest",
  appleWebApp: { capable: true, title: `${site.shortName} Dashboard`, statusBarStyle: "default" },
};

// Android: the keyboard resizes the page, so sheets and sticky buttons stay visible above it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

async function RoleSideNav() {
  const staff = await requireStaff();
  return <SideNav items={navItems(staff.role)} />;
}

/** The notifications bar needs the shop's public alert key (only once signed in). */
async function AlertsBar() {
  await requireStaff();
  return <NotificationsBar pushKey={vapidKeys()?.publicKey ?? null} />;
}

async function RoleTabBar() {
  const staff = await requireStaff();
  return <TabBar items={navItems(staff.role)} />;
}

/**
 * Dashboard shell (spec §8.1): sidebar on desktop, bottom tabs on phones, header with the bell.
 * The frame is static; everything that reads the session streams in behind its own <Suspense>,
 * and every page has its own boundary and skeleton.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* Sidebar: always dark (a .dark island), like the website's footer. */}
      <aside className="dark sticky top-0 hidden h-dvh p-3 pr-0 lg:block">
        <div className="relative isolate flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background text-foreground">
          <div aria-hidden className="glow-spot absolute -top-24 -left-24 -z-10 size-72 opacity-70" />
          <div className="flex items-center gap-3 px-5 pt-6 pb-6">
            <Image src="/brand/badge-disc-160.webp" alt="" width={44} height={44} className="size-11" />
            <span className="leading-tight">
              <span className="block font-heading text-lg font-extrabold tracking-tight">{site.name}</span>
              <span className="block text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">Dashboard</span>
            </span>
          </div>
          <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3">
            <Suspense
              fallback={
                <div className="space-y-2 px-1">
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                </div>
              }
            >
              <RoleSideNav />
            </Suspense>
          </nav>
          <div className="p-3">
            {/* Full page load: the website keeps its own theme. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 text-sm font-semibold transition-colors hover:border-primary/60"
            >
              View website
              <ExternalLink aria-hidden className="size-4 text-muted-foreground" />
            </a>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="glass sticky top-0 z-20 border-b border-border/70 pt-[env(safe-area-inset-top)] text-foreground">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1.5 pr-2 pl-4 lg:px-8">
            <Suspense fallback={<HeaderSkeleton />}>
              <HeaderBar />
            </Suspense>
          </div>
        </header>
        <Suspense fallback={null}>
          <AlertsBar />
        </Suspense>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none lg:px-8 lg:pt-10 lg:pb-12"
        >
          {children}
        </main>
      </div>

      <Suspense fallback={null}>
        <RoleTabBar />
      </Suspense>
      <AutoRefresh />
      <ToastHost />
    </div>
  );
}
