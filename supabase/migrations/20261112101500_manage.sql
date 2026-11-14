-- Customer's private page (spec §4.4): cancel by manage token, enforced in the database.
-- Only pending or confirmed bookings, and only until settings.change_cutoff_minutes before the appointment;
-- otherwise 'not_changeable' (the page then asks the customer to message or call). Service role only: the
-- server action calls it with the secret key after reading the token from the page.

create or replace function public.cancel_managed_booking(p_token uuid)
returns table (booking_id uuid, starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  cutoff int;
begin
  -- Same shop-wide lock as request_booking(), so a change and a cancel can't cross.
  perform pg_advisory_xact_lock(hashtext('salsa.bookings'));
  select cfg.change_cutoff_minutes into cutoff from public.settings cfg where cfg.id = 1;

  select * into b from public.bookings x where x.manage_token = p_token for update;
  if not found
     or b.status not in ('pending', 'confirmed')
     or b.starts_at - make_interval(mins => cutoff) <= now() then
    raise exception 'not_changeable' using errcode = 'P0001';
  end if;

  update public.bookings x set status = 'cancelled', cancelled_by_client = true where x.id = b.id;
  return query select b.id, b.starts_at;
end
$$;

revoke all on function public.cancel_managed_booking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_managed_booking(uuid) to service_role;
