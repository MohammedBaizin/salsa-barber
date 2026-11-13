-- Clients (spec §8.4, §6.2).

-- ---------------------------------------------------------------------------
-- client_list(): the Clients page in one query. SECURITY INVOKER, so RLS decides who is visible
-- (barbers: only clients with at least one booking with them; their visits/spend only count their own bookings).
-- Labels match src/lib/domain/clients.ts:
--   Regular = 3+ completed visits · New = no completed visit ·
--   Due back = last completed visit longer ago than settings.due_back_weeks and nothing upcoming.
-- Search: p_name (case-insensitive, already LIKE-escaped) or p_phone (national digits fragment).
-- Returns one page, plus the total for every filter (same search and barber).
-- ---------------------------------------------------------------------------
create or replace function public.client_list(
  p_filter text default 'all',
  p_name text default null,
  p_phone text default null,
  p_staff uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  phone text,
  created_at timestamptz,
  visits int,
  spent_pence int,
  no_shows int,
  last_visit timestamptz,
  next_visit timestamptz,
  n_all bigint,
  n_due_back bigint,
  n_regular bigint,
  n_new bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select now() - make_interval(days => s.due_back_weeks * 7) as due_cutoff from public.settings s where s.id = 1
  ),
  base as (
    select c.id, c.name, c.phone, c.created_at, st.visits, st.spent_pence, st.no_shows, st.last_visit, st.next_visit,
      st.visits >= 3 as is_regular,
      st.visits = 0 as is_new,
      (st.last_visit is not null and st.next_visit is null and st.last_visit < (select due_cutoff from cfg)) as is_due_back
    from public.clients c
    join public.client_stats st on st.client_id = c.id
    where (p_name is null or c.name ilike '%' || p_name || '%')
      and (p_phone is null or c.phone like '%' || p_phone || '%')
      and (p_staff is null or exists (select 1 from public.bookings b where b.client_id = c.id and b.staff_id = p_staff))
  ),
  counts as (
    select count(*) as n_all,
      count(*) filter (where is_due_back) as n_due_back,
      count(*) filter (where is_regular) as n_regular,
      count(*) filter (where is_new) as n_new
    from base
  )
  select b.id, b.name, b.phone, b.created_at, b.visits, b.spent_pence, b.no_shows, b.last_visit, b.next_visit,
    k.n_all, k.n_due_back, k.n_regular, k.n_new
  from counts k
  left join base b on case p_filter
      when 'due_back' then b.is_due_back
      when 'regular' then b.is_regular
      when 'new' then b.is_new
      else true
    end
  order by
    case when p_filter = 'due_back' then b.last_visit end asc,
    case when p_filter = 'regular' then b.visits end desc,
    case when p_filter = 'new' then b.created_at end desc,
    lower(b.name), b.id
  limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
$$;

revoke all on function public.client_list(text, text, text, uuid, int, int) from public, anon;
grant execute on function public.client_list(text, text, text, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_client(): on the customer's request (UK GDPR). Owner/admin only, one transaction:
-- - open future bookings are cancelled;
-- - the client row is deleted; past bookings keep their revenue with client_id = null and no name;
-- - their name is replaced with "Deleted client" in the activity log.
-- Returns how many future bookings were cancelled.
-- ---------------------------------------------------------------------------
create or replace function public.delete_client(p_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_names text[];
  v_bookings text[];
  v_cancelled int;
  n text;
begin
  if not app.is_manager() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));

  select c.name into v_name from public.clients c where c.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select array_agg(b.id::text), array_agg(distinct b.booked_name) filter (where b.booked_name is not null)
  into v_bookings, v_names
  from public.bookings b where b.client_id = p_id;

  update public.bookings b set status = 'cancelled'
  where b.client_id = p_id and b.status in ('pending', 'confirmed') and b.starts_at > now();
  get diagnostics v_cancelled = row_count;

  update public.bookings b set booked_name = null where b.client_id = p_id and b.booked_name is not null;

  delete from public.clients c where c.id = p_id;

  -- Unlinking their bookings (name cleared, client_id set null by the foreign key) isn't a staff change worth
  -- logging; the cancellations and the deletion itself stay.
  delete from public.audit_log a
  where a.entity = 'booking' and a.action = 'booking.update' and a.at = now()
    and a.entity_id = any (coalesce(v_bookings, '{}'));

  -- Activity log: no trace of the name in entries about this client or their bookings.
  foreach n in array array_prepend(v_name, coalesce(v_names, '{}')) loop
    update public.audit_log a
    set summary = replace(a.summary, n, 'Deleted client')
    where ((a.entity = 'client' and a.entity_id = p_id::text)
        or (a.entity = 'booking' and a.entity_id = any (coalesce(v_bookings, '{}'))))
      and position(n in a.summary) > 0;
  end loop;

  return v_cancelled;
end
$$;

revoke all on function public.delete_client(uuid) from public, anon;
grant execute on function public.delete_client(uuid) to authenticated;
