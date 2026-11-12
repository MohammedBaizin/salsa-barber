-- Customer booking requests (spec §5.1–5.3). Called ONLY by the server with the secret key.
-- Mirrors src/lib/domain/availability.ts; tests/db/parity.test.ts checks they agree.

-- The server may move a manage token from an old booking to its replacement (customer "Change").
-- Signed-in staff still can't touch tokens or sources.
create or replace function app.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
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
    if new.status <> old.status and not (
         (old.status = 'pending' and new.status in ('confirmed', 'declined', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled'))
      or (old.status in ('completed', 'no_show') and new.status = 'confirmed')
    ) then
      raise exception 'invalid_status_change' using errcode = 'P0001',
        detail = old.status || ' -> ' || new.status;
    end if;

    if new.source <> old.source or new.created_at <> old.created_at
       or (new.manage_token <> old.manage_token and auth.uid() is not null) then
      raise exception 'read_only_column' using errcode = 'P0001';
    end if;

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

-- ---------------------------------------------------------------------------
-- request_booking(): validates everything again, picks the barber for "any barber", and inserts a pending
-- online booking with a snapshot of the service. Error codes match src/lib/domain/validation.ts.
-- Returns the booking id, its manage token, the barber, and whether it's new (false = repeat of the same request).
-- ---------------------------------------------------------------------------
create or replace function public.request_booking(
  p_service uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_staff uuid default null,
  p_replaces uuid default null,
  p_ip_hash text default null
)
returns table (booking_id uuid, manage_token uuid, staff_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.settings;
  svc public.services;
  old_booking public.bookings;
  existing public.bookings;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_end timestamptz;
  v_local timestamp;
  v_day int;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_client uuid;
  v_client_name text;
  v_staff uuid;
  v_token uuid;
  v_new_id uuid;
begin
  -- Same shop-wide lock as the booking trigger: one booking decision at a time.
  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));

  select * into cfg from public.settings where id = 1;
  select * into svc from public.services where id = p_service and active;
  if not found then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_phone is null or p_phone !~ '^\+447[0-9]{9}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  -- Changing an existing booking: only while it's live and before the cut-off.
  if p_replaces is not null then
    select * into old_booking from public.bookings b where b.manage_token = p_replaces for update;
    if not found
       or old_booking.status not in ('pending', 'confirmed')
       or old_booking.starts_at - make_interval(mins => cfg.change_cutoff_minutes) <= now() then
      raise exception 'not_changeable' using errcode = 'P0001';
    end if;
  end if;

  -- Idempotent: the same request sent twice (lost signal, double tap) returns the first one.
  select b.* into existing
  from public.bookings b
  join public.clients c on c.id = b.client_id
  where c.phone = p_phone
    and b.service_id = p_service
    and b.starts_at = p_start
    and b.source = 'online'
    and b.status in ('pending', 'confirmed')
    and (p_staff is null or b.staff_id = p_staff)
    and (p_replaces is null or b.manage_token = p_replaces or b.changed_from = old_booking.id)
  order by b.created_at
  limit 1;
  if found then
    return query select existing.id, existing.manage_token, existing.staff_id, false;
    return;
  end if;

  -- Per visitor: at most 10 new requests an hour (hashed address, kept one hour).
  if p_ip_hash is not null then
    delete from public.request_attempts where at < now() - interval '1 hour';
    if (select count(*) from public.request_attempts a where a.ip_hash = p_ip_hash) >= 10 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    insert into public.request_attempts (ip_hash) values (p_ip_hash);
  end if;

  -- Time rules (same order as checkSlot() in TypeScript).
  v_end := p_start + make_interval(mins => svc.duration_min);
  v_local := p_start at time zone 'Europe/London';
  v_day := extract(isodow from v_local)::int;
  if extract(second from v_local) <> 0 or extract(minute from v_local)::int % 15 <> 0 then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;
  if p_start < now() + make_interval(mins => cfg.min_notice_minutes) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if v_local::date > v_today + (greatest(cfg.booking_window_days, 1) - 1) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.closures c where c.closed_on = v_local::date)
     or jsonb_typeof(cfg.shop_hours -> v_day::text) is distinct from 'object' then
    raise exception 'shop_closed' using errcode = 'P0001';
  end if;
  if svc.bookable_days is not null and not (v_day::smallint = any (svc.bookable_days)) then
    raise exception 'service_day' using errcode = 'P0001';
  end if;
  if not app.fits_hours(cfg.shop_hours, p_start, v_end) then
    raise exception 'outside_hours' using errcode = 'P0001';
  end if;

  -- The same person can't be in two places, and can only have a few requests waiting.
  select c.id, c.name into v_client, v_client_name from public.clients c where c.phone = p_phone;
  if v_client is not null then
    if exists (
      select 1 from public.bookings b
      where b.client_id = v_client
        and b.status in ('pending', 'confirmed')
        and b.id is distinct from old_booking.id
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, v_end, '[)')
    ) then
      raise exception 'already_booked' using errcode = 'P0001';
    end if;
    if (
      select count(*) from public.bookings b
      where b.client_id = v_client and b.status = 'pending' and b.starts_at > now() and b.id is distinct from old_booking.id
    ) >= cfg.max_open_requests then
      raise exception 'too_many_requests' using errcode = 'P0001';
    end if;
  end if;

  -- Barbers who could do it: bookable, offer the service, working then, not on time off.
  create temporary table if not exists pg_temp.booking_candidates (id uuid, sort int, free_since timestamptz, n int) on commit drop;
  delete from pg_temp.booking_candidates where true;
  insert into pg_temp.booking_candidates
  select
    st.id,
    st.sort,
    coalesce(
      (select max(b.ends_at) from public.bookings b
        where b.staff_id = st.id and b.status in ('pending', 'confirmed') and b.id is distinct from old_booking.id
          and (b.starts_at at time zone 'Europe/London')::date = v_local::date and b.ends_at <= p_start),
      (v_local::date + greatest((cfg.shop_hours -> v_day::text ->> 'open')::time, (st.weekly_hours -> v_day::text ->> 'open')::time))
        at time zone 'Europe/London'
    ),
    (select count(*) from public.bookings b
      where b.staff_id = st.id and b.status in ('pending', 'confirmed') and b.id is distinct from old_booking.id
        and (b.starts_at at time zone 'Europe/London')::date = v_local::date)::int
  from public.staff st
  where st.active and st.deleted_at is null and st.bookable and st.role <> 'admin'
    and (p_staff is null or st.id = p_staff)
    and exists (select 1 from public.staff_services ss where ss.staff_id = st.id and ss.service_id = p_service)
    and not exists (select 1 from public.time_off t where t.staff_id = st.id and v_local::date between t.starts_on and t.ends_on)
    and app.fits_hours(st.weekly_hours, p_start, v_end);

  if not exists (select 1 from pg_temp.booking_candidates) then
    raise exception 'barber_unavailable' using errcode = 'P0001';
  end if;

  -- Free ones only; for "any barber": free longest, then fewest bookings that day, then staff order.
  select c.id into v_staff
  from pg_temp.booking_candidates c
  where not exists (
    select 1 from public.bookings b
    where b.staff_id = c.id and b.status in ('pending', 'confirmed') and b.id is distinct from old_booking.id
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start, v_end, '[)')
  )
  order by c.free_since, c.n, c.sort
  limit 1;
  if v_staff is null then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  -- Find or create the client by phone. Never rename an existing client: a different name goes on this booking.
  if v_client is null then
    insert into public.clients (name, phone) values (v_name, p_phone)
    on conflict (phone) do nothing
    returning id, name into v_client, v_client_name;
    if v_client is null then
      select c.id, c.name into v_client, v_client_name from public.clients c where c.phone = p_phone;
    end if;
  end if;

  -- A change keeps the customer's link: the old booking gets a fresh token and is cancelled in the same transaction.
  v_token := gen_random_uuid();
  if p_replaces is not null then
    update public.bookings b
    set manage_token = gen_random_uuid(), status = 'cancelled', cancelled_by_client = true
    where b.id = old_booking.id;
    v_token := p_replaces;
  end if;

  begin
    insert into public.bookings (
      client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at,
      status, source, any_barber, manage_token, booked_name, changed_from
    ) values (
      v_client, v_staff, svc.id, svc.name, svc.price_pence, svc.duration_min, p_start, v_end,
      'pending', 'online', p_staff is null, v_token,
      case when lower(v_client_name) <> lower(v_name) then v_name end,
      old_booking.id
    )
    returning id into v_new_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;

  return query select v_new_id, v_token, v_staff, true;
end
$$;

revoke all on function public.request_booking(uuid, timestamptz, text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_booking(uuid, timestamptz, text, text, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- get_managed_booking(): the customer's private page, opened only by its unguessable token.
-- ---------------------------------------------------------------------------
create or replace function public.get_managed_booking(p_token uuid)
returns table (
  booking_id uuid,
  status text,
  service_id uuid,
  service_name text,
  price_pence int,
  duration_min int,
  starts_at timestamptz,
  ends_at timestamptz,
  staff_id uuid,
  staff_name text,
  any_barber boolean,
  customer_name text,
  phone text,
  created_at timestamptz,
  can_change boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.status, b.service_id, b.service_name, b.price_pence, b.duration_min, b.starts_at, b.ends_at,
    b.staff_id, s.display_name, b.any_barber,
    coalesce(b.booked_name, c.name), c.phone, b.created_at,
    b.status in ('pending', 'confirmed')
      and b.starts_at - make_interval(mins => (select cfg.change_cutoff_minutes from public.settings cfg where cfg.id = 1)) > now()
  from public.bookings b
  left join public.clients c on c.id = b.client_id
  join public.staff s on s.id = b.staff_id
  where b.manage_token = p_token
$$;

revoke all on function public.get_managed_booking(uuid) from public, anon, authenticated;
grant execute on function public.get_managed_booking(uuid) to service_role;
