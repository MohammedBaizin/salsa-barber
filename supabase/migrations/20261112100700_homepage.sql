-- Owner decisions for the homepage (Nov 2026).

-- ---------------------------------------------------------------------------
-- Per-service bookable days: null = every day the shop is open; otherwise ISO weekdays (1 = Mon … 7 = Sun).
-- Editable per service in Dashboard → Services. Online booking only offers those days.
-- ---------------------------------------------------------------------------
alter table public.services
  add column bookable_days smallint[] check (
    bookable_days is null
    or (
      cardinality(bookable_days) between 1 and 7
      and bookable_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    )
  );

comment on column public.services.bookable_days is
  'ISO weekdays this service can be booked online (null = every open day). Shown on the website, e.g. "Mon–Thu".';

update public.services set bookable_days = array[1, 2, 3, 4]::smallint[] where name = 'OAP Cut (Mon–Thurs)';

-- ---------------------------------------------------------------------------
-- Gallery limits: slideshow up to 3 visible photos, Recent cuts up to 4.
-- ---------------------------------------------------------------------------
create or replace function app.gallery_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_visible int := case when new.in_hero then 3 else 4 end;
begin
  if new.visible then
    perform pg_advisory_xact_lock(hashtext('salsa.gallery'));
    if (
      select count(*) from public.gallery_photos g
      where g.visible and g.in_hero = new.in_hero and g.id <> new.id
    ) >= max_visible then
      raise exception 'gallery_full' using errcode = 'P0001',
        hint = case when new.in_hero then 'slideshow' else 'recent_cuts' end;
    end if;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Shop details from the shop's own opening-times board and the owner's answers.
-- ---------------------------------------------------------------------------
update public.settings set
  shop_hours = '{
    "1": {"open": "09:00", "close": "18:30"},
    "2": {"open": "09:00", "close": "18:30"},
    "3": {"open": "09:00", "close": "18:30"},
    "4": {"open": "09:00", "close": "18:30"},
    "5": {"open": "09:00", "close": "18:30"},
    "6": {"open": "08:30", "close": "18:00"},
    "7": {"open": "09:00", "close": "16:00"}
  }'::jsonb,
  walk_in_text = 'Walk-ins welcome.'
where id = 1;
