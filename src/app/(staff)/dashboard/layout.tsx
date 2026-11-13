import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { ToastHost } from "@/components/dashboard/form-parts";
import { HeaderBar, HeaderSkeleton } from "@/components/dashboard/header";
import { SideNav, TabBar } from "@/components/dashboard/nav";
import { Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { navItems } from "@/lib/dashboard/nav";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: `%s · ${site.shortName} Dashboard` },
  robots: { index: false, follow: false },
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
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Image src="/brand/badge-disc-160.webp" alt="" width={40} height={40} className="size-10" />
          <span className="leading-tight">
            <span className="block font-heading text-lg font-bold">{site.name}</span>
            <span className="block text-sm text-muted-foreground">Dashboard</span>
          </span>
        </div>
        <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3">
          <Suspense
            fallback={
              <div className="space-y-2 px-1">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            }
          >
            <RoleSideNav />
          </Suspense>
        </nav>
        <div className="border-t px-3 py-3">
          {/* Full page load: the website keeps its own theme. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent">
            <ExternalLink aria-hidden className="size-4" />
            View website
          </a>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1 pr-2 pl-4 lg:px-6">
            <Suspense fallback={<HeaderSkeleton />}>
              <HeaderBar />
            </Suspense>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none lg:px-6 lg:pt-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      <Suspense
        fallback={
          <div aria-hidden className="fixed inset-x-0 bottom-0 z-30 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-sidebar lg:hidden" />
        }
      >
        <RoleTabBar />
      </Suspense>
      <AutoRefresh />
      <ToastHost />
    </div>
  );
}
