-- Bookings made by staff (spec §5.5): walk-ins and phone bookings. Called with the signed-in person's session,
-- so the audit trigger records who did it. Both are confirmed straight away with the service's current price.
-- Time rules mirror checkStaffTime() in src/lib/domain/schedule.ts. Hours, closures and time off are warnings
-- shown in the dashboard, never blocks; overlaps are always refused by the exclusion constraint.

create or replace function app.staff_booking(
  p_kind text,          -- 'walk_in' | 'staff'
  p_staff uuid,
  p_service uuid,
  p_start timestamptz,
  p_name text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := app.my_staff_id();
  svc public.services;
  target public.staff;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_local timestamp := p_start at time zone 'Europe/London';
  v_day date := (p_start at time zone 'Europe/London')::date;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_client uuid;
  v_client_name text;
  v_id uuid;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));

  -- Barbers book only themselves; owner/admin any bookable barber; never the admin account.
  select * into target from public.staff s
  where s.id = p_staff and s.active and s.bookable and s.deleted_at is null and s.role <> 'admin';
  if not found then
    raise exception 'barber_unavailable' using errcode = 'P0001';
  end if;
  if not app.is_manager() and target.id <> me then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into svc from public.services v where v.id = p_service and v.active;
  if not found then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;

  -- 5-minute grid (London wall clock, whole minutes).
  if extract(second from v_local) <> 0 or extract(minute from v_local)::int % 5 <> 0 then
    raise exception 'not_on_grid' using errcode = 'P0001';
  end if;
  if p_kind = 'walk_in' then
    if v_day < v_today - 7 or v_day > v_today + 1 then
      raise exception 'walk_in_window' using errcode = 'P0001';
    end if;
  else
    if p_start <= now() then
      raise exception 'in_the_past' using errcode = 'P0001';
    end if;
    if v_day > v_today + 365 then
      raise exception 'too_far' using errcode = 'P0001';
    end if;
  end if;

  -- Customer: phone bookings need a name and mobile; walk-ins may be anonymous, but a name needs a mobile.
  if v_phone is not null and v_phone !~ '^\+447[0-9]{9}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_kind = 'staff' and (v_name is null or v_phone is null) then
    raise exception using message = case when v_name is null then 'invalid_name' else 'invalid_phone' end, errcode = 'P0001';
  end if;
  if v_name is not null and v_phone is null then
    raise exception 'name_needs_phone' using errcode = 'P0001';
  end if;

  if v_phone is not null then
    -- Find or create by number; never rename an existing client (a different name goes on this booking).
    select c.id, c.name into v_client, v_client_name from public.clients c where c.phone = v_phone;
    if v_client is null then
      if v_name is null then
        raise exception 'invalid_name' using errcode = 'P0001';
      end if;
      insert into public.clients (name, phone) values (v_name, v_phone)
      returning id, name into v_client, v_client_name;
    end if;
  end if;

  begin
    insert into public.bookings (
      client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at,
      status, source, booked_name
    ) values (
      v_client, target.id, svc.id, svc.name, svc.price_pence, svc.duration_min, p_start, p_start,
      'confirmed', p_kind, case when v_name is not null and lower(v_client_name) <> lower(v_name) then v_name end
    )
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'overlap' using errcode = '23P01';
  end;

  return v_id;
end
$$;

revoke all on function app.staff_booking(text, uuid, uuid, timestamptz, text, text) from public, anon, authenticated;

create or replace function public.create_walk_in(
  p_staff uuid, p_service uuid, p_start timestamptz, p_name text default null, p_phone text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.staff_booking('walk_in', p_staff, p_service, p_start, p_name, p_phone)
$$;

create or replace function public.create_staff_booking(
  p_staff uuid, p_service uuid, p_start timestamptz, p_name text, p_phone text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.staff_booking('staff', p_staff, p_service, p_start, p_name, p_phone)
$$;

revoke all on function public.create_walk_in(uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.create_staff_booking(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.create_walk_in(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.create_staff_booking(uuid, uuid, timestamptz, text, text) to authenticated;
