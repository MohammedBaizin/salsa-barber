-- Role helpers used by RLS policies, triggers and RPCs.
-- All are security definer (they read staff/auth tables the caller may not see) with an empty search_path.

-- Two-step sign-in gate: the session is aal2, or the user has no verified factor.
create or replace function app.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
$$;

-- The signed-in person's staff id: null when signed out, switched off, deleted, or missing the second step.
create or replace function app.my_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  where s.user_id = auth.uid()
    and s.active
    and s.deleted_at is null
    and app.mfa_ok()
$$;

create or replace function app.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.id = app.my_staff_id()
$$;

-- Owner or admin.
create or replace function app.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.my_role() in ('owner', 'admin'), false)
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.my_role() = 'admin', false)
$$;

revoke all on function app.mfa_ok(), app.my_staff_id(), app.my_role(), app.is_manager(), app.is_admin() from public;
grant execute on function app.mfa_ok(), app.my_staff_id(), app.my_role(), app.is_manager(), app.is_admin()
  to anon, authenticated, service_role;

-- Public RPC for requireStaff(): does this session satisfy two-step sign-in?
create or replace function public.two_factor_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and app.mfa_ok()
$$;

revoke all on function public.two_factor_ok() from public, anon;
grant execute on function public.two_factor_ok() to authenticated, service_role;
