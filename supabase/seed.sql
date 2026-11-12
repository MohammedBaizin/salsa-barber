-- DEV-ONLY SAMPLE DATA. Loaded by `supabase db reset` locally. NEVER pushed to production
-- (`supabase db push` applies migrations only).
--
-- Local sample logins (password for all: LocalDev-Sample-1):
--   admin  (admin)   owner  (owner)   sam  (barber)   jamie (barber)   off  (barber, switched off)
-- Everything below is labelled SAMPLE. Phone numbers use Ofcom's drama range (07700 900000–900999).

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'admin'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'owner'),
      ('00000000-0000-4000-8000-000000000003'::uuid, 'sam'),
      ('00000000-0000-4000-8000-000000000004'::uuid, 'jamie'),
      ('00000000-0000-4000-8000-000000000005'::uuid, 'off')
    ) as t(id, username)
  loop
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
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Settings (SAMPLE hours: Mon–Fri 9–6, Sat 9–5, Sun closed)
-- ---------------------------------------------------------------------------
update public.settings set
  shop_hours = '{"1":{"open":"09:00","close":"18:00"},"2":{"open":"09:00","close":"18:00"},"3":{"open":"09:00","close":"18:00"},"4":{"open":"09:00","close":"18:00"},"5":{"open":"09:00","close":"18:00"},"6":{"open":"09:00","close":"17:00"},"7":null}',
  walk_in_text = 'SAMPLE: Walk-ins welcome when a chair is free.',
  google_rating = 4.9,
  google_review_count = 57,
  google_review_url = 'https://example.com/sample-google-reviews'
where id = 1;

-- ---------------------------------------------------------------------------
-- Staff (SAMPLE)
-- ---------------------------------------------------------------------------
insert into public.staff (id, user_id, username, display_name, role, bookable, title, bio, weekly_hours, show_on_site, active, sort)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'admin', 'SAMPLE Admin', 'admin',
    false, null, null, '{}', false, true, 0),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'owner', 'SAMPLE Owner', 'owner',
    true, 'Barber', 'SAMPLE bio for the owner.',
    '{"1":{"open":"09:00","close":"18:00"},"2":{"open":"09:00","close":"18:00"},"3":{"open":"09:00","close":"18:00"},"4":{"open":"09:00","close":"18:00"},"5":{"open":"09:00","close":"18:00"},"6":{"open":"09:00","close":"17:00"}}',
    true, true, 10),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'sam', 'SAMPLE Sam', 'barber',
    true, 'Barber', 'SAMPLE bio for Sam.',
    '{"1":{"open":"10:00","close":"18:00"},"2":{"open":"10:00","close":"18:00"},"4":{"open":"10:00","close":"18:00"},"5":{"open":"10:00","close":"18:00"},"6":{"open":"09:00","close":"17:00"}}',
    true, true, 20),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'jamie', 'SAMPLE Jamie', 'barber',
    true, 'Junior barber', null,
    '{"3":{"open":"09:00","close":"17:00"},"4":{"open":"09:00","close":"17:00"},"5":{"open":"09:00","close":"17:00"},"6":{"open":"09:00","close":"17:00"}}',
    true, true, 30),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'off', 'SAMPLE Switched-off', 'barber',
    false, 'Barber', null, '{}', false, false, 40);

-- Every bookable person does every service, except Jamie doesn't do shaves.
insert into public.staff_services (staff_id, service_id)
select s.id, v.id
from public.staff s
cross join public.services v
where s.bookable
  and not (s.username = 'jamie' and v.name in ('Wet Shave', 'Dry Shave'));

-- Sam is off for three days next week (SAMPLE).
insert into public.time_off (staff_id, starts_on, ends_on, reason)
values ('10000000-0000-4000-8000-000000000003', current_date + 7, current_date + 9, 'SAMPLE holiday');

-- Closed in two weeks (SAMPLE).
insert into public.closures (closed_on, reason) values (current_date + 14, 'SAMPLE closure');

-- ---------------------------------------------------------------------------
-- Clients (SAMPLE)
-- ---------------------------------------------------------------------------
insert into public.clients (id, name, phone) values
  ('20000000-0000-4000-8000-000000000001', 'SAMPLE Alex Regular', '+447700900001'),
  ('20000000-0000-4000-8000-000000000002', 'SAMPLE Ben New',      '+447700900002'),
  ('20000000-0000-4000-8000-000000000003', 'SAMPLE Chris Dueback', '+447700900003'),
  ('20000000-0000-4000-8000-000000000004', 'SAMPLE Dan Noshow',   '+447700900004');

-- ---------------------------------------------------------------------------
-- Bookings (SAMPLE), placed relative to today in London so the dashboard always has data.
-- ---------------------------------------------------------------------------
create temporary table sample_slots (client text, barber text, service text, day_offset int, at time, status text, source text);
insert into sample_slots values
  -- Alex: regular (3+ completed visits), next visit booked
  ('20000000-0000-4000-8000-000000000001', 'sam',   'Skin Fade',  -63, '10:00', 'completed', 'online'),
  ('20000000-0000-4000-8000-000000000001', 'sam',   'Skin Fade',  -35, '10:00', 'completed', 'online'),
  ('20000000-0000-4000-8000-000000000001', 'sam',   'Skin Fade',  -14, '10:30', 'completed', 'staff'),
  ('20000000-0000-4000-8000-000000000001', 'sam',   'Skin Fade',   14, '10:00', 'confirmed', 'staff'),
  -- Ben: new, pending request tomorrow with any barber
  ('20000000-0000-4000-8000-000000000002', 'owner', 'Hair Cut',     1, '11:00', 'pending',   'online'),
  -- Chris: due back (last visit 8 weeks ago, nothing booked)
  ('20000000-0000-4000-8000-000000000003', 'owner', 'Beard Trim & Shape Up', -56, '15:00', 'completed', 'online'),
  -- Dan: no-show last week, declined request
  ('20000000-0000-4000-8000-000000000004', 'jamie', 'Hair Cut',    -7, '12:00', 'no_show',   'online'),
  ('20000000-0000-4000-8000-000000000004', 'jamie', 'Hair Cut',    -3, '12:00', 'declined',  'online'),
  -- Today
  ('20000000-0000-4000-8000-000000000002', 'sam',   'Hair Cut',     0, '13:00', 'confirmed', 'online'),
  (null,                                   'owner', 'Normal Zero',  0, '09:30', 'completed', 'walk_in');

insert into public.bookings (client_id, staff_id, service_id, service_name, price_pence, duration_min, starts_at, ends_at, status, source, any_barber, decline_reason)
select
  ss.client::uuid,
  st.id,
  sv.id,
  sv.name,
  sv.price_pence,
  sv.duration_min,
  ((current_date + ss.day_offset) + ss.at) at time zone 'Europe/London',
  ((current_date + ss.day_offset) + ss.at) at time zone 'Europe/London', -- replaced by the trigger
  ss.status,
  ss.source,
  ss.status = 'pending',
  case when ss.status = 'declined' then 'SAMPLE: fully booked that day' end
from sample_slots ss
join public.staff st on st.username = ss.barber
join public.services sv on sv.name = ss.service;

drop table sample_slots;

-- ---------------------------------------------------------------------------
-- Reviews (SAMPLE, clearly not real)
-- ---------------------------------------------------------------------------
insert into public.reviews (author_name, body, stars, review_date, is_google, sort) values
  ('SAMPLE Reviewer A', 'SAMPLE review text. Replace with real reviews copied word for word.', 5, current_date - 20, true, 10),
  ('SAMPLE Reviewer B', 'SAMPLE review text for layout testing.', 4, current_date - 45, false, 20);
