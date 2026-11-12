-- Foundation: extensions, the private `app` schema and pure helper functions.
-- The `app` schema is not exposed through the Data API (only `public` is).

create extension if not exists btree_gist with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wall-clock helpers. The shop's time zone is Europe/London (DST-safe via tzdata).
-- ---------------------------------------------------------------------------

-- Local (Europe/London) wall-clock time of an instant.
create or replace function app.london(ts timestamptz)
returns timestamp
language sql
stable
parallel safe
set search_path = ''
as $$
  select ts at time zone 'Europe/London'
$$;

-- "Fri 9 Oct 4:00pm" in London time, for audit summaries.
create or replace function app.london_label(ts timestamptz)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select to_char(ts at time zone 'Europe/London', 'Dy FMDD Mon FMHH12:MIam')
$$;

-- Money is stored in pence. 1700 -> '£17', 1750 -> '£17.50'.
create or replace function app.pounds(pence integer)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when pence is null then null
    when pence % 100 = 0 then '£' || (pence / 100)::text
    else '£' || to_char(pence / 100.0, 'FM999999990.00')
  end
$$;

-- Weekly hours JSON: keys "1".."7" (ISO weekday, 1 = Monday), each value null (closed)
-- or {"open":"HH:MM","close":"HH:MM"} with close after open. Missing days are closed.
create or replace function app.valid_weekly_hours(hours jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if hours is null or jsonb_typeof(hours) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(hours) loop
    if k !~ '^[1-7]$' then
      return false;
    end if;
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v) <> 'object'
       or (select count(*) from jsonb_object_keys(v)) <> 2
       or jsonb_typeof(v -> 'open') <> 'string'
       or jsonb_typeof(v -> 'close') <> 'string'
       or (v ->> 'open') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v ->> 'close') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v ->> 'close') <= (v ->> 'open') then
      return false;
    end if;
  end loop;
  return true;
end
$$;

-- True when [starts, ends) sits inside the opening window for that London day.
create or replace function app.fits_hours(hours jsonb, starts timestamptz, ends timestamptz)
returns boolean
language plpgsql
stable
parallel safe
set search_path = ''
as $$
declare
  s timestamp := starts at time zone 'Europe/London';
  e timestamp := ends at time zone 'Europe/London';
  day jsonb;
begin
  if hours is null or starts is null or ends is null or ends <= starts then
    return false;
  end if;
  -- Must start and end on the same local day (closing times are at most 23:59).
  if e::date <> s::date then
    return false;
  end if;
  day := hours -> extract(isodow from s)::int::text;
  if day is null or jsonb_typeof(day) <> 'object' then
    return false;
  end if;
  return s::time >= (day ->> 'open')::time and e::time <= (day ->> 'close')::time;
end
$$;

revoke all on all functions in schema app from public;
grant execute on function app.london(timestamptz), app.london_label(timestamptz), app.pounds(integer),
  app.valid_weekly_hours(jsonb), app.fits_hours(jsonb, timestamptz, timestamptz)
  to anon, authenticated, service_role;
