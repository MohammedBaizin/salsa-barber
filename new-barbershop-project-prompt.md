# Build prompt: website + staff dashboard for {{SHOP_NAME}}

You are building a production-ready website and owner/staff dashboard for an independent barbershop, **{{SHOP_NAME}}**.
The feature set, booking process, dashboard, security model and business rules below come from a proven system that already runs
at another shop. Build them **exactly as specified**. The **visual design must be entirely new and original** (see §3).

Work in small, reviewable tasks (see §17). Never invent business content: everything shop-specific is a placeholder until the owner confirms it.

---

## 0. Placeholders (the owner supplies these later)

Keep every shop detail in one config file (e.g. `src/lib/site.ts`) or in the database (editable in the dashboard). Never hard-code them in components.

| Placeholder | Where it lives | Notes |
| --- | --- | --- |
| `{{SHOP_NAME}}` | `site.ts` | Used in the header, messages, emails, JSON-LD, manifest |
| `{{SHOP_SHORT_NAME}}` | `site.ts` | Home Screen app name, push alert title |
| `{{LOGO}}` | `assets/logo-original.*` → optimised by a script into `public/brand/` | Never edit the original artwork; generate sizes (WebP/PNG, 192/512 app icons, favicon, apple-icon, OG image) |
| `{{BRAND_COLORS}}` | CSS variables (§3) | Primary, accent, neutrals, plus light and dark variants |
| `{{BRAND_FONTS}}` | `next/font` | Heading, body, optional display/wordmark font |
| `{{ADDRESS}}`, `{{POSTCODE}}`, `{{CITY}}`, `{{AREA_NAME}}` | `site.ts` | Also map, directions and Apple Maps links |
| `{{PHONE_DISPLAY}}`, `{{PHONE_E164}}` | `site.ts` | Call buttons, messages |
| `{{INSTAGRAM_URL}}` / other socials | `site.ts` | Optional |
| `{{MAP_EMBED_URL}}`, `{{DIRECTIONS_URL}}`, `{{APPLE_MAPS_URL}}` | `site.ts` | Keyless Google Maps embed, loaded only on tap |
| `{{PAYMENT_TEXT}}` | `site.ts` | e.g. "Cash & card" |
| `{{SITE_URL}}` | env `NEXT_PUBLIC_SITE_URL` | Canonical URL, sitemap, OG, links in messages |
| `{{SERVICES}}` (name, price, duration) | `services` table, initial-data migration | Editable in Dashboard → Services |
| `{{OPENING_HOURS}}` | `settings.shop_hours` | Editable in Settings |
| `{{CLOSED_DAYS}}` | `closures` table | Editable in Settings |
| `{{BARBERS}}` (name, title, bio, photo, hours, services) | `staff` table | Created in Dashboard → Team, never in a migration |
| `{{SHOP_PHOTO}}`, `{{SLIDESHOW_PHOTOS}}`, `{{RECENT_CUTS_PHOTOS}}`, `{{TEAM_PHOTOS}}` | Supabase Storage | Uploaded in the dashboard |
| `{{GOOGLE_RATING}}`, `{{GOOGLE_REVIEW_COUNT}}`, `{{GOOGLE_REVIEW_URL}}` | `settings` | Blank hides the rating |
| `{{REVIEWS}}` | `reviews` table | Copied word for word from real reviews only |
| `{{WALK_IN_TEXT}}`, `{{DISCOUNT_TEXT}}` | `settings` | ≤200 chars each; blank hides them |
| `{{SERVICES_STRIP_WORDS}}` | config | Optional decorative list of service keywords |
| `{{TIMEZONE}}` | `site.ts` + SQL | Default `Europe/London` (all logic must be DST-safe) |
| `{{CURRENCY}}` | money helpers | Default GBP, stored as integer minor units (pence) |
| `{{PHONE_COUNTRY}}` | phone helpers | Default UK mobiles only (see §6.4) |
| `{{STAFF_EMAIL_DOMAIN}}` | auth helper | Internal fake domain for username logins, e.g. `staff.<shop>.invalid` |
| `{{VERCEL_REGION}}`, `{{SUPABASE_REGION}}` | `vercel.json`, Supabase project | Keep them close together |

Until confirmed, mark unconfirmed content with a `<PlaceholderTag />` that only renders when `NEXT_PUBLIC_SHOW_PLACEHOLDERS=true` (dev only).
Sample data (seed) is dev-only and labelled "SAMPLE". Never invent reviews, ratings, bios or photos.

---

## 1. Product summary

- **Public website**: a fast, phone-first homepage plus an online booking flow.
- **Bookings are requests.** Customers give **name + mobile number only** (no account, no email). The shop gets an alert (email + phone push),
  accepts or declines in the dashboard, then notifies the customer with **one tap** on a prefilled WhatsApp (`wa.me`) or SMS (`sms:`) link.
  The message text is never stored, only a `message_sent_at` flag.
- **Customers manage their own booking** through a private, unguessable link (`/booking/<token>`): view, change, cancel.
- **Staff dashboard** (installable as a Home Screen app): Today, Calendar, Clients, Team, Services, Website content, Settings, Activity log, Account, Backup.
- **Three roles**: `admin` (technical/support account), `owner`, `barber`. Permissions are enforced both in server code and in the database (RLS).
- **Minimal data** by design (UK GDPR friendly): no customer emails, no notes, no analytics or tracking.

---

## 2. Technology stack and project structure

### Stack (use current stable versions; check each package's docs for API changes before use)
- **Next.js 16 App Router**, React 19, TypeScript, **Cache Components on** (`cacheComponents: true`, `'use cache'`, `cacheTag`, `updateTag`).
  Next 16 uses `src/proxy.ts` (not `middleware`). Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Tailwind CSS 4** + **shadcn/ui** (Base UI primitives) + **Lucide** icons, `tw-animate-css`.
- **Supabase**: Postgres, Auth (password + TOTP MFA), Storage, RLS, `pg_cron`, `btree_gist`. Clients via `@supabase/ssr` and `@supabase/supabase-js`.
- **Zod** for all input validation. **date-fns** + **@date-fns/tz** for time zone logic.
- **sharp** (server image re-encoding to WebP), **heic-to** (browser HEIC conversion, lazy-loaded), **web-push** (pin a well-established version) for VAPID push.
- **Resend** (HTTP API) for owner alert emails.
- **Tests**: Vitest + Testing Library + jsdom (unit), Vitest against local Supabase (DB/RLS), Playwright + `@axe-core/playwright` (e2e, accessibility).
- **Local dev**: Supabase CLI (Docker), `docker-compose.yml` with an `app` service (dev server) and an `e2e` profile (official Playwright image).
- **Production**: Vercel (Node runtime, region near the database) + Supabase Cloud (Free plan is enough). Node ≥ 22.

### Folder structure
```
src/
  app/
    (public)/            homepage, /book (flow + actions), /booking/[token] (customer's private page), error.tsx, layout.tsx
    (staff)/
      login/             username + password, /login/2fa code step
      dashboard/         layout (shell + Suspense), page (Today), calendar, clients, clients/[id], team, team/[id],
                         services, website, settings, activity, account, backup (+ download/route.ts), more,
                         booking-actions.ts, error.tsx, loading.tsx, not-found.tsx
    api/availability/    GET free start times (server-side secret key, returns times only)
    api/health/          DB check, used by uptime cron
    auth/signout/        route handler
    layout.tsx, globals.css, not-found.tsx, global-error.tsx, robots.ts, sitemap.ts, icon/apple-icon/opengraph-image
  components/
    ui/                  shadcn (button, input, label, native-select)
    public/              header, mobile menu, hero, slideshow, services, gallery + lightbox, team, reviews, map, footer, sticky book bar, open status
    dashboard/           nav, sheet (<dialog>), booking board + cards, calendar view, client views, team editor, services, settings,
                         website editor + photos, activity filters, push alerts, backup/restore, form parts, loading skeletons
    auth/, theme/
  lib/
    domain/              PURE, fully unit-tested business logic: time, money, phone, hours, availability, messages, clients,
                         today, schedule, services, settings, team, website, activity, backup, push, validation, alerts
    booking/             availability loader, manage.ts, config (booking on/off switch)
    dashboard/           RLS-scoped queries (bookings, clients, team, activity, backup, restore)
    auth/                staff.ts (requireStaff), username.ts, password.ts, temp-password.ts, two-factor.ts, login-limit.ts
    notify/              owner-alert.ts (email), push.ts (web push)
    images/              shrink.ts (browser), process.ts (sharp)
    supabase/            public.ts (anon), server.ts (session), admin.ts (secret key, `server-only`), env.ts, database.types.ts (generated)
    site.ts, site-content.ts, theme.ts, connection.ts (safely()), audit.ts, visitor.ts, zip.ts, backup-file.ts, scroll-lock.ts
  proxy.ts
supabase/   migrations/ (one file per change, never edit an applied one), seed.sql (dev sample data + local logins), config.toml
public/     brand/ (generated logos), sw.js (push only), dashboard.webmanifest
scripts/    create-admin, reset-2fa, dev-code (prints local TOTP), seed-sample-images, photos-import, optimise-logo, backup-prod
tests/      unit/, db/, e2e/, smoke/ (read-only checks of a deployment)
docs/       supabase-guide.md (beginner), launch-guide.md
```

### npm scripts
`dev`, `dev:phone` (HTTPS tunnel for real-phone testing; push needs HTTPS), `build`, `start`, `lint`, `typecheck` (`next typegen && tsc --noEmit`),
`test`, `test:db`, `test:e2e` (seeds sample images if empty, builds, runs Playwright against the production build), `test:smoke`,
`db:start`/`db:stop`/`db:reset`/`db:types`, `create-admin[:prod]`, `reset-2fa[:prod]`, `dev:code`, `seed:images`, `photos:import`, `backup:prod`, `assets:logo`.
Use non-default local ports to avoid clashes with other projects.

### Environment variables (`.env.example`, no real values ever committed)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only), `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SHOW_PLACEHOLDERS` (dev only), `NEXT_PUBLIC_BOOKING_ENABLED`, `RESEND_API_KEY`, `OWNER_ALERT_EMAIL`, `ALERT_FROM_EMAIL` (optional),
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server only), `VAPID_SUBJECT` (optional, real https URL or mailto), `BACKUP_DIR` (local only).
Without the email or VAPID keys, those features switch off gracefully and say so.

---

## 3. Design direction (must be new and original)

Create a **modern, stylish, distinctive visual identity** built around `{{BRAND_COLORS}}`, `{{BRAND_FONTS}}` and `{{LOGO}}`.
**Do not reproduce the reference project's layout, styling or identity.** In particular, do not reuse: a gold/ink colour scheme, a gold header or footer,
condensed uppercase sign-style headings paired with a script wordmark, a hero with the shop photo in a tall rounded frame with text on a dark fade,
a scrolling marquee strip of services under the hero, the same section order and headings, or a gold-on-black dashboard. Propose your own.

Deliverables before building pages:
1. A short **design brief**: mood, 2–3 adjectives, layout concept, how the brand shows up on phone vs desktop.
2. **Design tokens** as CSS variables mapped to shadcn tokens (`--background`, `--foreground`, `--primary`, `--accent`, `--muted`, `--border`, `--ring`, status colours
   for request/confirmed/done/no-show), each in light **and** dark. Every text/background pair meets **WCAG 2.1 AA** (write a unit test that parses
   `globals.css` and checks contrast).
3. **Typography scale** (headings, body, prices with tabular figures, small labels) using `next/font` (self-hosted, no layout shift).
4. A **component sketch** of the homepage (phone 390px, tablet 768px, desktop 1280px+), the booking flow, and the dashboard shell.

Requirements:
- **Phone-first** (design at 390px, check 320–430px), then tablet and desktop with layouts that use the extra width (not just stretched phone layouts).
- Tap targets ≥ 44px; visible focus; labelled inputs; skip link; semantic landmarks; errors with `role="alert"`.
- **Light and dark themes** with **no flash** on load (small inline script sets the theme before paint). The public site and the dashboard keep
  **separate** theme preferences (localStorage). The public default theme for new visitors is a Setting; a visitor's own toggle wins.
  Decide per brand whether `/book` uses a fixed theme for clarity (the reference kept it always light).
- `theme-color` meta matches the header/status bar in each area and theme; `viewport-fit=cover` with safe-area padding for notched phones.
- Honour `prefers-reduced-motion` (no autoplay, no scroll reveals, no push-in zooms). Motion should be subtle and purposeful.
- Performance targets on a mid-range phone: LCP ≤ 2.5 s, CLS ≤ 0.1. Use `next/image` with correct `sizes`; only the first hero image loads eagerly.
  Avoid expensive `backdrop-filter` blur on scrolling elements.
- No horizontal scroll at any width (test it).
- The dashboard can share the brand but should prioritise clarity: neutral surfaces, clear status colours, dense but readable lists.

---

## 4. Public website

### 4.1 Global
- **Header**: logo/wordmark linking home, nav to homepage sections, theme toggle (shows the real current theme), Call, Book button (desktop).
  Sticky, respects safe area.
- **Phone menu**: full-screen panel with section links, address, Book + Call. Closes on pick, Esc or close; focus moves in and back; page doesn't scroll behind.
- **Sticky Book bar** on phones, hidden (`inert`, slid off-screen) while the hero's Book button is visible, so only one Book button shows at a time.
- **Footer**: call to action (Book + Call), address, contact, hours, payments, © and a discreet **Staff login** link.
- **Error pages**: public `error.tsx` (try again, home, call), root `not-found.tsx`, `global-error.tsx` (own inline-styled document).
- **SEO**: `robots.ts` (disallow `/dashboard`, `/login`, `/api`, `/booking`), `sitemap.ts` (`/`, `/book`), OG image, `BarberShop` JSON-LD with
  name, phone, address, socials, payments (no self-reported review markup). `/booking/*` is `noindex`.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  CSP `frame-ancestors 'none'`, `Permissions-Policy` (camera, microphone, geolocation, browsing-topics off), `poweredByHeader: false`.

### 4.2 Homepage content (choose your own order, layout and section titles)
All content comes from `getSiteContent()` (`'use cache'`, `cacheTag("site-content")`, refreshed hourly; every dashboard edit calls `updateTag`).
Every section has an honest empty state and disappears or degrades gracefully when there's no data (day one: no photos, no rating, no reviews).
1. **Hero**: shop name, area, shop photo (`settings.shop_photo_path`; logo-led design if none), **Book** + **Call**, live **Open now / Closed**
   (with next opening time), payment info, Google rating linking to Google (if set).
   *Open now must be computed in the browser in `{{TIMEZONE}}` and refreshed every minute; never read the clock in cached/prerendered code.*
2. **Slideshow** of "slideshow" gallery photos (max 3 visible): autoplay with progress indicator, prev/pause/next, swipe on phones, pause on hover/focus;
   no autoplay with reduced motion. Hidden entirely if no photos.
3. **Services & prices**: each active service with price and duration, linking to `/book?service=<id>`. Discount text shown if set.
4. **Recent cuts** gallery (max 3 visible) with an accessible `<dialog>` lightbox (keyboard arrows, swipe, Esc, focus return).
5. **Team**: barbers with `show_on_site` (photo or initials, name, title, optional bio), each with "Book with <name>" → `/book?barber=<id>`.
   Titles never reveal who the owner is.
6. **Reviews**: overall Google rating + count (from Settings), review cards (stars, name, date, "Google" label only if flagged), keyboard-reachable scroller.
7. **Visit / location**: address, Call, socials, payments, walk-in text, weekly opening hours (grouped, e.g. "Mon–Fri"), upcoming closed days,
   and a **map card**: a styled static preview first; the Google Maps embed loads **only after the visitor taps "Show map"** (privacy: no request to Google before),
   choice remembered on that device; Directions (Google) and Open in Apple Maps links.

### 4.3 Booking flow `/book`
Steps: **Service → Barber (or "Any barber") → Date & time → Name & mobile → Request sent**.
- Preselect from `?service=` and `?barber=` (read on the server so the flow is in the first response). Choosing an option advances automatically.
- Back keeps choices; focus moves to each step heading; the phone's Back button works; summary has "Change" links per step.
- Barber step shows photos (fallback initial) and only barbers who offer the chosen service and take bookings.
- Dates: swipeable strip over the booking window; days with no free time are disabled. Times grouped Morning / Afternoon / Evening.
  Barber switcher on the time step. A "no times" card offers WhatsApp/Call.
- All times are shown in `{{TIMEZONE}}` regardless of the device's time zone (test with a foreign device zone).
- Details: name (1–80 chars, whitespace collapsed) + mobile (§6.4). Hidden **honeypot** field. Submit button disabled while sending (no duplicates).
  Controlled inputs: typed values survive errors.
- **Slot taken mid-flow**: friendly message, fresh times, name and phone kept.
- Lost connection while sending: a normal error message (use a `safely()` wrapper around server action calls), not a crash.
- **Request sent** = redirect to the customer's private page `/booking/<token>` (full page load, so the flow never reopens with stale state).
  It clearly says the booking is **not confirmed until the shop replies**, and shows service, barber, time, price, address.
- **Online booking switch**: `NEXT_PUBLIC_BOOKING_ENABLED`. When off (or no services / nobody bookable), `/book` shows a "call us / WhatsApp" panel and
  the API and action refuse.

### 4.4 Customer's private page `/booking/[token]`
- Opened **only** by its `manage_token` (random UUID). Phone numbers aren't verified, so **never** look a booking up by number.
- Shows status (request / confirmed / cancelled …), details, and the number the shop will message.
- Actions: **Change** (opens the booking flow with service and barber filled in; the customer's current slot counts as free; nothing to retype),
  **Cancel** (asks first), WhatsApp the shop (message prefilled), Call, **Book another** (name/number prefilled, labelled "Who is this for?"; a different
  name is stored on that booking only as `booked_name`), Copy link.
- Change/cancel stop at `settings.change_cutoff_minutes` before the appointment (default 120), **enforced in the database**; after it, the page asks the customer to message or call.
- A change is **one transaction**: if the new time fails, the old booking is untouched. The changed booking goes back to the shop as a request; the same link keeps working.

### 4.5 `GET /api/availability`
Returns free **start times only** for a service (+ optional barber) over the whole booking window in one response. Runs server-side with the secret key.
Must **never** return names, phones or booking details. Unknown/inactive service → 404.

---

## 5. Booking rules and validation

### 5.1 Availability (pure TypeScript in `domain/availability.ts`, mirrored in SQL inside `request_booking`)
- **15-minute grid** for customer start times; the full service duration must fit.
- Must fit **shop hours** and the **barber's weekly hours** for that day (one opening window per day; days missing/null = closed).
- Excludes **closures** (whole shop days), the barber's **time off** (whole days, inclusive range), and existing **pending/confirmed** bookings.
- **Minimum notice** (`settings.min_notice_minutes`, default 120; choices 0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880) and
  **booking window** (`settings.booking_window_days`, default 30, range 1–365).
- **"Any barber"** returns slots where at least one eligible barber is free. The **database** picks the barber: earliest free → fewest bookings that day → staff sort order.
- All wall-clock logic in `{{TIMEZONE}}`, DST-safe. Unit-test both DST change days and round-trip every quarter hour.
- Write a **parity test**: slots computed in TS are accepted by `request_booking()`, and times just outside are rejected.

### 5.2 `request_booking()` RPC (security definer, **service role only**)
Called only by the server action with the secret key. Takes the shop-wide advisory lock first. Re-checks everything, then inserts a `pending` `online` booking
with a snapshot of service name/price/duration. Parameters: service, staff (null = any), start, name, phone (E.164), `p_replaces` (manage token for a change),
`p_ip_hash` (visitor key). Behaviour:
- Finds or creates the client by phone; **never renames** an existing client (a different name goes into `booked_name`).
- **Idempotent**: the same request sent twice returns the first one (`is_new = false`), safe after lost signal.
- Refuses an overlapping booking for the same person (`already_booked`).
- Per phone: at most `settings.max_open_requests` waiting requests (default 3, range 1–20) → `too_many_requests`.
- Per visitor: 10 new requests per hour (hashed address in `request_attempts`, kept 1 hour) → `rate_limited`.
- Error codes, each mapped to a friendly message in `domain/validation.ts`: `service_unavailable`, `not_changeable`, `invalid_name`, `invalid_phone`,
  `invalid_time`, `already_booked`, `too_soon`, `too_far`, `shop_closed`, `outside_hours`, `too_many_requests`, `rate_limited`, `barber_unavailable`, `slot_taken`.
- Companion RPCs (service role only): `get_managed_booking(token)`, `cancel_managed_booking(token)`.

### 5.3 Overlap safety
- Postgres **exclusion constraint** (`btree_gist`) on `(staff_id, tstzrange(starts_at, ends_at, '[)'))` where status in (`pending`, `confirmed`).
  Simultaneous requests for one slot: exactly one wins, the rest get `slot_taken` (test with 5–8 concurrent requests).
- The booking write trigger takes a **shop-wide advisory lock** (prevents deadlocks between simultaneous requests). Keep it.
- Overlap errors (SQLSTATE `23P01`) from staff actions become "That time overlaps another booking for this barber."

### 5.4 Booking status machine (enforced by a DB trigger and mirrored by `availableActions()` in TS)
- `pending` → `confirmed` / `declined` / `cancelled`
- `confirmed` → `completed` / `no_show` / `cancelled`
- `completed` / `no_show` → `confirmed` (undo)
- Pending requests never auto-expire: highlighted after **12 h**; once their time has passed they show "Expired" and can only be declined.
- Every staff update applies only to the state the button was shown for (e.g. Accept requires pending and not yet started), so double taps and stale screens can't apply twice.

### 5.5 Booking sources
`online` (customer), `walk_in` (staff, now-ish), `staff` (phone booking or "Book again" by staff).
- **Walk-in** (`create_walk_in()` RPC, security definer, signed-in staff): confirmed, current price, 5-minute grid, from a week back to a day ahead,
  phone optional (anonymous walk-in = no client row; a name requires a mobile); reuses a client by phone without renaming (typed name → `booked_name`).
  Barbers only for themselves; owner/admin for any bookable barber; never the admin account. Unnamed walk-ins display as "Walk-in customer".
- **Phone booking** (`create_staff_booking()` RPC): future only, 5-minute grid, up to a year ahead, client found/added by number, confirmed, source `staff`.
- Staff-chosen times show **warnings, never blocks** (closed day, outside shop hours, outside barber hours, time off), computed in `domain/schedule.ts`;
  the button then reads "Book anyway / Save anyway / Move anyway". Overlaps are always refused.

### 5.6 Messages (`domain/messages.ts`, plain text, no emoji, built on demand)
Kinds: **accepted**, **declined** (optional reason ≤200 chars), **updated** (rescheduled / barber or service changed), **cancelled**, **due-back reminder**,
and the customer's "I'd like to change my booking" WhatsApp to the shop. Accepted/updated include service, barber, date + time, price, address and the
private manage link. Declined/cancelled link to `/book` only while online booking is on. Links: `https://wa.me/<digits>?text=…` and `sms:<E164>?&body=…`.
Tapping either sets `message_sent_at`. Reschedule, change barber, change service and cancel reset it (the customer needs a new message).

---

## 6. Data model (Supabase Postgres)

Kept deliberately small. RLS on **every** table. Money in integer pence. Times as `timestamptz`.
Weekly hours JSON: keys `"1"`–`"7"` (ISO weekday), value `{"open":"HH:MM","close":"HH:MM"}` or null; validated by `app.valid_weekly_hours()`.

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `settings` (single row, `id = 1`) | `shop_hours`, `min_notice_minutes`, `booking_window_days`, `due_back_weeks` (default 5, 1–52), `max_open_requests`, `change_cutoff_minutes`, `google_rating` (0–5), `google_review_count`, `google_review_url` (https), `public_theme` (light/dark), `walk_in_text`, `discount_text`, `shop_photo_path`, `updated_at` | **Publicly readable: never store private values here** |
| `services` | `name` (1–80), `price_pence` (0–100000), `duration_min` (5–480, multiple of 5), `active`, `sort` | Can't delete once booked (FK restrict): switch off instead |
| `staff` | `user_id` → `auth.users` (unique, set null), `username` (`^[a-z0-9._-]{3,30}$`, unique), `display_name`, `role` (`admin`/`owner`/`barber`), `bookable`, `title`, `bio` (≤600), `photo_path`, `weekly_hours`, `show_on_site`, `active`, `sort`, `deleted_at` | Check: admin is never bookable or shown on site |
| `staff_services` | `staff_id`, `service_id` (PK both) | Who does which service; anon-readable |
| `time_off` | `staff_id`, `starts_on`, `ends_on`, `reason` (≤100) | Whole days, inclusive |
| `closures` | `closed_on` (unique), `reason` | Shop closed days |
| `clients` | `name`, `phone` (E.164, unique), `created_at` | Identity is the phone number |
| `bookings` | `client_id` (set null on delete), `staff_id`, `service_id` (restrict), snapshot `service_name`/`price_pence`/`duration_min`, `starts_at`, `ends_at`, `status`, `source`, `any_barber`, `decline_reason`, `message_sent_at`, `manage_token` (unique), `booked_name`, `changed_from`, `cancelled_by_client`, timestamps | Exclusion constraint (§5.3) |
| `gallery_photos` | `path`, `alt` (required description ≤160), `visible`, `in_hero` (slideshow vs Recent cuts), `sort` | Max 3 **visible** per set (trigger `app.gallery_limit`) |
| `reviews` | `author_name`, `body`, `stars` (1–5), `review_date` (not future), `is_google`, `visible`, `sort` | |
| `audit_log` | `at`, `actor_id`, `actor_name`, `action`, `entity`, `entity_id`, `summary` (≤200), `actor_is_admin` (set by trigger) | Staff actions only; 90-day retention |
| `request_attempts` | `ip_hash`, `at` | Service role only; 1 hour |
| `login_failures` | `visitor_hash`, `user_hash`, `at` | Service role only; 1 hour; keyed hashes only |
| `push_subscriptions` | `endpoint` (PK), `user_id` → `auth.users` (cascade), `p256dh`, `auth` | Linked to the **login**, not `staff`; service role only |

Views: `client_stats` (`security_invoker`; visits, spend, no-shows, last/next visit, usual service/barber, derived from bookings; barbers only see their own visits/spend)
and `public_team` (anon-safe staff columns: no usernames or hours).
Client labels are **derived, not stored**: **Regular** = 3+ completed visits; **New** = no completed visit; **Due back** = last completed visit > `due_back_weeks` ago and nothing upcoming.

Indexes only where a query needs them (bookings by start, by client, pending by created_at; clients by lower(name); audit by time; time_off by staff/end). No "just in case" tables or columns.

### 6.1 Helper functions (private, unexposed `app` schema)
`app.my_staff_id()`, `app.my_role()`, `app.is_manager()` (owner/admin), `app.is_admin()`, `app.mfa_ok()`, `app.london(ts)`, `app.pounds(pence)`,
`app.fits_hours(...)`, `app.valid_weekly_hours(...)`, trigger functions `app.audit()`, `app.audit_mark_admin()`, `app.bookings_before_write()`,
`app.staff_before_update()`, `app.gallery_limit()`.

### 6.2 Other RPCs
`delete_client(id)` (owner/admin; one transaction: cancels open future bookings, deletes the client, past bookings keep revenue with `client_id = null`, clears
`booked_name`, replaces their name with "Deleted client" in audit summaries) · `delete_staff(id)` (under the booking lock; no history → row removed; history →
hidden `deleted_at` row with name only, username freed; refused while they have upcoming bookings) · `purge_old_data()` (service role/cron) ·
`restore_backup(tables, admin_user)` (service role) · `login_wait_seconds`, `record_login_failure`, `clear_login_failures` (service role) ·
`two_factor_ok()` (authenticated) · `end_user_sessions(user)` (service role) · `tables_missing_2fa_policy()` (for tests).

### 6.3 Storage
Public buckets `gallery` (photos under `photos/`, shop photo under `shop/`) and `team`, **WebP only**, manager-only write policies.
Private bucket `restore-snapshots` (no policies; secret key only).

### 6.4 Phone numbers
Default `{{PHONE_COUNTRY}}` = **UK mobiles only** (the shop replies by WhatsApp/SMS): accept any typed form (`07…`, `7…` without the zero, `+44…`, `0044…`, `4407…`,
spaces/dashes), normalise to E.164, require exactly 11 national digits, refuse landlines/other countries with
"Please enter a UK mobile number, e.g. 07123 456789". Helpers for display format and `wa.me` digits. Adapt the rules if the new shop is elsewhere.

### 6.5 Retention (nightly `pg_cron` job, e.g. 03:15 UTC)
Delete declined/cancelled/never-answered bookings whose appointment was > 90 days ago (keep completed and no-show), audit entries > 90 days,
and clients with no bookings left created > 90 days ago. Returns counts.

---

## 7. Roles and permissions (source of truth: enforce in server actions **and** RLS)

| Area / action | Admin | Owner | Barber |
| --- | :-: | :-: | :-: |
| Sign in, change own password, own two-step sign-in, own dashboard theme | ✓ | ✓ | ✓ |
| See bookings | All | All | Own |
| Accept / decline requests, send WhatsApp/SMS | All | All | Own |
| Walk-in, phone booking, done, no-show, cancel, undo | All | All | Own |
| Reschedule (time) | All | All | Own |
| Reassign a booking to another barber | ✓ | ✓ | ✗ |
| Change a booking's service or price (also once done) | ✓ | ✓ | ✗ |
| Clients: list, history, rebook | All | All | Own clients (≥1 booking with them) |
| Edit a client's name or number | ✓ | ✓ | ✗ |
| Delete a client (on request, GDPR) | ✓ | ✓ | ✗ |
| Revenue figures | Shop | Shop | Own |
| See admin accounts in the team | ✓ | ✗ | ✗ |
| Team: add/edit/deactivate barbers, photos, bios, services, show on site | ✓ | ✓ | ✗ |
| Working hours and time off | Edit all | Edit all | View own |
| Reset a user's password | Anyone else | Barbers | ✗ |
| Reset a user's two-step sign-in | Anyone else | ✗ | ✗ |
| Delete a barber's account (not yourself; not with upcoming bookings) | ✓ | ✓ (barbers) | ✗ |
| Create/remove owner or admin accounts, change roles | ✓ | ✗ | ✗ |
| Services and prices | Edit | Edit | View |
| Website content (shop photo, slideshow, gallery, reviews) | ✓ | ✓ | ✗ |
| Settings (hours, closures, booking rules, Google, website text, site theme) | ✓ | ✓ | ✗ |
| Activity log | ✓ | ✓ (no admin entries) | ✗ |
| Backup page, download, reminder, restore, undo restore | ✓ | ✗ | ✗ |

Admin is a technical/support account: it is never a barber and never takes bookings. Admin rows in `staff` and admin entries in `audit_log`
are visible only to admins. Nobody can switch themselves off or delete themselves. Pure rules in `domain/team.ts`, unit-tested.

---

## 8. Staff dashboard

### 8.1 Shell
- Phone: bottom tab bar (safe-area aware, steps aside while a text field has focus). Desktop: left sidebar with the same items.
  - Owner/Admin: **Today · Calendar · Clients · Team · More** (More → Services, Website, Settings, Activity, Account, Backup for admins)
  - Barber: **Today · Calendar · Clients · Me** (Me = Account + own hours/time off + read-only Services)
- Header: name/role, **bell** with pending request count (links to Requests), theme toggle, sign out.
- Every page has its own `<Suspense>` with a skeleton matching its layout (skeleton appears only after ~90 ms); session reads sit inside Suspense.
- **Sheets**: native `<dialog>`; bottom sheet on phones (above the keyboard, sticky title, scrolling body, pinned primary buttons), centred panel on desktop.
  Page scroll locked without jumping (iOS Safari safe). Use `flex: 1 1 auto` for the sheet body (iOS Safari collapses `flex-basis: 0`).
- **Auto-refresh** every 60 s while visible, paused while offline or while a sheet is open, refreshing once afterwards.
- Instant feedback via `useOptimistic` for filters, day/barber selection, reorder and hide/show, rolling back with an error on failure.
- "Are you sure?" inline confirm bar (focus starts on Keep) for destructive actions.
- Dashboard error, not-found and loading screens inside the shell.

### 8.2 Today
Greeting (time-of-day in `{{TIMEZONE}}`), date, **Walk-in** and **Booking** buttons; stats (bookings today, taken today vs expected, upcoming; revenue scoped by role);
**Requests** (all pending, soonest first; stale > 12 h highlighted; "Expired" when past; "Same number has another booking", "Changed by customer" flags) with
Accept/Decline on the card; **Needs closing** (confirmed bookings that have ended, not marked Done/No-show); **Next up** ("Now", "in 25 min"); today's schedule
timeline with a "now" line and barber filter (owner/admin); due-back count linking to Clients; admin backup reminder after 7 days without a download.
- **Booking card**: status colour, time, client, service · price · barber, chips, one primary action (Accept, or Done once started). Tap → details sheet with Call and every
  allowed action (from `availableActions()`): Message, Reschedule, Change barber, Change service/price, No-show, Cancel, Undo.
- After Accept/Decline/Reschedule/Cancel etc.: "Send to customer: WhatsApp | SMS" sheet with the prefilled text.

### 8.3 Calendar
Day / Upcoming tabs; week strip with booking dots/counts (screen readers hear the count); previous/next week keeps the weekday; "Back to today";
barber filter (owner/admin) with barber columns on desktop; "Show cancelled and declined" switch; Upcoming list grouped by day; Walk-in and Booking buttons
(start on the selected day). Selection lives in the URL (bookmarkable, Back works).

### 8.4 Clients
Search by name or phone typed any way (GET form, works without JS); filters **All / Due back / Regulars / New** with counts and useful sorting; owner/admin "Clients of"
barber filter; 20 per page with Previous/Next. **Client page**: labels, Call / WhatsApp / SMS (due-back clients get the reminder text ready), stats (visits, spent, no-shows,
last visit, usual service and barber), upcoming and past bookings (first 5, then "Show all"), **Book again** (defaults: usual service, 3 weeks ahead, usual time; then the
confirmation message sheet), **Edit details** (owner/admin; duplicate number refused), **Delete client** (owner/admin, explains what happens). Back link returns to the same
list state (only ever to a clients-list URL). Barbers get "not found" for other barbers' clients.

### 8.5 Team
List with photo/initials, role/title, status chips; Add barber (owner) / Add person with role (admin). New account: login created with the secret key
(`<username>@{{STAFF_EMAIL_DOMAIN}}`), profile inserted with the **signed-in user's session** (so RLS + audit apply), login removed again if the profile insert fails;
a **temporary password** (12 unambiguous characters) shown once with a copy button. New people start **hidden from the website and not taking bookings**, with shop hours
and all services prefilled. Member page tabs: **Profile** (name, title, bio, Takes bookings, Show on website), **Photo**, **Services**, **Schedule** (weekly hours editor,
finish after start; time-off range calendar that warns how many bookings fall inside), **Account** (role for admin, reset password with confirmation, reset two-step sign-in
(admin), switch off/on with upcoming-booking warning, delete account). Read-only for people you can't edit. Usernames can't change after creation.

### 8.6 Services
Owner/admin: add, edit (name, price in £ → pence, duration in 5-min steps up to 4 h), switch off/on, reorder (arrows behind a Reorder toggle on phones), delete only if never
booked. New service is offered by every bookable barber by default. The edit sheet explains existing bookings keep their snapshot. Barbers: read-only.

### 8.7 Website content
**Shop photo** (upload/replace/remove). **Slideshow** and **Recent cuts** sections, each with an "x of 3" meter: upload with drop zone and instant preview, required description
(alt text), show/hide, choose set (warning when full), reorder, replace, delete (removes the file too). **Reviews**: add/edit (name, 1–5 stars, text, optional date, From Google,
visible), reorder, delete, with a reminder to copy real reviews word for word. Every change calls `updateTag("site-content")`.

### 8.8 Settings
One card per topic, each saved separately (with a jump bar on phones): **Opening hours** (says how many upcoming bookings fall outside new hours; never moves them),
**Closed days** (today or later, no duplicates, warns about existing bookings), **Booking rules** (minimum notice, how far ahead, due-back weeks, waiting requests per phone,
change/cancel cut-off), **Google rating** (rating, count, https link; blank hides), **Website notes** (walk-in and discount lines; line breaks become spaces), **Website theme**
(default for new visitors).

### 8.9 Activity log
Owner/admin. Newest first, grouped by day, 50 at a time with "Show older" (id cursor), filters by person (incl. switched-off/deleted, labelled) and type (Bookings, Clients,
Team and accounts, Services, Settings and closures, Website). Human-readable labels for every action and changed column (`domain/activity.ts`).
**Audited:** booking accept/decline/cancel/done/no-show/reschedule/reassign/service change/walk-in/phone booking; service add/edit/disable; team and account changes,
role changes, password resets, 2FA on/off/reset; hours, time off, closures; settings; website content; client edits and deletions; backups and restores.
**Not logged:** logins, page views, customer browsing. Client numbers never appear in summaries.

### 8.10 Account (everyone)
Change password (current password checked, rate-limited), dashboard theme Light/Dark/System, **two-step sign-in** on/off, **booking alerts on this phone**
(turn on / send a test / turn off), own hours and time off (read-only for barbers), link to Services and prices.

### 8.11 Backup and restore (admin only)
- **Download backup**: `.zip` (own small zip writer, no extra dependency) with `backup.json` (every public table except `request_attempts`, `login_failures`,
  `push_subscriptions`; the login list without password hashes; photo file names) + `README.txt`; stays under Vercel's 4.5 MB response limit. Logged; Today reminds admins after 7 days.
  The table list is typed, so adding a table forces a decision (backed up or deliberately excluded).
- **Restore**: choose the zip → preview backup date and counts vs live counts → type `RESTORE` (checked on the server) → `restore_backup()` in one transaction
  (refuses mismatched columns/missing tables, truncates and refills in order, keeps audit flags, never lowers sequences, skips photos whose files are gone, unlinks missing logins,
  keeps the restoring admin active). Deleted logins are re-created with a random password. An automatic **undo snapshot** is saved first (renamed only after success);
  "Undo last restore" puts it back.
- Optional local script `backup:prod` (rows, logins, photos to a dated local folder, keeps the newest 8; read-only for the live site).

---

## 9. Authentication and security

- **Username + password** logins, no email needed: username → `<username>@{{STAFF_EMAIL_DOMAIN}}` in Supabase Auth. Case-insensitive usernames.
  Public sign-up disabled (`[auth] enable_signup = false`) but the email provider stays enabled (password logins need it). Accounts are created only by owner/admin, plus
  `npm run create-admin -- <username> "<Name>"` for the first admin (prints a one-time password).
- `/login`: logo, show/hide password, friendly errors, keeps the username on failure, returns to the requested page (dashboard paths only: no open redirects).
- **`requireStaff(roles?)`** on **every** dashboard page, server action and route handler, verified server-side (deactivated accounts are signed out with a message).
  `src/proxy.ts` is only the fast first gate (refreshes the session, redirects signed-out users); it lets server actions through so `requireStaff` can answer them.
  Sign out ends this device only and stops push alerts on it.
- **Login attempt limits** (because sign-in runs from server IPs): per visitor + username 5 failures / 15 min; per visitor 20 / 15 min; per username 50 / hour;
  checked before the password; unknown usernames limited the same way (no user enumeration); a success clears that visitor's failures.
  "Too many attempts. Try again in N minutes." Keyed hashes only, deleted after an hour.
- **Password rules** when changing your own (NCSC style): ≥10 chars with upper, lower and a number/symbol, or any 16+ char passphrase; never containing the username,
  name, shop words or common passwords; live checklist in the form, server has the final say.
- **Optional two-step sign-in (TOTP authenticator app)**, turned on per person in Account (QR code + key, confirm with a code; turning off needs a current code).
  Once on, that account needs an `aal2` session: `app.mfa_ok()` (aal2, or no verified factor) drives `requireStaff()` via `two_factor_ok()`, the role helpers, and a
  **restrictive `require_2fa` policy on every public table** (a DB test fails if a table lacks it). Wrong codes share the login limit. Admin can reset someone else's factor
  (and end their sessions); `npm run reset-2fa -- <username>` for recovery. Seeded dev secrets for local sample logins; `npm run dev:code` prints the code locally.
- **RLS everywhere.** Anon may only read public content: active services, visible gallery photos and reviews, settings, closures, `staff_services`, and staff via column grants
  + `public_team`. Booking RPCs used by the public are **service-role only**, called from server actions with the secret key, so limits can't be bypassed with the public key.
- `SUPABASE_SECRET_KEY` only in `src/lib/supabase/admin.ts` (`import "server-only"`), never `NEXT_PUBLIC_*`. Secrets in `.env.local` (gitignored); `.vercelignore` excludes `.env*`.
- Server actions: Zod validation, role + ownership checks, state-guarded updates; browser calls go through `safely()` (lost connection → normal message; redirects still work).
- Photo uploads: refuse non-images, re-encode on the server, strip metadata (e.g. location), apply EXIF rotation, size limits (server actions body limit ~5 MB).
- Push subscription endpoints accepted only from real browser push services (Google, Apple, Mozilla, Microsoft), max 10 per login.
- Include direct-call security tests: sign in as each role and call server actions **by id** (from the build's server reference manifest), skipping the UI, and assert refusals
  with nothing changed.

---

## 10. Integrations

- **Owner email (Resend)**: new request, customer change, customer cancel. Contains **name, service and time only, never the phone number**. Sent in `after()` so the customer
  never waits; a failed email never affects a booking. Off without `RESEND_API_KEY` + `OWNER_ALERT_EMAIL`.
- **Web push alerts (VAPID)**: admin and owner get every online request/change/cancel; a barber only those with them; never deactivated/deleted accounts; walk-ins and staff bookings
  don't alert. Text like "New booking request · <Name> · <Service> with <Barber> · <Day date, time>" (change shows old time), never the phone number. Tap opens Today (new) or Calendar.
  Encrypted per device; gone subscriptions (404/410) are removed. Rules and text in `domain/push.ts`.
- **WhatsApp / SMS**: deep links only (no paid API).
- **Google**: rating/link stored in Settings; keyless Maps embed loaded on tap; Directions links. Apple Maps link.
- **Vercel Cron**: daily `GET /api/health` (keeps a free Supabase project from pausing). **pg_cron**: nightly purge.

---

## 11. PWA (staff dashboard only)

- `public/dashboard.webmanifest` (linked from staff pages only): name `{{SHOP_SHORT_NAME}} Dashboard`, `id` and `start_url` `/dashboard`, `display: standalone`,
  brand background/theme colours, 192/512 icons. Apple Home Screen meta (`apple-mobile-web-app-capable`, status bar style that keeps icons readable on the header colour).
- `public/sw.js`: registered from the dashboard, scope `/dashboard`, **push + notification click only, no fetch handler, no caching, no offline mode**; served with `no-cache`.
  Wait on the registration itself, not `navigator.serviceWorker.ready` (it never resolves after navigating from `/login`, outside the scope).
- **Notifications bar** in the installed app until alerts are on: Turn on (asks permission from the tap), blocked → "How to fix" steps for iPhone/Android, Not now (per session).
  In a normal iPhone Safari tab, explain Add to Home Screen first (iOS 16.4+ needs the installed app). Today shows a one-time offer in browsers that can show alerts.
- Android: `interactive-widget=resizes-content` on the dashboard; iPhone keyboard height via `visualViewport`.
- Push and service workers need HTTPS: provide `npm run dev:phone` (temporary HTTPS tunnel) for real-phone testing.

---

## 12. Images

- Browser (`shrink.ts`): shrink large photos before upload (keep transparency), convert iPhone **HEIC** with `heic-to` loaded only when the browser can't read it;
  file pickers list `.heic,.heif`; show "Optimising… / Uploading…" and the saving ("6.2 MB → 640 KB").
- Server (`process.ts`, sharp): WebP, gallery/shop ≤ 1600 px, team ≤ 800 px, **≤ 2 MB** (lower quality, then size, until it fits), upright, metadata removed.
  Originals are not kept; replacing or deleting a photo deletes its file.
- A gallery photo is either slideshow (`in_hero`) or Recent cuts, never both, max **3 visible** in each (`PHOTOS_PER_SECTION` + DB trigger; hidden photos don't count).
- Children's photos start hidden until a parent's permission is confirmed; only upload photos customers have agreed to.

---

## 13. Caching and time rules

- Public pages read through `getSiteContent()` with `'use cache'` + `cacheTag("site-content")`; every dashboard edit to public content calls `updateTag("site-content")`.
  The public default theme is read via a cached `getPublicTheme()` in the root layout (no flash, still prerendered).
- Supabase clients used inside `'use cache'` must fetch with `cache: "no-store"` (otherwise Next's fetch cache survives deploys and serves stale content).
- Anything reading the session sits inside `<Suspense>`; call `connection()` before reading the clock in dynamic code. Never read the clock in cached/prerendered code;
  time-dependent UI (open now, relative times) runs in the browser.
- Times stored as `timestamptz`; display and rules in `{{TIMEZONE}}` with UK formats ("4:00pm", "Fri 9 Oct") or local equivalents.

---

## 14. Forms and UX conventions

- `useActionState`; submit disabled while pending; controlled inputs so values survive errors; labelled inputs; `role="alert"` errors (in Playwright use a `formAlert(page)`
  helper, because Next's route announcer is also an alert); success messages visible even when scrolled (above the tab bar on phones), auto-clearing.
- Native selects share one styled component; custom date/time dropdowns where iOS native boxes misbehave (blank empty dates, overlapping time boxes).
- Shared form parts: `useSave`, `Card`, `SaveBar` (sticky save on phones), `ConfirmBar`, weekly-hours editor.

---

## 15. Testing (only local/test data; never destructive against production)

- **Unit (Vitest)**: all of `lib/domain` (DST days, slot rules, phone/money edge cases, exact message text and links, labels, permissions, validation, push rules incl. a real
  encrypt/decrypt round trip, zip round trip, theme contrast), plus component tests for homepage empty states.
- **DB (Vitest vs local Supabase, guarded against non-local URLs)**: RLS matrix for anon/barber/owner/admin; exclusion constraint; status transitions and undo; price snapshot;
  every `request_booking` rule and error code; idempotency, limits; any-barber choice; 5–8-way concurrency; audit entries; client stats; delete client/staff; retention; restore;
  login limits; two-factor (every table has `require_2fa`); push subscriptions; TS/SQL availability parity.
- **E2E (Playwright, production build, `workers: 1`, waits for `/api/health`)**: projects **Pixel 7** first, then **Desktop Chrome**. Full booking journey verified in the DB,
  deep links, back navigation, slot taken mid-flow, double submit, simultaneous sends, foreign device time zone, manage/change/cancel, every dashboard area per role,
  phone layouts 320–430px with no horizontal overflow, sheets and keyboard stand-ins, push UI (stubbed push service), direct server-action calls, and **axe WCAG 2.1 AA in light
  and dark** on every page. Tests clean up after themselves.
- **Smoke (`SMOKE_URL=… npm run test:smoke`)**: read-only checks of a deployment (health, homepage images, security headers, no placeholder tags, `/book`, dashboard → login,
  robots, sign-up off, anon can't read bookings/clients/audit/usernames, availability returns times only).
- Typecheck and lint clean at the end of each task. Run the tests affected by a change rather than the whole suite every time.

---

## 16. Deployment

- Supabase Cloud project in `{{SUPABASE_REGION}}`; `supabase db push` (migrations only, **never the seed**); auth settings via config (sign-up off, email provider on,
  confirm email off); check the cron job; copy keys into Vercel env vars (secret key marked Sensitive; set both Production and Preview).
- Vercel project in `{{VERCEL_REGION}}`, custom domain, `NEXT_PUBLIC_SITE_URL` set to it. Push migrations **before** deploying code that needs them.
- Keep `NEXT_PUBLIC_BOOKING_ENABLED=false` until the owner confirms hours, durations and who does which service; then switch it on.
- Write `docs/launch-guide.md` (step by step, for a beginner) and `docs/supabase-guide.md` (plain-language Supabase explanation), and a `README.md`
  (links, how the parts fit, deploying, backups, what to do when something breaks). No secrets in any of them.

---

## 17. How to work

1. One task at a time: build → test → update `implementation-phases.md` (status, scope, tests actually run, notes) → stop for review.
2. Suggested order: (1) scaffold, Docker, theming, design tokens, logo assets · (2) schema, roles, RLS, audit, seed · (3) domain logic · (4) auth · (5) homepage ·
   (6) booking flow + availability API · (7) dashboard shell + Today · (8) booking actions + Calendar · (9) Clients · (10) Team · (11) Services · (12) Settings + Activity ·
   (13) Website content · (14) retention job, error/loading/empty states, performance · (15) customer manage link + owner email · (16) sign-in security + 2FA ·
   (17) push alerts + PWA · (18) backup/restore · (19) launch prep (headers, robots, sitemap, smoke tests, guides).
3. One new SQL migration per change; never edit an applied one. After schema changes: reset the local DB, regenerate types, run DB tests.
4. Every new table: RLS, a `require_2fa` policy, an audit decision, and a backup decision.
5. Don't commit or push unless asked. Finish each task with: changes, test results (only what actually ran), open issues, a Conventional Commit message, and the next task.

---

## 18. Do not

- Copy the reference shop's name, address, phone, staff, photos, reviews, ratings, logo, colours, fonts or layout.
- Include any real customer data, passwords, API keys or secrets in code, seeds, tests or docs.
- Store customer emails, notes, message text, analytics or page views.
- Put phone numbers in owner emails, push alerts or audit summaries.
- Look bookings up by phone number, expose the secret key to the browser, or return anything but start times from `/api/availability`.
- Add tracking scripts, or load Google Maps before the visitor asks.
