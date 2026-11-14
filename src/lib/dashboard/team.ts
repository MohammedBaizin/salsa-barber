import "server-only";
import type { Staff } from "@/lib/auth/staff";
import type { WeeklyHours } from "@/lib/domain/hours";
import { weeklyHoursSchema } from "@/lib/domain/hours-schema";
import {
  canChangeRole, canDelete, canEditPerson, canReset2fa, canResetPassword, canSwitchOff, creatableRoles, type Role,
} from "@/lib/domain/team";
import { dateKey } from "@/lib/domain/time";
import { storageUrl } from "@/lib/site-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

/** Team queries through the signed-in person's session (RLS: admin accounts are only visible to admins). */

export type TeamMember = {
  id: string;
  username: string;
  name: string;
  role: Role;
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  bookable: boolean;
  showOnSite: boolean;
  active: boolean;
  weeklyHours: WeeklyHours;
};

type Row = {
  id: string; username: string | null; display_name: string; role: string; title: string | null; bio: string | null;
  photo_path: string | null; bookable: boolean; show_on_site: boolean; active: boolean; weekly_hours: unknown;
};

const COLUMNS = "id, username, display_name, role, title, bio, photo_path, bookable, show_on_site, active, weekly_hours, sort";

function toMember(r: Row): TeamMember {
  return {
    id: r.id,
    username: r.username ?? "",
    name: r.display_name,
    role: r.role as Role,
    title: r.title,
    bio: r.bio,
    photoUrl: r.photo_path ? storageUrl("team", r.photo_path) : null,
    photoPath: r.photo_path,
    bookable: r.bookable,
    showOnSite: r.show_on_site,
    active: r.active,
    weeklyHours: weeklyHoursSchema.safeParse(r.weekly_hours).data ?? {},
  };
}

export async function loadTeam(staff: Staff): Promise<{ members: TeamMember[]; creatable: Role[] }> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("staff")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("active", { ascending: false })
    .order("sort")
    .order("display_name");
  if (error) throw new Error(`Couldn't load the team: ${error.message}`);
  return { members: (data ?? []).map(toMember), creatable: creatableRoles(staff) };
}

export type MemberPage = {
  member: TeamMember;
  services: { id: string; name: string; active: boolean }[];
  serviceIds: string[];
  timeOff: { id: string; startsOn: string; endsOn: string; reason: string | null }[];
  upcomingBookings: number;
  can: { edit: boolean; resetPassword: boolean; reset2fa: boolean; switchOff: boolean; delete: boolean; changeRole: boolean };
  /** Whether they use two-step sign-in (only looked up for admins, who can reset it). */
  twoStepOn: boolean;
  isSelf: boolean;
};

/** One person (null when not visible). */
export async function loadMember(staff: Staff, id: string): Promise<MemberPage | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("staff").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Couldn't load this person: ${error.message}`);
  if (!data) return null;
  const member = toMember(data);
  const today = dateKey(new Date());

  const [services, links, timeOff, upcoming] = await Promise.all([
    supabase.from("services").select("id, name, active").order("sort").order("name"),
    supabase.from("staff_services").select("service_id").eq("staff_id", id),
    supabase.from("time_off").select("id, starts_on, ends_on, reason").eq("staff_id", id).gte("ends_on", today).order("starts_on"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", id)
      .in("status", ["pending", "confirmed"])
      .gt("ends_at", new Date().toISOString()),
  ]);
  for (const r of [services, links, timeOff]) if (r.error) throw new Error(`Couldn't load this person: ${r.error.message}`);

  const actor = { id: staff.id, role: staff.role };
  const target = { id: member.id, role: member.role };
  const count = upcoming.count ?? 0;
  const reset2fa = canReset2fa(actor, target);
  let twoStepOn = false;
  if (reset2fa) {
    const admin = createAdminClient();
    const { data: login } = await admin.from("staff").select("user_id").eq("id", member.id).maybeSingle();
    if (login?.user_id) {
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: login.user_id });
      twoStepOn = Boolean(data?.factors.some((f) => f.status === "verified"));
    }
  }
  return {
    member,
    services: services.data ?? [],
    serviceIds: (links.data ?? []).map((l) => l.service_id),
    timeOff: (timeOff.data ?? []).map((t) => ({ id: t.id, startsOn: t.starts_on, endsOn: t.ends_on, reason: t.reason })),
    upcomingBookings: count,
    can: {
      edit: canEditPerson(actor, target),
      resetPassword: canResetPassword(actor, target),
      reset2fa,
      switchOff: canSwitchOff(actor, target),
      delete: canDelete(actor, target, count),
      changeRole: canChangeRole(actor, target),
    },
    twoStepOn,
    isSelf: staff.id === member.id,
  };
}
