-- Core tables. Kept deliberately small (spec §6). Money in pence, times as timestamptz.
-- RLS, grants and policies are in a later migration; every table here gets RLS + require_2fa.

-- ---------------------------------------------------------------------------
-- settings: single row, PUBLICLY READABLE. Never store private values here.
-- ---------------------------------------------------------------------------
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  shop_hours jsonb not null default '{}'::jsonb check (app.valid_weekly_hours(shop_hours)),
  min_notice_minutes integer not null default 120
    check (min_notice_minutes in (0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880)),
  booking_window_days integer not null default 30 check (booking_window_days between 1 and 365),
  due_back_weeks integer not null default 5 check (due_back_weeks between 1 and 52),
  max_open_requests integer not null default 3 check (max_open_requests between 1 and 20),
  change_cutoff_minutes integer not null default 120 check (change_cutoff_minutes between 0 and 10080),
  google_rating numeric(2, 1) check (google_rating between 0 and 5),
  google_review_count integer check (google_review_count >= 0),
  google_review_url text check (google_review_url ~ '^https://[^\s]+$' and char_length(google_review_url) <= 500),
  public_theme text not null default 'dark' check (public_theme in ('light', 'dark')),
  walk_in_text text check (char_length(walk_in_text) <= 200),
  discount_text text check (char_length(discount_text) <= 200),
  shop_photo_path text check (char_length(shop_photo_path) <= 300),
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'Shop-wide settings. Single row (id = 1). Publicly readable: never store private values here.';

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80 and name = btrim(name)),
  price_pence integer not null check (price_pence between 0 and 100000),
  duration_min integer not null check (duration_min between 5 and 480 and duration_min % 5 = 0),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff: people who sign in. Admin is a technical account: never bookable, never on the site.
-- ---------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  username text unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  role text not null check (role in ('admin', 'owner', 'barber')),
  bookable boolean not null default false,
  title text check (char_length(title) <= 60),
  bio text check (char_length(bio) <= 600),
  photo_path text check (char_length(photo_path) <= 300),
  weekly_hours jsonb not null default '{}'::jsonb check (app.valid_weekly_hours(weekly_hours)),
  show_on_site boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_admin_not_public check (role <> 'admin' or (not bookable and not show_on_site)),
  constraint staff_deleted_is_hidden check (
    deleted_at is null
    or (not active and not bookable and not show_on_site and username is null and user_id is null)
  ),
  constraint staff_live_has_username check (deleted_at is not null or username is not null)
);

-- Who does which service. Anon-readable (booking flow).
create table public.staff_services (
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);
create index staff_services_service_idx on public.staff_services (service_id);

-- Whole days off, inclusive.
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text check (char_length(reason) <= 100),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index time_off_staff_end_idx on public.time_off (staff_id, ends_on);

-- Whole shop closed days.
create table public.closures (
  id uuid primary key default gen_random_uuid(),
  closed_on date not null unique,
  reason text check (char_length(reason) <= 100),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients: identity is the phone number (UK mobile, E.164). No emails, no notes.
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text not null unique check (phone ~ '^\+447[0-9]{9}$'),
  created_at timestamptz not null default now()
);
create index clients_lower_name_idx on public.clients (lower(name));

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  staff_id uuid not null references public.staff (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  -- Snapshot at booking time; later service edits don't change existing bookings.
  service_name text not null check (char_length(service_name) between 1 and 80),
  price_pence integer not null check (price_pence between 0 and 100000),
  duration_min integer not null check (duration_min between 5 and 480),
  starts_at timestamptz not null,
  -- Always starts_at + duration_min (set by trigger).
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  source text not null check (source in ('online', 'walk_in', 'staff')),
  any_barber boolean not null default false,
  decline_reason text check (char_length(decline_reason) <= 200),
  message_sent_at timestamptz,
  manage_token uuid not null unique default gen_random_uuid(),
  booked_name text check (char_length(btrim(booked_name)) between 1 and 80),
  changed_from uuid references public.bookings (id) on delete set null,
  cancelled_by_client boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (source <> 'online' or client_id is not null or status in ('declined', 'cancelled', 'completed', 'no_show')),
  -- No two live bookings for one barber may overlap (spec §5.3).
  constraint bookings_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index bookings_starts_idx on public.bookings (starts_at);
create index bookings_client_idx on public.bookings (client_id, starts_at);
create index bookings_pending_created_idx on public.bookings (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Website content
-- ---------------------------------------------------------------------------
create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null unique check (char_length(path) <= 300),
  alt text not null check (char_length(btrim(alt)) between 1 and 160),
  visible boolean not null default true,
  -- true = slideshow, false = Recent cuts. Never both.
  in_hero boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  stars smallint not null check (stars between 1 and 5),
  review_date date check (review_date <= current_date),
  is_google boolean not null default false,
  visible boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_log: staff actions only. 90-day retention (phase 13).
-- `changed` lists changed column names so the dashboard can label them (domain/activity.ts).
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.staff (id) on delete set null,
  actor_name text not null check (char_length(actor_name) <= 60),
  action text not null check (char_length(action) <= 60),
  entity text not null check (char_length(entity) <= 40),
  entity_id text check (char_length(entity_id) <= 64),
  summary text check (char_length(summary) <= 200),
  changed text[],
  actor_is_admin boolean not null default false
);
create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- Service-role-only tables (no grants to anon/authenticated)
-- ---------------------------------------------------------------------------
create table public.request_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index request_attempts_ip_at_idx on public.request_attempts (ip_hash, at);

create table public.login_failures (
  id bigint generated always as identity primary key,
  visitor_hash text not null,
  user_hash text not null,
  at timestamptz not null default now()
);
create index login_failures_visitor_idx on public.login_failures (visitor_hash, at);
create index login_failures_user_idx on public.login_failures (user_hash, at);

create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
