-- Sign-in security (spec §9).
--
-- Login attempt limits. Sign-in runs on the server, so Supabase only ever sees the server's address: the limits
-- live here, keyed by hashes the server makes (a keyed hash of the visitor's address and of the username; never the
-- raw values). Checked before the password; unknown usernames are limited the same way.
--   * visitor + username: 5 failures in 15 minutes
--   * visitor:            20 failures in 15 minutes
--   * username:           50 failures in an hour
-- Wrong two-step codes count as failures too. A success clears that visitor's failures. Rows last an hour.

create or replace function public.login_wait_seconds(p_visitor text, p_user text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wait numeric := 0;
  t timestamptz;
begin
  -- For each limit: the Nth most recent failure in the window; once it's older than the window, there's room again.
  select f.at into t from public.login_failures f
  where f.visitor_hash = p_visitor and f.user_hash = p_user and f.at > now() - interval '15 minutes'
  order by f.at desc offset 4 limit 1;
  if found then wait := greatest(wait, extract(epoch from t + interval '15 minutes' - now())); end if;

  select f.at into t from public.login_failures f
  where f.visitor_hash = p_visitor and f.at > now() - interval '15 minutes'
  order by f.at desc offset 19 limit 1;
  if found then wait := greatest(wait, extract(epoch from t + interval '15 minutes' - now())); end if;

  select f.at into t from public.login_failures f
  where f.user_hash = p_user and f.at > now() - interval '1 hour'
  order by f.at desc offset 49 limit 1;
  if found then wait := greatest(wait, extract(epoch from t + interval '1 hour' - now())); end if;

  return ceil(wait)::int;
end
$$;

create or replace function public.record_login_failure(p_visitor text, p_user text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_failures f where f.at < now() - interval '1 hour';
  insert into public.login_failures (visitor_hash, user_hash) values (p_visitor, p_user);
$$;

create or replace function public.clear_login_failures(p_visitor text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.login_failures f where f.visitor_hash = p_visitor;
$$;

revoke all on function public.login_wait_seconds(text, text), public.record_login_failure(text, text), public.clear_login_failures(text)
  from public, anon, authenticated;
grant execute on function public.login_wait_seconds(text, text), public.record_login_failure(text, text), public.clear_login_failures(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- log_account_event(): account actions done through Supabase Auth (not table writes) are logged under the
-- signed-in person, with their session:
--   * account.password_reset  owner/admin for someone they manage (as before)
--   * account.2fa_reset       admin, for someone else
--   * account.password_change, account.2fa_on, account.2fa_off   anyone, for themselves only
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
  if me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into target from public.staff s where s.id = p_staff;
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action in ('account.password_change', 'account.2fa_on', 'account.2fa_off') then
    if p_staff <> me then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif p_action = 'account.password_reset' then
    if not app.is_manager() or p_staff = me or (not app.is_admin() and target.role <> 'barber') then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif p_action = 'account.2fa_reset' then
    if not app.is_admin() or p_staff = me then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary)
  values (me, app.staff_name(me), p_action, 'staff', p_staff::text, target.display_name);
end
$$;

revoke all on function public.log_account_event(text, uuid) from public, anon;
grant execute on function public.log_account_event(text, uuid) to authenticated;
