import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PasswordForm, ThemeChoice, TwoStepCard } from "@/components/dashboard/account-forms";
import { AlertsCard } from "@/components/dashboard/push";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { requireStaff } from "@/lib/auth/staff";
import { loadMember } from "@/lib/dashboard/team";
import { groupWeeklyHours, hasAnyHours } from "@/lib/domain/hours";
import { ROLE_LABELS } from "@/lib/domain/team";
import { formatDay } from "@/lib/domain/time";
import { vapidKeys } from "@/lib/push/server";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

async function Account() {
  const staff = await requireStaff();
  const supabase = await createSessionClient();
  const [me, { data: factors }] = await Promise.all([loadMember(staff, staff.id), supabase.auth.mfa.listFactors()]);
  const twoStepOn = Boolean(factors?.totp.some((f) => f.status === "verified"));
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-h2 font-extrabold">Account</h1>
        <p className="mt-1 text-muted-foreground">
          {staff.displayName} · {ROLE_LABELS[staff.role]} · username {staff.username}
        </p>
      </div>

      {me && staff.role !== "admin" ? (
        <>
          <section aria-labelledby="hours-heading" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6">
            <h2 id="hours-heading" className="text-h3 font-bold">
              Your working hours
            </h2>
            {hasAnyHours(me.member.weeklyHours) ? (
              <dl className="divide-y" data-testid="my-hours">
                {groupWeeklyHours(me.member.weeklyHours).map((g) => (
                  <div key={g.days} className="flex justify-between gap-4 py-2">
                    <dt className="font-medium">{g.days}</dt>
                    <dd className={g.closed ? "text-muted-foreground" : ""}>{g.closed ? "Not working" : g.hours}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground">No working hours set yet.</p>
            )}
            <h3 className="pt-2 font-semibold">Time off</h3>
            {me.timeOff.length ? (
              <ul className="space-y-1" data-testid="my-time-off">
                {me.timeOff.map((t) => (
                  <li key={t.id}>
                    {t.startsOn === t.endsOn ? formatDay(t.startsOn) : `${formatDay(t.startsOn)} – ${formatDay(t.endsOn)}`}
                    {t.reason ? <span className="text-muted-foreground"> · {t.reason}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">None booked.</p>
            )}
            <p className="text-sm text-muted-foreground">
              {staff.role === "barber"
                ? "Ask the owner to change your hours or book time off."
                : "Change these on your profile in Team."}
            </p>
            {staff.role !== "barber" ? (
              <Link href={`/dashboard/team/${staff.id}?tab=schedule`} className="inline-flex min-h-11 items-center text-link underline underline-offset-4">
                Edit in Team
              </Link>
            ) : null}
          </section>
        </>
      ) : null}

      <PasswordForm username={staff.username} name={staff.displayName} />
      <TwoStepCard key={twoStepOn ? "on" : "off"} on={twoStepOn} />
      <AlertsCard pushKey={vapidKeys()?.publicKey ?? null} />
      <ThemeChoice />

      <Link href="/dashboard/services" className="inline-flex min-h-11 items-center text-link underline underline-offset-4">
        Services and prices
      </Link>
    </div>
  );
}

/** Password, two-step sign-in, booking alerts on this device, theme, own hours and time off. */
export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}
