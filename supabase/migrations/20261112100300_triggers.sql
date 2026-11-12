-- Triggers: booking rules and status machine, staff guards, gallery limit, updated_at, audit log.
-- "Trusted" callers are the service role and migrations/cron (no auth.uid()); signed-in staff are checked.

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create or replace function app.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  -- Shop-wide lock: serialises booking writes so simultaneous requests can't deadlock (spec §5.3).
  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));

  new.ends_at := new.starts_at + make_interval(mins => new.duration_min);

  if tg_op = 'INSERT' or new.staff_id is distinct from old.staff_id then
    select s.role into target_role
    from public.staff s
    where s.id = new.staff_id and s.deleted_at is null;
    if target_role is null or target_role = 'admin' then
      raise exception 'barber_unavailable' using errcode = 'P0001';
    end if;
  end if;

  if new.status <> 'declined' then
    new.decline_reason := null;
  end if;

  if tg_op = 'UPDATE' then
    -- Status machine (mirrored by availableActions() in TypeScript).
    if new.status <> old.status and not (
         (old.status = 'pending' and new.status in ('confirmed', 'declined', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled'))
      or (old.status in ('completed', 'no_show') and new.status = 'confirmed')
    ) then
      raise exception 'invalid_status_change' using errcode = 'P0001',
        detail = old.status || ' -> ' || new.status;
    end if;

    if new.manage_token <> old.manage_token or new.source <> old.source or new.created_at <> old.created_at then
      raise exception 'read_only_column' using errcode = 'P0001';
    end if;

    -- Barbers may only reschedule and change status on their own bookings (RLS limits rows).
    if auth.uid() is not null and not app.is_manager() then
      if new.staff_id <> old.staff_id
        or new.service_id <> old.service_id
        or new.service_name <> old.service_name
        or new.price_pence <> old.price_pence
        or new.duration_min <> old.duration_min
        or new.client_id is distinct from old.client_id
        or new.booked_name is distinct from old.booked_name then
        raise exception 'not_allowed' using errcode = '42501';
      end if;
    end if;

    -- The customer needs a new message after a reschedule, barber change, service change or cancel.
    if (new.starts_at <> old.starts_at
        or new.staff_id <> old.staff_id
        or new.service_id <> old.service_id
        or (new.status = 'cancelled' and old.status <> 'cancelled'))
       and new.message_sent_at is not distinct from old.message_sent_at then
      new.message_sent_at := null;
    end if;

    new.updated_at := now();
  end if;

  return new;
end
$$;

create trigger bookings_before_write
before insert or update on public.bookings
for each row execute function app.bookings_before_write();

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create or replace function app.staff_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted boolean := auth.uid() is null;
  me uuid := app.my_staff_id();
begin
  if tg_op = 'INSERT' then
    -- Only admins (or the service role) create owner/admin profiles.
    if not trusted and new.role <> 'barber' and not app.is_admin() then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Usernames never change; they are only freed when the account is deleted.
  if new.username is distinct from old.username
     and not (new.deleted_at is not null and new.username is null) then
    raise exception 'username_locked' using errcode = 'P0001';
  end if;

  if new.user_id is distinct from old.user_id and not trusted
     and not (new.deleted_at is not null and new.user_id is null) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if new.role <> old.role and not trusted and not app.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not trusted and old.id = me then
    if not new.active or new.deleted_at is not null then
      raise exception 'cannot_switch_off_self' using errcode = 'P0001';
    end if;
    if new.role <> old.role then
      raise exception 'cannot_change_own_role' using errcode = 'P0001';
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;

create trigger staff_before_write
before insert or update on public.staff
for each row execute function app.staff_before_write();

-- ---------------------------------------------------------------------------
-- Gallery: at most 3 visible photos per set (slideshow / Recent cuts). Hidden photos don't count.
-- ---------------------------------------------------------------------------
create or replace function app.gallery_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visible then
    perform pg_advisory_xact_lock(hashtext('salsa.gallery'));
    if (
      select count(*) from public.gallery_photos g
      where g.visible and g.in_hero = new.in_hero and g.id <> new.id
    ) >= 3 then
      raise exception 'gallery_full' using errcode = 'P0001',
        hint = case when new.in_hero then 'slideshow' else 'recent_cuts' end;
    end if;
  end if;
  return new;
end
$$;

create trigger gallery_limit
before insert or update of visible, in_hero on public.gallery_photos
for each row execute function app.gallery_limit();

-- ---------------------------------------------------------------------------
-- settings.updated_at
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger settings_touch
before update on public.settings
for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log: one row per staff change. Customers, the service role and cron are not logged here
-- (backups, restores, password and 2FA resets are logged by the server code).
-- Client phone numbers never appear in summaries.
-- ---------------------------------------------------------------------------
create or replace function app.booking_who(b jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(b ->> 'booked_name', ''),
    (select c.name from public.clients c where c.id = (b ->> 'client_id')::uuid),
    'Walk-in customer'
  )
$$;

create or replace function app.staff_name(id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.display_name from public.staff s where s.id = staff_name.id), 'Unknown')
$$;

create or replace function app.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := app.my_staff_id();
  entity text := tg_argv[0];
  o jsonb;
  n jsonb;
  r jsonb;
  changed text[];
  act text;
  summ text;
  eid text;
begin
  if actor is null then
    return null;
  end if;

  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  eid := r ->> 'id';

  if tg_op = 'UPDATE' then
    select array_agg(e.key order by e.key) into changed
    from jsonb_each(n) e
    where e.value is distinct from o -> e.key and e.key <> 'updated_at';
    if changed is null then
      return null;
    end if;
  end if;

  case entity
  when 'booking' then
    if tg_op = 'UPDATE' and changed <@ array['message_sent_at'] then
      return null; -- marking a message as sent isn't audited
    end if;
    if tg_op = 'INSERT' then
      act := case r ->> 'source' when 'walk_in' then 'booking.walk_in' when 'staff' then 'booking.phone' else 'booking.create' end;
    elsif tg_op = 'DELETE' then
      act := 'booking.delete';
    elsif 'status' = any (changed) then
      act := case
        when o ->> 'status' = 'pending' and n ->> 'status' = 'confirmed' then 'booking.accept'
        when n ->> 'status' = 'declined' then 'booking.decline'
        when n ->> 'status' = 'cancelled' then 'booking.cancel'
        when n ->> 'status' = 'completed' then 'booking.done'
        when n ->> 'status' = 'no_show' then 'booking.no_show'
        when n ->> 'status' = 'confirmed' then 'booking.undo'
        else 'booking.update'
      end;
    elsif 'staff_id' = any (changed) then
      act := 'booking.reassign';
    elsif 'starts_at' = any (changed) then
      act := 'booking.reschedule';
    elsif changed && array['service_id', 'price_pence', 'service_name'] then
      act := 'booking.service_change';
    else
      act := 'booking.update';
    end if;

    summ := app.booking_who(r) || ' · ' || (r ->> 'service_name') || ' · '
      || app.staff_name((r ->> 'staff_id')::uuid) || ' · ' || app.london_label((r ->> 'starts_at')::timestamptz);
    if act = 'booking.reschedule' then
      summ := summ || ' (was ' || app.london_label((o ->> 'starts_at')::timestamptz) || ')';
    elsif act = 'booking.reassign' then
      summ := summ || ' (was ' || app.staff_name((o ->> 'staff_id')::uuid) || ')';
    elsif act = 'booking.service_change' then
      summ := summ || ' (was ' || (o ->> 'service_name') || ' ' || app.pounds((o ->> 'price_pence')::int)
        || ', now ' || app.pounds((n ->> 'price_pence')::int) || ')';
    end if;

  when 'service' then
    act := case
      when tg_op = 'INSERT' then 'service.create'
      when tg_op = 'DELETE' then 'service.delete'
      when 'active' = any (changed) and not (n ->> 'active')::boolean then 'service.disable'
      when 'active' = any (changed) then 'service.enable'
      else 'service.update'
    end;
    summ := (r ->> 'name') || ' · ' || app.pounds((r ->> 'price_pence')::int) || ' · ' || (r ->> 'duration_min') || ' min';

  when 'staff' then
    act := case
      when tg_op = 'INSERT' then 'staff.create'
      when tg_op = 'DELETE' then 'staff.delete'
      when 'deleted_at' = any (changed) then 'staff.delete'
      when 'role' = any (changed) then 'staff.role'
      when 'active' = any (changed) and not (n ->> 'active')::boolean then 'staff.switch_off'
      when 'active' = any (changed) then 'staff.switch_on'
      when changed <@ array['weekly_hours'] then 'staff.hours'
      else 'staff.update'
    end;
    summ := (r ->> 'display_name');
    if act = 'staff.role' then
      summ := summ || ' · ' || (o ->> 'role') || ' → ' || (n ->> 'role');
    end if;

  when 'staff_service' then
    act := case when tg_op = 'DELETE' then 'staff.service_remove' else 'staff.service_add' end;
    eid := r ->> 'staff_id';
    summ := app.staff_name((r ->> 'staff_id')::uuid) || ' · '
      || coalesce((select s.name from public.services s where s.id = (r ->> 'service_id')::uuid), 'service');

  when 'time_off' then
    act := 'time_off.' || lower(tg_op);
    summ := app.staff_name((r ->> 'staff_id')::uuid) || ' · '
      || to_char((r ->> 'starts_on')::date, 'Dy FMDD Mon') || ' – ' || to_char((r ->> 'ends_on')::date, 'Dy FMDD Mon YYYY');

  when 'closure' then
    act := 'closure.' || lower(tg_op);
    summ := to_char((r ->> 'closed_on')::date, 'Dy FMDD Mon YYYY') || coalesce(' · ' || nullif(r ->> 'reason', ''), '');

  when 'settings' then
    act := 'settings.update';
    summ := array_to_string(changed, ', ');

  when 'client' then
    act := 'client.' || lower(tg_op);
    summ := r ->> 'name';
    if tg_op = 'UPDATE' and 'name' = any (changed) then
      summ := (o ->> 'name') || ' → ' || (n ->> 'name');
    end if;

  when 'photo' then
    act := case
      when tg_op = 'UPDATE' and changed <@ array['sort'] then 'photo.reorder'
      else 'photo.' || lower(tg_op)
    end;
    summ := (r ->> 'alt') || ' · ' || case when (r ->> 'in_hero')::boolean then 'Slideshow' else 'Recent cuts' end;

  when 'review' then
    act := case
      when tg_op = 'UPDATE' and changed <@ array['sort'] then 'review.reorder'
      else 'review.' || lower(tg_op)
    end;
    summ := (r ->> 'author_name') || ' · ' || (r ->> 'stars') || '★';

  else
    act := entity || '.' || lower(tg_op);
    summ := null;
  end case;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, changed)
  values (actor, app.staff_name(actor), act, entity, eid, left(summ, 200), changed);
  return null;
end
$$;

-- Admin entries are visible to admins only.
create or replace function app.audit_mark_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actor_is_admin := coalesce(
    (select s.role = 'admin' from public.staff s where s.id = new.actor_id),
    false
  );
  return new;
end
$$;

create trigger audit_mark_admin
before insert on public.audit_log
for each row execute function app.audit_mark_admin();

create trigger audit after insert or update or delete on public.bookings
for each row execute function app.audit('booking');
create trigger audit after insert or update or delete on public.services
for each row execute function app.audit('service');
create trigger audit after insert or update or delete on public.staff
for each row execute function app.audit('staff');
create trigger audit after insert or delete on public.staff_services
for each row execute function app.audit('staff_service');
create trigger audit after insert or update or delete on public.time_off
for each row execute function app.audit('time_off');
create trigger audit after insert or update or delete on public.closures
for each row execute function app.audit('closure');
create trigger audit after update on public.settings
for each row execute function app.audit('settings');
create trigger audit after insert or update or delete on public.clients
for each row execute function app.audit('client');
create trigger audit after insert or update or delete on public.gallery_photos
for each row execute function app.audit('photo');
create trigger audit after insert or update or delete on public.reviews
for each row execute function app.audit('review');

revoke all on all functions in schema app from public;
-- Policy helpers need execute for the roles that run queries; trigger functions don't.
grant execute on function app.london(timestamptz), app.london_label(timestamptz), app.pounds(integer),
  app.valid_weekly_hours(jsonb), app.fits_hours(jsonb, timestamptz, timestamptz),
  app.mfa_ok(), app.my_staff_id(), app.my_role(), app.is_manager(), app.is_admin()
  to anon, authenticated, service_role;
