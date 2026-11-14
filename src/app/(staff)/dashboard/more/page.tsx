import type { Metadata } from "next";
import { Suspense } from "react";
import { MoreLinks } from "@/components/dashboard/more-links";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { moreItems } from "@/lib/dashboard/nav";

export const metadata: Metadata = { title: "More" };

async function More() {
  const staff = await requireStaff(["owner", "admin"]);
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Manage the shop</p>
      <h1 className="mt-3 text-title font-extrabold">More</h1>
      <MoreLinks items={moreItems(staff.role)} />
      {/* Full page load: the website keeps its own theme. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-6 inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:no-underline">
        View the website
      </a>
    </div>
  );
}

export default function MorePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <More />
    </Suspense>
  );
}
