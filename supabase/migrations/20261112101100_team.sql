-- Team (spec §8.5, §6.2).

-- ---------------------------------------------------------------------------
-- delete_staff(): owner (barbers) / admin (anyone else). Never yourself, never while they have upcoming bookings.
-- Under the booking lock, so no booking can sneak in meanwhile.
-- - No bookings ever: the row is removed (time off and services go with it).
-- - With history: a hidden row keeps their name for past bookings and the activity log; username and login are
--   freed, everything else is cleared.
-- Returns the login to remove (the server deletes it with the secret key) and the photo file to delete.
-- ---------------------------------------------------------------------------
create or replace function public.delete_staff(p_id uuid)
returns table (user_id uuid, photo_path text, removed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.my_staff_id();
  target public.staff;
  has_history boolean;
begin
  if me is null or not app.is_manager() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));

  select * into target from public.staff s where s.id = p_id and s.deleted_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if target.id = me then
    raise exception 'cannot_delete_self' using errcode = 'P0001';
  end if;
  if not app.is_admin() and target.role <> 'barber' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.staff_id = p_id and b.status in ('pending', 'confirmed') and b.ends_at > now()
  ) then
    raise exception 'has_upcoming' using errcode = 'P0001';
  end if;

  has_history := exists (select 1 from public.bookings b where b.staff_id = p_id);

  if has_history then
    delete from public.staff_services ss where ss.staff_id = p_id;
    delete from public.time_off t where t.staff_id = p_id;
    update public.staff s set
      deleted_at = now(), active = false, bookable = false, show_on_site = false,
      username = null, user_id = null, title = null, bio = null, photo_path = null, weekly_hours = '{}'::jsonb
    where s.id = p_id;
  else
    delete from public.staff s where s.id = p_id;
  end if;

  return query select target.user_id, target.photo_path, not has_history;
end
$$;

revoke all on function public.delete_staff(uuid) from public, anon;
grant execute on function public.delete_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- end_user_sessions(): signs a login out everywhere (password reset, switched off). Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.end_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.user_id = p_user;
$$;

revoke all on function public.end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_user_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- log_account_event(): account actions done with the secret key (password resets) are logged under the
-- signed-in person who asked for them. Called with their session; checks they may manage the target.
-- ---------------------------------------------------------------------------
create or replace function public.log_account_event(p_action text, p_staff uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.my_staff_id();
  target public.staff;
begin
  if me is null or not app.is_manager() or p_action <> 'account.password_reset' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into target from public.staff s where s.id = p_staff;
  if not found or (not app.is_admin() and target.role <> 'barber') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary)
  values (me, app.staff_name(me), p_action, 'staff', p_staff::text, target.display_name);
end
$$;

revoke all on function public.log_account_event(text, uuid) from public, anon;
grant execute on function public.log_account_event(text, uuid) to authenticated;
