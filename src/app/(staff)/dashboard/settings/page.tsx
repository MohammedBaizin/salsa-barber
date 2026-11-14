import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingLabel, Skeleton } from "@/components/dashboard/skeleton";
import {
  BookingRulesForm, ClosedDaysForm, GoogleForm, OnlineBookingForm, OpeningHoursForm, WebsiteNotesForm, WebsiteThemeForm,
} from "@/components/dashboard/settings-forms";
import { requireStaff } from "@/lib/auth/staff";
import type { WeeklyHours } from "@/lib/domain/hours";
import { SETTINGS_SECTIONS } from "@/lib/domain/settings";
import { dateKey } from "@/lib/domain/time";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

async function Settings() {
  await requireStaff(["owner", "admin"]);
  await connection();
  const today = dateKey(new Date());
  const supabase = await createSessionClient();
  const [settings, closures] = await Promise.all([
    supabase
      .from("settings")
      .select(
        "shop_hours, online_booking, min_notice_minutes, booking_window_days, due_back_weeks, max_open_requests, change_cutoff_minutes, google_rating, google_review_count, google_review_url, public_theme, walk_in_text, discount_text",
      )
      .eq("id", 1)
      .single(),
    supabase.from("closures").select("id, closed_on, reason").gte("closed_on", today).order("closed_on"),
  ]);
  if (settings.error) throw new Error(`Couldn't load settings: ${settings.error.message}`);
  if (closures.error) throw new Error(`Couldn't load closed days: ${closures.error.message}`);
  const s = settings.data;
  // Each card is keyed by its own saved values: after a save it shows what was stored, without touching
  // unsaved edits in the other cards.
  const key = (name: string, values: unknown) => `${name}:${JSON.stringify(values)}`;
  const rules = {
    minNoticeMinutes: s.min_notice_minutes,
    bookingWindowDays: s.booking_window_days,
    dueBackWeeks: s.due_back_weeks,
    maxOpenRequests: s.max_open_requests,
    changeCutoffMinutes: s.change_cutoff_minutes,
  };
  const google = { rating: s.google_rating, count: s.google_review_count, url: s.google_review_url };
  const notes = { walkInText: s.walk_in_text, discountText: s.discount_text };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-h2 font-extrabold">Settings</h1>
      <nav aria-label="Jump to" className="-mx-4 overflow-x-auto px-4 pb-1 lg:hidden">
        <ul className="flex gap-1">
          {SETTINGS_SECTIONS.map((section) => (
            <li key={section.id} className="shrink-0">
              <a href={`#${section.id}`} className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <OnlineBookingForm key={key("online", s.online_booking)} on={s.online_booking} />
      <OpeningHoursForm key={key("hours", s.shop_hours)} hours={s.shop_hours as WeeklyHours} />
      <ClosedDaysForm closures={closures.data.map((c) => ({ id: c.id, date: c.closed_on, reason: c.reason }))} />
      <BookingRulesForm key={key("rules", rules)} rules={rules} />
      <GoogleForm key={key("google", google)} google={google} />
      <WebsiteNotesForm key={key("notes", notes)} notes={notes} />
      <WebsiteThemeForm key={key("theme", s.public_theme)} theme={s.public_theme === "light" ? "light" : "dark"} />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="max-w-2xl space-y-5">
      <LoadingLabel>Loading settings…</LoadingLabel>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[30rem]" />
      <Skeleton className="h-64" />
    </div>
  );
}

/** Built in phase 11. */
export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings />
    </Suspense>
  );
}
