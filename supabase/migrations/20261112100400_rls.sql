-- Row level security and grants (spec §7, §9). Source of truth for permissions alongside server-side checks.
--
-- anon          = public website visitors (read public content only; booking RPCs are service-role only)
-- authenticated = signed-in staff; app.my_staff_id()/my_role() decide what they see
-- service_role  = server code with the secret key (bypasses RLS)
--
-- Every public table has a RESTRICTIVE `require_2fa` policy for authenticated users:
-- once someone turns on two-step sign-in, nothing works until their session is aal2.

-- Start from nothing, then grant on purpose.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- The server (secret key) needs full access; it bypasses RLS.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter table public.settings enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.time_off enable row level security;
alter table public.closures enable row level security;
alter table public.clients enable row level security;
alter table public.bookings enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_log enable row level security;
alter table public.request_attempts enable row level security;
alter table public.login_failures enable row level security;
alter table public.push_subscriptions enable row level security;

-- require_2fa on every table (a DB test fails if one is missing).
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'services', 'staff', 'staff_services', 'time_off', 'closures', 'clients', 'bookings',
    'gallery_photos', 'reviews', 'audit_log', 'request_attempts', 'login_failures', 'push_subscriptions'
  ] loop
    execute format(
      'create policy require_2fa on public.%I as restrictive for all to authenticated using (app.mfa_ok()) with check (app.mfa_ok())',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- settings: everyone reads; owner/admin update.
-- ---------------------------------------------------------------------------
grant select on public.settings to anon, authenticated;
grant update (
  shop_hours, min_notice_minutes, booking_window_days, due_back_weeks, max_open_requests, change_cutoff_minutes,
  google_rating, google_review_count, google_review_url, public_theme, walk_in_text, discount_text, shop_photo_path
) on public.settings to authenticated;

create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy settings_update on public.settings for update to authenticated
  using (app.is_manager()) with check (app.is_manager());

-- ---------------------------------------------------------------------------
-- services: public sees active ones; staff see all; owner/admin edit.
-- ---------------------------------------------------------------------------
grant select on public.services to anon, authenticated;
grant insert, update, delete on public.services to authenticated;

create policy services_public_read on public.services for select to anon using (active);
create policy services_staff_read on public.services for select to authenticated using (app.my_staff_id() is not null);
create policy services_insert on public.services for insert to authenticated with check (app.is_manager());
create policy services_update on public.services for update to authenticated
  using (app.is_manager()) with check (app.is_manager());
create policy services_delete on public.services for delete to authenticated using (app.is_manager());

-- ---------------------------------------------------------------------------
-- staff
-- anon: public profile columns only, for people on the site or taking bookings (never admins).
-- staff: admins see everyone; others see non-admin rows (incl. switched-off/deleted names for history).
-- Owner edits barbers and their own profile; admin edits anyone. Role rules live in app.staff_before_write().
-- ---------------------------------------------------------------------------
-- No role column for anon: the website must never reveal who the owner is.
grant select (id, display_name, title, bio, photo_path, bookable, show_on_site, sort)
  on public.staff to anon;
grant select on public.staff to authenticated;
grant insert (username, display_name, role, bookable, title, bio, photo_path, weekly_hours, show_on_site, active, sort)
  on public.staff to authenticated;
grant update (display_name, role, bookable, title, bio, photo_path, weekly_hours, show_on_site, active, sort)
  on public.staff to authenticated;

create policy staff_public_read on public.staff for select to anon
  using (active and deleted_at is null and role <> 'admin' and (show_on_site or bookable));
create policy staff_read on public.staff for select to authenticated
  using (app.my_staff_id() is not null and (role <> 'admin' or app.is_admin() or id = app.my_staff_id()));
create policy staff_insert on public.staff for insert to authenticated
  with check (app.is_admin() or (app.my_role() = 'owner' and role = 'barber'));
create policy staff_update on public.staff for update to authenticated
  using (
    app.is_admin()
    or (app.my_role() = 'owner' and (role = 'barber' or id = app.my_staff_id()))
  )
  with check (
    app.is_admin()
    or (app.my_role() = 'owner' and (role = 'barber' or id = app.my_staff_id()))
  );

-- ---------------------------------------------------------------------------
-- staff_services: public (booking flow); owner/admin edit.
-- ---------------------------------------------------------------------------
grant select on public.staff_services to anon, authenticated;
grant insert, delete on public.staff_services to authenticated;

create policy staff_services_read on public.staff_services for select to anon, authenticated using (true);
create policy staff_services_insert on public.staff_services for insert to authenticated with check (app.is_manager());
create policy staff_services_delete on public.staff_services for delete to authenticated using (app.is_manager());

-- ---------------------------------------------------------------------------
-- time_off: owner/admin all; barbers view their own. Not public (availability is computed server-side).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.time_off to authenticated;

create policy time_off_read on public.time_off for select to authenticated
  using (app.is_manager() or staff_id = app.my_staff_id());
create policy time_off_insert on public.time_off for insert to authenticated with check (app.is_manager());
create policy time_off_update on public.time_off for update to authenticated
  using (app.is_manager()) with check (app.is_manager());
create policy time_off_delete on public.time_off for delete to authenticated using (app.is_manager());

-- ---------------------------------------------------------------------------
-- closures: public (homepage shows upcoming closed days); owner/admin edit.
-- ---------------------------------------------------------------------------
grant select on public.closures to anon, authenticated;
grant insert, update, delete on public.closures to authenticated;

create policy closures_read on public.closures for select to anon, authenticated using (true);
create policy closures_insert on public.closures for insert to authenticated with check (app.is_manager());
create policy closures_update on public.closures for update to authenticated
  using (app.is_manager()) with check (app.is_manager());
create policy closures_delete on public.closures for delete to authenticated using (app.is_manager());

-- ---------------------------------------------------------------------------
-- clients: owner/admin all; barbers only clients with at least one booking with them.
-- Clients are created by booking RPCs; edits by owner/admin; deletion through delete_client().
-- ---------------------------------------------------------------------------
grant select on public.clients to authenticated;
grant update (name, phone) on public.clients to authenticated;

create policy clients_read on public.clients for select to authenticated
  using (
    app.is_manager()
    or exists (
      select 1 from public.bookings b
      where b.client_id = clients.id and b.staff_id = app.my_staff_id()
    )
  );
create policy clients_update on public.clients for update to authenticated
  using (app.is_manager()) with check (app.is_manager());

-- ---------------------------------------------------------------------------
-- bookings: owner/admin all; barbers their own. Created only through RPCs.
-- Column limits for barbers are enforced in app.bookings_before_write().
-- ---------------------------------------------------------------------------
grant select on public.bookings to authenticated;
grant update (
  staff_id, service_id, service_name, price_pence, duration_min, starts_at, status, decline_reason, message_sent_at
) on public.bookings to authenticated;

create policy bookings_read on public.bookings for select to authenticated
  using (app.is_manager() or staff_id = app.my_staff_id());
create policy bookings_update on public.bookings for update to authenticated
  using (app.is_manager() or staff_id = app.my_staff_id())
  with check (app.is_manager() or staff_id = app.my_staff_id());

-- ---------------------------------------------------------------------------
-- Website content: public sees visible items; owner/admin manage.
-- ---------------------------------------------------------------------------
grant select on public.gallery_photos, public.reviews to anon, authenticated;
grant insert, update, delete on public.gallery_photos, public.reviews to authenticated;

create policy gallery_public_read on public.gallery_photos for select to anon using (visible);
create policy gallery_staff_read on public.gallery_photos for select to authenticated
  using (visible or app.is_manager());
create policy gallery_insert on public.gallery_photos for insert to authenticated with check (app.is_manager());
create policy gallery_update on public.gallery_photos for update to authenticated
  using (app.is_manager()) with check (app.is_manager());
create policy gallery_delete on public.gallery_photos for delete to authenticated using (app.is_manager());

create policy reviews_public_read on public.reviews for select to anon using (visible);
create policy reviews_staff_read on public.reviews for select to authenticated
  using (visible or app.is_manager());
create policy reviews_insert on public.reviews for insert to authenticated with check (app.is_manager());
create policy reviews_update on public.reviews for update to authenticated
  using (app.is_manager()) with check (app.is_manager());
create policy reviews_delete on public.reviews for delete to authenticated using (app.is_manager());

-- ---------------------------------------------------------------------------
-- audit_log: admins see everything; owners see everything except admin entries. Written by triggers/server.
-- ---------------------------------------------------------------------------
grant select on public.audit_log to authenticated;

create policy audit_read on public.audit_log for select to authenticated
  using (app.is_admin() or (app.is_manager() and not actor_is_admin));

-- request_attempts, login_failures, push_subscriptions: no grants, no policies (service role only).

-- ---------------------------------------------------------------------------
-- Test helper: public tables without a require_2fa policy (should always be empty).
-- ---------------------------------------------------------------------------
create or replace function public.tables_missing_2fa_policy()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid and p.polname = 'require_2fa' and not p.polpermissive
    )
  order by 1
$$;

revoke all on function public.tables_missing_2fa_policy() from public, anon, authenticated;
grant execute on function public.tables_missing_2fa_policy() to service_role;
