import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CalendarDays, Scissors, ShieldCheck, UserRound } from "lucide-react";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import { AccountSection, HoursForm, MemberHeader, ProfileForm, ServicesForm, TimeOffForm } from "@/components/dashboard/team-forms";
import { requireStaff } from "@/lib/auth/staff";
import { loadMember } from "@/lib/dashboard/team";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team member" };

const TABS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "services", label: "Services", icon: Scissors },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "account", label: "Account", icon: ShieldCheck },
] as const;
type Tab = (typeof TABS)[number]["id"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One team member: a profile header (photo changed right there, status at a glance), a pill switcher for the
 * sections, and the section's form below.
 */
async function Member({ params, searchParams }: PageProps<"/dashboard/team/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const data = await loadMember(staff, id);
  if (!data) notFound();
  const { member, can } = data;
  const tabs = TABS.filter((t) => member.role !== "admin" || t.id !== "services");
  const tab: Tab = tabs.find((t) => t.id === search.tab)?.id ?? "profile";
  const readOnly = !can.edit;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/team" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        Team
      </Link>

      <MemberHeader key={member.photoUrl ?? "none"} member={member} isSelf={data.isSelf} readOnly={readOnly} />

      {readOnly ? (
        <p className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">You can see this profile but not change it.</p>
      ) : null}

      <nav aria-label="Sections">
        <div className="flex w-full gap-1 rounded-full border bg-card p-1 shadow-[var(--shadow-soft)] sm:inline-flex sm:w-auto">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id === "profile" ? `/dashboard/team/${id}` : `/dashboard/team/${id}?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              scroll={false}
              className={cn(
                "inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-2 text-[0.8125rem] font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm",
                tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon aria-hidden className="hidden size-4 shrink-0 sm:block" />
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="max-w-2xl space-y-5">
        {tab === "profile" ? <ProfileForm member={member} readOnly={readOnly} /> : null}
        {tab === "services" ? <ServicesForm memberId={member.id} services={data.services} selected={data.serviceIds} readOnly={readOnly} /> : null}
        {tab === "schedule" ? (
          <>
            <HoursForm memberId={member.id} hours={member.weeklyHours} readOnly={readOnly} />
            <TimeOffForm memberId={member.id} entries={data.timeOff} readOnly={readOnly} />
          </>
        ) : null}
        {tab === "account" ? (
          data.isSelf ? (
            <p className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
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
      <Skeleton className="h-40 rounded-[1.75rem]" />
      <Skeleton className="h-12 w-96 max-w-full rounded-full" />
      <Skeleton className="h-80 max-w-2xl rounded-3xl" />
    </div>
  );
}

export default function MemberPage(props: PageProps<"/dashboard/team/[id]">) {
  return (
    <Suspense fallback={<MemberSkeleton />}>
      <Member {...props} />
    </Suspense>
  );
}
