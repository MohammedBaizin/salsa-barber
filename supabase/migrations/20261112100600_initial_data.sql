-- Initial shop data (runs in production too). Everything here is editable in the dashboard.
--
-- Prices: from the owner's price list (Nov 2026).
-- Durations: PLACEHOLDERS until the owner confirms them. Online booking stays off
-- (NEXT_PUBLIC_BOOKING_ENABLED=false) until durations, hours and barbers are confirmed.
-- Opening hours: left empty (closed) until the owner confirms them in Settings.

insert into public.settings (id) values (1)
on conflict (id) do nothing;

insert into public.services (name, price_pence, duration_min, sort) values
  ('Hair Cut',                 1700, 30, 10),
  ('Skin Fade',                1800, 45, 20),
  ('Beard Trim & Shape Up',    1400, 20, 30),
  ('Boy''s Cut (12 & Under)',  1400, 30, 40),
  ('Boy''s Skin Fade',         1600, 40, 50),
  ('Wet Shave',                1600, 30, 60),
  ('Dry Shave',                1400, 20, 70),
  ('Normal Zero',              1000, 15, 80),
  ('All Over No. 2 & Under',   1400, 20, 90),
  ('OAP Cut (Mon–Thurs)',      1400, 30, 100),
  ('Full Service',             3900, 60, 110),
  ('Nose Wax',                  200,  5, 120),
  ('Ear Wax',                   300,  5, 130);
