import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/dashboard/avatar";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { AccountSection, HoursForm, PhotoForm, ProfileForm, ServicesForm, TimeOffForm } from "@/components/dashboard/team-forms";
import { requireStaff } from "@/lib/auth/staff";
import { loadMember } from "@/lib/dashboard/team";
import { ROLE_LABELS } from "@/lib/domain/team";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team member" };

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "photo", label: "Photo" },
  { id: "services", label: "Services" },
  { id: "schedule", label: "Schedule" },
  { id: "account", label: "Account" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Member({ params, searchParams }: PageProps<"/dashboard/team/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const data = await loadMember(staff, id);
  if (!data) notFound();
  const { member, can } = data;
  const tabs = TABS.filter((t) => member.role !== "admin" || (t.id !== "services" && t.id !== "photo"));
  const tab: Tab = tabs.find((t) => t.id === search.tab)?.id ?? "profile";
  const readOnly = !can.edit;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/team" className="inline-flex min-h-11 items-center gap-2 text-link underline underline-offset-4 hover:no-underline">
        <ArrowLeft aria-hidden className="size-4" />
        Team
      </Link>
      <div className="flex items-center gap-4">
        <Avatar member={member} size="size-16" />
        <div>
          <h1 className="text-title font-extrabold">{member.name}</h1>
          <p className="text-muted-foreground">
            {ROLE_LABELS[member.role]}
            {member.active ? "" : " · switched off"}
            {data.isSelf ? " · you" : ""}
          </p>
        </div>
      </div>
      {readOnly ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">You can see this profile but not change it.</p>
      ) : null}

      <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.id === "profile" ? `/dashboard/team/${id}` : `/dashboard/team/${id}?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            scroll={false}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold",
              tab === t.id ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="max-w-2xl space-y-5">
        {tab === "profile" ? <ProfileForm member={member} readOnly={readOnly} /> : null}
        {tab === "photo" ? <PhotoForm key={member.photoUrl ?? "none"} member={member} readOnly={readOnly} /> : null}
        {tab === "services" ? <ServicesForm memberId={member.id} services={data.services} selected={data.serviceIds} readOnly={readOnly} /> : null}
        {tab === "schedule" ? (
          <>
            <HoursForm memberId={member.id} hours={member.weeklyHours} readOnly={readOnly} />
            <TimeOffForm memberId={member.id} entries={data.timeOff} readOnly={readOnly} />
          </>
        ) : null}
        {tab === "account" ? (
          data.isSelf ? (
            <p className="rounded-xl border p-4">
              Your own password, theme and sign-in settings are on your{" "}
              <Link href="/dashboard/account" className="text-link underline underline-offset-4">
                Account page
              </Link>
              . Nobody can switch off or delete their own account.
            </p>
          ) : (
            <AccountSection member={member} can={can} upcomingBookings={data.upcomingBookings} twoStepOn={data.twoStepOn} />
          )
        ) : null}
      </div>
    </div>
  );
}

function MemberSkeleton() {
  return (
    <div className="space-y-5">
      <LoadingLabel>Loading…</LoadingLabel>
      <Skeleton className="h-6 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-10 w-56" />
      </div>
      <Skeleton className="h-11 w-96 max-w-full" />
      <Skeleton className="h-80 max-w-2xl" />
    </div>
  );
}

/** Built in phase 9. */
export default function MemberPage(props: PageProps<"/dashboard/team/[id]">) {
  return (
    <Suspense fallback={<MemberSkeleton />}>
      <Member {...props} />
    </Suspense>
  );
}
