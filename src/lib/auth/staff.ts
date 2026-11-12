import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/domain/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

export type Staff = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  bookable: boolean;
};

export type StaffCheck =
  | { state: "ok"; staff: Staff }
  | { state: "signed_out" }
  | { state: "switched_off" }
  | { state: "needs_2fa" };

/**
 * Reads and verifies the session once per request:
 * - the user comes from Supabase Auth (getUser() asks the Auth server, so ended sessions and deleted logins fail);
 * - the staff row is read with the secret key, so switched-off and deleted accounts are recognised;
 * - two_factor_ok() decides whether the second step is still needed.
 * Not cached across requests on purpose: switching someone off must take effect on their next click.
 */
export const checkStaff = cache(async (): Promise<StaffCheck> => {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { state: "signed_out" };

  const { data: row } = await createAdminClient()
    .from("staff")
    .select("id, user_id, username, display_name, role, bookable, active, deleted_at")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row || !row.username) return { state: "switched_off" };
  if (!row.active || row.deleted_at) return { state: "switched_off" };

  const { data: twoFactorOk } = await supabase.rpc("two_factor_ok");
  if (twoFactorOk !== true) return { state: "needs_2fa" };

  return {
    state: "ok",
    staff: {
      id: row.id,
      userId: data.user.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role as Role,
      bookable: row.bookable,
    },
  };
});

/**
 * Guard for every dashboard page, server action and route handler.
 * Signed out -> /login · switched off -> signed out with a message · second step missing -> /login/2fa ·
 * wrong role -> 404 (doesn't reveal that the page exists).
 */
export async function requireStaff(roles?: readonly Role[]): Promise<Staff> {
  const check = await checkStaff();
  switch (check.state) {
    case "signed_out":
      redirect("/login");
    case "switched_off":
      redirect("/auth/signout?reason=switched_off");
    case "needs_2fa":
      redirect("/login/2fa");
    case "ok":
      if (roles && !roles.includes(check.staff.role)) notFound();
      return check.staff;
  }
}
