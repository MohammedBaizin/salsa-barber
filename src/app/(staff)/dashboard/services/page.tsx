import type { Metadata } from "next";
import { Suspense } from "react";
import { ServicesBoard } from "@/components/dashboard/services-board";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { isManager } from "@/lib/domain/team";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Services and prices" };

async function Services() {
  const staff = await requireStaff();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, price_pence, duration_min, active, bookable_days, sort")
    .order("sort")
    .order("name");
  if (error) throw new Error(`Couldn't load services: ${error.message}`);
  const services = (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    pricePence: s.price_pence,
    durationMin: s.duration_min,
    active: s.active,
    days: s.bookable_days,
  }));
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-title font-extrabold">Services and prices</h1>
      {/* Keyed by the data so a refresh after a change resets the optimistic order. */}
      <ServicesBoard key={services.map((s) => `${s.id}:${s.active}`).join()} services={services} canEdit={isManager(staff)} />
    </div>
  );
}

function ServicesSkeleton() {
  return (
    <div className="max-w-3xl space-y-5">
      <LoadingLabel>Loading services…</LoadingLabel>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-[32rem]" />
    </div>
  );
}

/** Built in phase 10. */
export default function ServicesPage() {
  return (
    <Suspense fallback={<ServicesSkeleton />}>
      <Services />
    </Suspense>
  );
}
