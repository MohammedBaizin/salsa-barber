import pg from "pg";

/**
 * Test-only people, added before a DB or e2e test run and removed after it, so the local data (supabase/seed.sql)
 * only ever holds the real team: admin, Hewr and Sardar.
 *
 * - SAMPLE Jamie (login "jamie"): a third barber who takes bookings but isn't on the website and doesn't do shaves.
 * - SAMPLE Switched-off (login "off"): a switched-off barber.
 * - SAMPLE Dan Noshow: a client only ever booked with Jamie (a no-show last week, a declined request).
 *
 * Same ids every run, so tests can refer to them (tests/db/helpers.ts STAFF / CLIENTS).
 */

const JAMIE = { user: "00000000-0000-4000-8000-000000000004", staff: "10000000-0000-4000-8000-000000000004" };
const OFF = { user: "00000000-0000-4000-8000-000000000005", staff: "10000000-0000-4000-8000-000000000005" };
const DAN = "20000000-0000-4000-8000-000000000004";

const ADD = `
do $$
declare
  u record;
begin
  for u in select * from (values ('${JAMIE.user}'::uuid, 'jamie'), ('${OFF.user}'::uuid, 'off')) as t(id, username) loop
    if not exists (select 1 from auth.users where id = u.id) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
        u.username || '@staff.salsabarber.invalid',
        extensions.crypt('LocalDev-Sample-1', extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), u.id, u.id::text,
        jsonb_build_object('sub', u.id::text, 'email', u.username || '@staff.salsabarber.invalid', 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
  end loop;
end
$$;

insert into public.staff (id, user_id, username, display_name, role, bookable, title, bio, weekly_hours, show_on_site, active, sort)
values
  ('${JAMIE.staff}', '${JAMIE.user}', 'jamie', 'SAMPLE Jamie', 'barber', true, 'Junior barber', null,
    '{"3":{"open":"09:00","close":"17:00"},"4":{"open":"09:00","close":"17:00"},"5":{"open":"09:00","close":"17:00"},"6":{"open":"09:00","close":"17:00"}}',
    false, true, 30),
  ('${OFF.staff}', '${OFF.user}', 'off', 'SAMPLE Switched-off', 'barber', false, 'Barber', null, '{}', false, false, 40)
on conflict (id) do nothing;

-- Jamie does every service except shaves.
insert into public.staff_services (staff_id, service_id)
select '${JAMIE.staff}', v.id from public.services v where v.name not in ('Wet Shave', 'Dry Shave')
on conflict do nothing;

insert into public.clients (id, name, phone) values ('${DAN}', 'SAMPLE Dan Noshow', '+447700900004') on conflict (id) do nothing;

-- Dan: no-show last week, then a declined request (both with Jamie).
insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source, any_barber, decline_reason)
select '${DAN}', '${JAMIE.staff}', sv.id, sv.name, sv.price_pence, sv.duration_min,
  ((current_date + x.day_offset) + time '12:00') at time zone 'Europe/London',
  ((current_date + x.day_offset) + time '12:00') at time zone 'Europe/London',
  x.status, 'online', false, case when x.status = 'declined' then 'SAMPLE: fully booked that day' end
from public.services sv, (values (-7, 'no_show'), (-3, 'declined')) as x(day_offset, status)
where sv.name = 'Hair Cut' and not exists (select 1 from public.bookings where client_id = '${DAN}');
`;

const REMOVE = `
delete from public.bookings where staff_id in ('${JAMIE.staff}', '${OFF.staff}') or client_id = '${DAN}';
delete from public.clients where id = '${DAN}';
delete from public.staff where id in ('${JAMIE.staff}', '${OFF.staff}');
delete from auth.users where id in ('${JAMIE.user}', '${OFF.user}');
`;

async function run(dbUrl: string, sql: string) {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export const addTestPeople = (dbUrl: string) => run(dbUrl, ADD);
export const removeTestPeople = (dbUrl: string) => run(dbUrl, REMOVE);
