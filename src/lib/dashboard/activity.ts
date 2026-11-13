import "server-only";
import { ACTIVITY_PAGE_SIZE, activityTypeFilter, type ActivityParams } from "@/lib/domain/activity";
import { ROLE_LABELS, type Role } from "@/lib/domain/team";
import { createSessionClient } from "@/lib/supabase/server";

/**
 * Activity log (spec §8.9), read through RLS: owners never receive admin entries or admin accounts; admins see
 * everything. Newest first, 50 at a time, "Show older" continues below the last id shown.
 */

export type ActivityEntry = {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string;
  summary: string | null;
  changed: string[] | null;
};

export type ActivityPerson = { id: string; label: string };

export type ActivityData = { entries: ActivityEntry[]; older: number | null; people: ActivityPerson[] };

export async function loadActivity(p: ActivityParams): Promise<ActivityData> {
  const supabase = await createSessionClient();
  let query = supabase
    .from("audit_log")
    .select("id, at, actor_id, actor_name, action, entity, summary, changed")
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE + 1);
  if (p.person) query = query.eq("actor_id", p.person);
  if (p.type) query = query.or(activityTypeFilter(p.type));
  if (p.before) query = query.lt("id", p.before);

  const [log, staff] = await Promise.all([
    query,
    // Everyone who could have done something, including switched-off and deleted people (labelled).
    supabase.from("staff").select("id, display_name, role, active, deleted_at").order("display_name"),
  ]);
  if (log.error) throw new Error(`Couldn't load the activity log: ${log.error.message}`);
  if (staff.error) throw new Error(`Couldn't load the team: ${staff.error.message}`);

  const rows = log.data.slice(0, ACTIVITY_PAGE_SIZE);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      entity: r.entity,
      summary: r.summary,
      changed: r.changed,
    })),
    older: log.data.length > ACTIVITY_PAGE_SIZE ? rows.at(-1)!.id : null,
    people: staff.data.map((s) => ({
      id: s.id,
      label: [
        s.display_name,
        s.role === "barber" ? null : `(${ROLE_LABELS[s.role as Role].toLowerCase()})`,
        s.deleted_at ? "· deleted" : !s.active ? "· switched off" : null,
      ]
        .filter(Boolean)
        .join(" "),
    })),
  };
}
