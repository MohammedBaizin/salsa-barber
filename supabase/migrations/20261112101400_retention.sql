-- Retention (spec §6.5): a nightly job removes what the shop no longer needs. Runs as the database owner via
-- pg_cron (no staff session, so nothing here is written to the activity log).
--
--   * bookings that never happened (declined, cancelled, or requests never answered) whose appointment was more
--     than 90 days ago. Completed visits and no-shows are kept: they are the shop's history and revenue.
--   * activity log entries older than 90 days
--   * clients with no bookings left, added more than 90 days ago
--   * rate-limit rows (booking requests, failed sign-ins) older than an hour
--
-- Returns the counts, e.g. {"bookings": 3, "audit": 120, "clients": 1, "request_attempts": 0, "login_failures": 0}.

create or replace function public.purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff constant timestamptz := now() - interval '90 days';
  n_bookings int;
  n_audit int;
  n_clients int;
  n_requests int;
  n_logins int;
begin
  delete from public.bookings b
  where b.starts_at < cutoff
    and b.status in ('declined', 'cancelled', 'pending');
  get diagnostics n_bookings = row_count;

  delete from public.audit_log a where a.at < cutoff;
  get diagnostics n_audit = row_count;

  delete from public.clients c
  where c.created_at < cutoff
    and not exists (select 1 from public.bookings b where b.client_id = c.id);
  get diagnostics n_clients = row_count;

  delete from public.request_attempts r where r.at < now() - interval '1 hour';
  get diagnostics n_requests = row_count;

  delete from public.login_failures l where l.at < now() - interval '1 hour';
  get diagnostics n_logins = row_count;

  return jsonb_build_object(
    'bookings', n_bookings,
    'audit', n_audit,
    'clients', n_clients,
    'request_attempts', n_requests,
    'login_failures', n_logins
  );
end
$$;

comment on function public.purge_old_data() is
  'Nightly retention (pg_cron 03:15 UTC): old declined/cancelled/unanswered bookings, 90-day activity log, clients with no bookings, 1-hour rate-limit rows. Service role / cron only.';

revoke all on function public.purge_old_data() from public, anon, authenticated;
grant execute on function public.purge_old_data() to service_role;

-- ---------------------------------------------------------------------------
-- Nightly schedule. cron.schedule() with an existing job name replaces it, so this is safe to run again.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule('purge-old-data', '15 3 * * *', $job$select public.purge_old_data()$job$);
