# Implementation phases

Spec: `new-barbershop-project-prompt.md`. One phase at a time: build → test → update this file → stop for review and commit.

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold, Docker, theming, design tokens, logo assets | Done (committed) |
| 1 | Schema, roles, RLS, audit, seed (Supabase) | Done (committed on `phase-1-database`) |
| 2 | Domain logic (time, money, phone, hours, availability, messages…) | Done (committed on `phase-2-domain`) |
| 3 | Auth (username login, requireStaff, proxy) | Done (committed on `phase-3-auth`) |
| 4 | Homepage | Done (committed on `phase-4-homepage`) |
| 5 | Booking flow + availability API | Done (committed on `phase-5-booking`) |
| 6 | Dashboard shell + Today | Done (committed on `phase-6-dashboard`) |
| 7 | Booking actions + Calendar | Done (committed on `phase-7-calendar`) |
| 8 | Clients | Done (committed on `phase-8-clients`) |
| 9 | Team | Done (committed on `phase-9-team`) |
| 10 | Services | Done (committed on `phase-10-services`) |
| 11 | Settings + Activity | Done (committed on `phase-11-settings`) |
| 12 | Website content | Done (committed on `phase-12-website`) |
| 13 | Retention job, error/loading/empty states, performance | Done (committed on `phase-13-retention`) |
| 14 | Customer manage link + owner email | Done (committed on `phase-14-manage`) |
| 15 | Sign-in security + 2FA | Done (committed on `phase-15-security`) |
| 16 | Push alerts + PWA | Done (committed on `phase-16-push`) |
| 17 | Backup / restore | **Done, awaiting review** |
| 18 | Launch prep (headers, robots, sitemap, smoke tests, guides) | Not started |

---

## Phase 0: scaffold, theming, design tokens, logo assets

**Scope**

- Next.js 16.4.6 (App Router, Turbopack, `cacheComponents: true`), React 19.3, TypeScript, Tailwind CSS 4.3, shadcn/ui
  (Base UI, `base-nova` style) with `button`, `input`, `label`, `native-select` resized to 44px tap targets.
- Design brief, tokens, type scale and component sketches: `docs/design-brief.md`.
- Tokens in `src/app/globals.css` (light `:root` + dark `.dark`, mapped to shadcn tokens, booking status colours).
- Fonts via `next/font`: Bricolage Grotesque (display) + Inter (body).
- No-flash theming (`src/lib/theme.ts`): inline `<head>` script, separate site/dashboard preferences, `theme-color`
  meta per area and theme, public default theme (dark until the Settings value exists in phase 1), `ThemeToggle`.
- Shop config `src/lib/site.ts` with the confirmed details below; `PlaceholderTag` for unconfirmed ones
  (only with `NEXT_PUBLIC_SHOW_PLACEHOLDERS=true`).
- Logo pipeline `npm run assets:logo` (`scripts/optimise-logo.mjs`): originals copied untouched to `assets/`;
  generates badge/wordmark WebP sizes (light + dark wordmark colourways), 192/512 + maskable app icons, `favicon.ico`,
  `icon.png`, `apple-icon.png`, Open Graph image.
- Holding homepage (`/`): name, area, Call, Directions, address, socials, badge logo. Replaced in phase 4.
- Dev-only `/design` token reference page (404 in production builds).
- Security headers + `poweredByHeader: false` (`next.config.ts`).
- `.env.example`, `.gitignore` (raw `photos/` excluded), `.vercelignore`, `vercel.json` (region `lhr1`, London),
  `docker-compose.yml` (`app` dev service on port 3417, `e2e` profile with the Playwright image), `.dockerignore`.
- Vitest + Testing Library + jsdom; `@playwright/test` installed (e2e suite starts in phase 4).

**Tests actually run**

- `npm test`: 83 passed (2 files). `theme-contrast.test.ts` checks every text pair ≥ 4.5:1 and UI pair ≥ 3:1 in
  both themes, plus matching token sets. `theme.test.ts` covers path → area, theme resolution, and runs the real inline
  script against jsdom (site vs dashboard keys, theme-color, blocked storage).
- `npm run typecheck`: clean. `npm run lint`: clean. `npm run build`: success, all routes prerendered.
- Manual: production server + Playwright screenshots at 390px and 1280px, light and dark: no horizontal overflow,
  correct `theme-color`, no console errors; response headers checked with curl.

**Notes**

- Windows: Vitest fails with "failed to find the current suite" when the working directory has a lowercase drive
  letter (`c:\`, as VS Code terminals give). `npm test` runs through `scripts/vitest.mjs`, which fixes the path first.
- `@types/node` set to 22 (matches Node 22; Vitest 5 needs ≥ 22).
- The brand is yellow + ink like the reference project's gold/ink, but it comes from the owner's own logos and price list.
  The design avoids every pattern listed in §3 (see the brief).
- `docker compose up app` was not run in this phase (the local Node toolchain was used).

**Suggested commit**

```
chore: scaffold Next.js 16 app with Salsa design tokens, theming and logo assets
```

---

## Phase 1: schema, roles, RLS, audit, seed

**Scope**

- Supabase CLI project (`supabase/config.toml`): own ports **47320–47329** (API 47321, DB 47322, Studio 47323,
  Mailpit 47324) so it runs beside other local stacks; public sign-up off (email provider on, no confirmations);
  TOTP MFA enabled; min password 10; `auto_expose_new_tables = false` (explicit grants only); realtime, edge
  runtime and analytics off.
- Migrations (one file per concern, `supabase/migrations/`):
  - `foundation`: `btree_gist`, private `app` schema, `app.london()`, `app.london_label()`, `app.pounds()`,
    `app.valid_weekly_hours()`, `app.fits_hours()` (DST-safe, Europe/London).
  - `tables`: every table in spec §6 with its checks; exclusion constraint `bookings_no_overlap`; indexes from §6 only.
    `audit_log` has one extra column, `changed text[]` (changed column names, for readable labels in the Activity log).
  - `auth_helpers`: `app.mfa_ok()`, `app.my_staff_id()` (null when switched off, deleted or missing the second
    step), `app.my_role()`, `app.is_manager()`, `app.is_admin()`, `public.two_factor_ok()`.
  - `triggers`: `app.bookings_before_write()` (shop-wide advisory lock, `ends_at` from duration, status machine,
    barbers can't change barber/service/price/client, message flag reset, read-only token/source);
    `app.staff_before_write()` (usernames locked, roles only by admin, nobody switches off themselves);
    `app.gallery_limit()` (3 visible per set); `app.audit()` + `app.audit_mark_admin()` on every staff-editable table
    with readable summaries (never phone numbers).
  - `rls`: revoke-all then explicit grants; RLS on every table; restrictive `require_2fa` on every table; policies
    per the §7 permission table; `tables_missing_2fa_policy()` for tests.
  - `views_storage`: `public_team` (anon-safe, no usernames/roles/hours), `client_stats` (security invoker, so barbers
    only count their own visits); buckets `gallery` + `team` (public, WebP only, ≤ 2 MB, managers write) and private
    `restore-snapshots`.
  - `initial_data`: settings row (public theme dark) and the 13 services from the price list.
- `supabase/seed.sql` (dev only, all labelled SAMPLE): logins `admin`, `owner`, `sam`, `jamie`, `off` (switched off),
  password `LocalDev-Sample-1`; sample hours, time off, closure, 4 clients on Ofcom drama numbers, bookings in every
  status relative to today, 2 sample reviews.
- Supabase clients: `src/lib/supabase/env.ts`, `public.ts` (anon, `no-store`, safe in `'use cache'`), `server.ts`
  (session via `@supabase/ssr`), `admin.ts` (secret key, `server-only`); generated `database.types.ts`.
- Scripts: `db:start`, `db:stop`, `db:reset`, `db:types`, `env:local` (writes local URL/keys into `.env.local`),
  `test:db`. Supabase CLI pinned as a dev dependency.

**Tests actually run**

- `npm run test:db`: **69 passed** (3 files, local Supabase; refuses non-local hosts).
  - RLS matrix: anon reads only public content (no usernames/roles/hours, no private tables, no writes, no staff
    RPCs); barber sees only own bookings/clients/time off and own `client_stats`, can reschedule own bookings but not
    change price/barber, can't touch others' bookings, admin row, activity, services, settings or team; owner sees
    everything except admin, edits barbers (audited), can't create owners/admins, change roles or switch self off;
    admin sees admin rows and admin-only activity; admin never bookable.
  - Bookings: `ends_at` from duration, DST storage, admin never bookable, overlap refused (23P01), back-to-back /
    other barber / freed slots allowed, **6 simultaneous inserts → exactly 1 wins**, full status machine incl. undo
    and 8 refused transitions, decline reason, read-only columns, message flag reset rules, audit text for accept and
    reschedule (no phone numbers), message-sent not audited.
  - Schema: every table has `require_2fa` and RLS; service role reads every table/view; **a verified factor on an
    aal1 session blocks all reads and writes**; weekly-hours validation; `fits_hours` on both 2026 DST change days;
    `pounds()`; single settings row; settings audit; FK restrict on booked services; 5-minute durations; UK-mobile-only
    phones; `client_stats`; gallery limit; buckets and manager-only uploads.
- `npm test` 83 passed · `npm run typecheck` clean · `npm run lint` clean · `npm run build` success ·
  `supabase db lint` no errors.

**Notes**

- Booking RPCs (`request_booking`, walk-in, phone booking, manage-link RPCs) come in their phases (5, 7, 14);
  `delete_client`/`delete_staff` in 8/9; `purge_old_data` + `pg_cron` in 13; login limits in 15; restore in 17.
- Service **durations are placeholders** (marked in the migration); opening hours are empty until the owner confirms.
- Docker: the `app` container reaches local Supabase at `http://host.docker.internal:47321`, not `127.0.0.1`.
- Migrations haven't been pushed anywhere yet, so they may still be edited until the first `supabase db push`.

**Suggested commit**

```
feat(db): add Supabase schema, RLS, audit triggers, storage and sample seed
```

---

## Phase 2: domain logic

Pure, framework-free TypeScript in `src/lib/domain/`, fully unit-tested. Branch `phase-2-domain` (stacked on `phase-1-database`).

**Scope**

| Module | What it does |
| --- | --- |
| `time.ts` | London wall-clock conversions (`fromLondon`, `dateKey`, `minuteOfDay`), date-key arithmetic, UK display ("4:00pm", "Fri 9 Oct", "Today"), durations |
| `money.ts` | `formatPence`, `parsePounds` (form input), `penceToInput` |
| `phone.ts` | UK-mobile normalisation to E.164 from any typed form, display format, `wa.me` digits, the spec's error message |
| `hours.ts` | Weekly-hours schema (mirrors `app.valid_weekly_hours`), `fitsHours` (mirrors `app.fits_hours`), grouped hours ("Mon–Thu"), live open/closed status with next opening |
| `availability.ts` | Free start times over the booking window (15-min grid, shop + barber hours, closures, time off, overlaps, notice, window, "any barber"), `checkSlot` with the same error codes as `request_booking()`, `chooseBarber`, Morning/Afternoon/Evening grouping |
| `validation.ts` | Booking request schema (honeypot, name, mobile, ids, ISO time), friendly message for every RPC error code, overlap/offline/generic messages |
| `messages.ts` | Accepted, declined, updated, cancelled, due-back and customer change-request texts; `wa.me` and `sms:` links |
| `today.ts` | Status machine (mirrors the DB trigger), `availableActions`/`primaryAction` by role, stale/expired flags, Needs closing, Next up, greeting, day stats |
| `schedule.ts` | Warnings for staff-chosen times (closed day, outside shop/barber hours, time off), walk-in/phone/move time rules, "… anyway" labels |
| `team.ts` | §7 permissions (`can`, edit/reset/switch-off/delete/role rules, admin visibility), username schema, login email, initials, profile schema |
| `clients.ts` | Regular / New / Due back labels, per-filter sorting, phone search fragments, safe back links, "Book again" defaults |
| `services.ts` | Service form schema (pounds → pence, 5-min steps up to 4 h), duration display, reorder helper |
| `settings.ts` | One schema per Settings card (booking rules, Google rating, website notes, theme, closed days), notice labels |
| `activity.ts` | Labels for every audit action and changed column, filter types, day grouping |

Deferred to their own phases (they depend on those features): `website.ts` (12), `alerts.ts` (14), `push.ts` (16), `backup.ts` (17).

**Decisions**

- **Booking window:** `booking_window_days = N` means today plus the next N−1 days (1 = today only).
- **"Any barber":** "earliest free" is read as *the barber who has been free longest before that time* (end of
  their last booking that day, or their start time if none), then fewest bookings that day, then staff order.
  `request_booking()` will use the same rule in phase 5.
- **Phones:** besides landlines and other countries, 070 personal numbers and 076 pagers are refused (07624 Isle of
  Man mobiles allowed). The SQL check is the looser backstop.
- Message wording is new (plain, no emoji) and covered by exact-text tests.

**Tests actually run**

- `npm test`: **250 passed** (11 files), including both 2026 DST days (every quarter hour round-trips), slots across
  both clock changes, a real device-time-zone switch (Tokyo vs Los Angeles give identical London slots), every
  `checkSlot` error code, any-barber choice and tie-breaks, exact message text and links (no emoji, no phone numbers),
  every action only leading to an allowed status, §7 permission rules, and labels for every audit-trigger action.
- The tests caught one real bug: bookings without an id were skipped when no booking was being changed
  (`undefined === undefined`). Fixed.
- `npm run test:db` 69 passed (unchanged) · `npm run typecheck` clean · `npm run lint` clean · `npm run build` success.

**Suggested commit**

```
feat(domain): add tested booking, availability, messaging and permission logic
```

---

## Phase 3: auth

Branch `phase-3-auth` (stacked on `phase-2-domain`).

**Scope**

- `src/lib/auth/staff.ts`: `checkStaff()` (once per request via React `cache`) and `requireStaff(roles?)` for every
  dashboard page, action and route handler. The user comes from `auth.getUser()` (asks the Auth server); the staff
  row is read with the secret key. Signed out → `/login`; switched off or deleted → signed out with a message;
  second step missing → `/login/2fa` (page comes in phase 15); wrong role → 404.
- `src/proxy.ts`: fast first gate only. Refreshes the session cookie (`getClaims()`, no DB query), sends signed-out
  visitors from `/dashboard…` to `/login?next=…`, lets server-action POSTs through.
- `/login`: logo, username + password, show/hide, friendly errors with `role="alert"`, keeps the username, returns
  to the requested dashboard page. `safeNextPath()` only allows `/dashboard` paths. Unknown usernames and wrong
  passwords get the same message. Usernames are case-insensitive. Accounts with a verified authenticator go to
  `/login/2fa`. Not indexed.
- `/auth/signout` (POST from the button, GET when an account is switched off): ends this device's session only.
- `src/lib/connection.ts`: `safely()` wrapper for actions used from forms (lost connection → normal message;
  redirects still work).
- `src/lib/supabase/server.ts` calls `connection()` so session work is never prerendered.
- `/dashboard`: placeholder ("Hi …, signed in as …", Sign out) until phase 6.
- `npm run create-admin -- <username> "<Name>"` (and `create-admin:prod`): creates the login + admin profile with a
  12-character one-time password from `src/lib/auth/temp-password.ts`; removes the login again if the profile fails.
- `/api/health` (DB check; used by Playwright now, by Vercel Cron at launch).
- Playwright set up: production build on port 3418, local Supabase only (refuses other hosts), Pixel 7 then
  Desktop Chrome, `workers: 1`, waits for `/api/health`; helpers for `formAlert`, axe and overflow checks.

**Tests actually run**

- `npm run test:e2e`: **24 passed** (12 tests × phone + desktop): signed-out redirect with return path; wrong
  password and unknown username give the same message and keep the username; empty form; show/hide password;
  case-insensitive sign-in returning to the requested page; sign out → message → dashboard locked again; off-site
  `next` ignored; switched-off account refused; **switching someone off signs them out on their next page load**;
  login page axe WCAG 2.1 AA in light and dark (also with an error shown) and no sideways scroll; `noindex`; health.
- `npm test`: 274 passed (adds open-redirect cases and temp-password checks).
- `npm run test:db` 69 passed · typecheck clean · lint clean · build success.
- Manual: `create-admin` success, duplicate username and invalid username.

**Notes**

- Login attempt limits, password rules and two-step sign-in come in phase 15 (spec §9). Until then Supabase Auth's
  own rate limit applies (it gets the "Too many attempts" message).
- `requireStaff()` is deliberately not cached across requests (no `use cache: private`), so switching someone
  off takes effect immediately.

**Suggested commit**

```
feat(auth): add username sign-in, requireStaff guard, proxy, sign-out and create-admin
```

---

## Phase 4: homepage

Branch `phase-4-homepage` (stacked on `phase-3-auth`).

**Scope**

- Migration `homepage`: `services.bookable_days` (null = every open day; OAP Cut = Mon–Thu), gallery limits
  **slideshow 3 / Recent cuts 4**, real opening hours, walk-in text "Walk-ins welcome.".
  Hours were read from the opening-times board in the shopfront photo: Mon–Fri 9:00am–6:30pm, Sat 8:30am–6:00pm,
  Sun 9:00am–4:00pm (editable in Settings later).
- Domain: bookable days in availability (`service_day` error code + friendly message) and staff warnings,
  `formatDays()` ("Mon–Thu"), `website.ts` (photo limits, meter, alt text).
- `getSiteContent()` / `getPublicTheme()` (`'use cache'`, tag `site-content`, hourly); the root layout uses the
  Settings default theme. `next/image` allowed for Supabase Storage (local IPs only when Supabase is local).
- `(public)` route group: header (badge + name, section links, theme toggle, Call, Book), full-screen phone menu
  (`<dialog>`, scroll lock, focus in and back), footer (CTA, address, hours, payments, ©, Staff login).
- Homepage: hero (live open status computed in the browser, Book + Call, payments, walk-in text, Google rating
  if set, tilted shop photo with badge sticker, logo fallback), services & prices (menu board, lengths, bookable
  days, discount text), Recent cuts (4) with lightbox, "Inside the shop" slideshow (3; autoplay with barber-pole
  progress, prev/pause/next, swipe, pauses on hover/focus, never with reduced motion), team, reviews (rating
  summary + cards), Visit (grouped hours, upcoming closed days, address, Call, WhatsApp, socials, click-to-load
  map remembered per device, Directions + Apple Maps), sticky phone Book bar (inert while the hero Book shows),
  `BarberShop` JSON-LD (no review markup). Each section hides when it has no data.
- `/book`: "call us / WhatsApp" panel while online booking is off (phase 5 adds the flow).
- `not-found.tsx`, `(public)/error.tsx`, `global-error.tsx`.
- Photos: `src/lib/images/process.ts` (sharp: upright, metadata stripped, WebP ≤ 1600 px, ≤ 2 MB) and
  `npm run photos:import` (`scripts/photos-selection.json`; `--if-empty`, `--replace`, `:prod`). Chosen: shopfront
  as the shop photo; interior, busy shop and window/barber pole for the slideshow; four adult cuts for Recent
  cuts. **The four photos of children were left out.** Source JPEGs live in `photos/converted/` (not committed).
- `PlaceholderTag` never renders in production builds; `theme-color` meta is created only by the theme script
  (no duplicate); prices use Inter (Bricolage's £ reads like "&"); `package.json` is `"type": "module"`.

**Tests actually run**

- `npm run test:e2e`: **71 passed** (phone + desktop): sections, 13 services with booking links, OAP "Mon–Thu
  only", 4 cuts, 3 slides, hours and walk-in text, WhatsApp link, hero and gallery images load, JSON-LD, security
  headers, no placeholder tags in production, **no request to Google before "Show map"** and the choice is
  remembered, lightbox (arrows, buttons, Esc, focus return), slideshow autoplay and controls (fake clock), **no
  autoplay with reduced motion**, theme toggle + theme-color + persistence, dark default for new visitors, `/book`
  panel, 404, **axe WCAG 2.1 AA on `/` and `/book` in light and dark**, no sideways scroll at 320–1280 px on `/`,
  `/book`, `/login`, phone menu (focus, Esc, link closes), sticky bar visibility/inert, desktop header — plus the
  phase 3 sign-in tests.
- `npm test` 292 passed (adds service days, `formatDays`, photo limits, homepage empty states).
- `npm run test:db` 74 passed (photo limits 3/4, `bookable_days` check, hours from the board).
- typecheck clean · lint clean · build success (`/` and `/book` static, refreshed hourly).

**Notes**

- WhatsApp uses the shop landline as asked; it only works if that number is on WhatsApp Business.
- iPhone HEIC photos must be converted before `photos:import` (the dashboard converts HEIC in the browser, phase 12).
- Service lengths are still placeholders; the sample team and reviews on the local site come from the dev seed only.

**Suggested commit**

```
feat(homepage): add public homepage, site content cache, photo import and bookable days
```

---

## Phase 5: booking flow + availability API

Branch `phase-5-booking` (stacked on `phase-4-homepage`).

**Scope**

- Migration `request_booking`:
  - `request_booking(p_service, p_start, p_name, p_phone, p_staff, p_replaces, p_ip_hash)`, service role only.
    Shop-wide lock; re-checks service, name, UK mobile, 15-min grid, notice, window, closures, shop hours,
    **bookable days**, barber hours, time off and overlaps (same error codes and order as `checkSlot()`).
    Idempotent (same request → first booking, `is_new = false`); `already_booked`; `max_open_requests` per phone;
    10 new requests/hour per hashed visitor (`request_attempts`, pruned to 1 hour); "any barber" = free longest →
    fewest bookings that day → staff order; finds or creates the client by phone and never renames them
    (different name → `booked_name`); exclusion violations become `slot_taken`.
  - **Changes** (`p_replaces` = manage token): one transaction; the old booking is cancelled (by client) with a
    fresh token and the new pending booking takes over the customer's link (`changed_from` set); refused after
    the cut-off (`not_changeable`); if the new time fails the old booking is untouched. The booking trigger now lets
    only the server (not signed-in staff) move a manage token.
  - `get_managed_booking(token)`, service role only.
- `src/lib/booking/load.ts`: one loader for the API route and the DB parity test (reads times only, never names
  or phones). `getBookingOptions()` (cached, `site-content` tag): services that someone offers + bookable barbers.
- `GET /api/availability?service=&barber=&change=`: start times only, grouped by London day, `no-store`; 404 for
  unknown/inactive services or when online booking is off; 400 for bad input.
- `/book`: Service → Barber ("Any barber" or barbers who do it, photo or initials) → Date & time (swipeable day
  strip, empty days disabled, Morning/Afternoon/Evening, barber switcher, "no times" card with WhatsApp/Call) →
  Name & mobile (honeypot, submit disabled while sending, typed values kept) → full page load to `/booking/<token>`.
  Steps live in the URL (Back works, deep links from price rows and "Book with …"), focus moves to each heading,
  summary card with Change links, times always in London time. Slot taken or any time problem → message, fresh
  times, back to the time step with name and number kept. Lost connection → normal message (`safely()`).
  Online booking off, or nothing bookable → call/WhatsApp panel.
- `/booking/[token]`: status ("Request sent … not confirmed until the shop replies"), service, barber, time,
  price, name, the number the shop will message, address; WhatsApp/Call/Directions; `noindex`. Change, cancel and
  "book another" come in phase 14.
- `src/lib/visitor.ts`: keyed hash of the visitor's IP (never the raw address).
- `npm run test:e2e` now runs `scripts/e2e.mjs`: imports photos if empty, builds with online booking **on**
  (`.env.local` stays off), runs Playwright.

**Tests actually run**

- `npm run test:db`: **97 passed**, including 23 new: every `request_booking` error code (`service_unavailable`,
  `invalid_name`, `invalid_phone`, `invalid_time`, `too_soon`, `too_far`, `shop_closed`, `service_day`,
  `outside_hours`, `barber_unavailable`, `slot_taken`, `already_booked`, `too_many_requests`, `rate_limited`,
  `not_changeable`), snapshot, idempotency, never renaming clients, any-barber choice, changes (link kept, old
  untouched on failure), **8 simultaneous requests → exactly 1 wins**, service-role only, and the **TS/SQL parity
  test**: every quarter hour 7am–8pm on two days for Sam and for any barber, with a blocking booking, rolled back
  per probe — TypeScript offers exactly the times SQL accepts, with the same error codes; plus boundary times and
  OAP bookable days.
- `npm run test:e2e`: **99 passed** (phone + desktop), adding: full journey saved as a pending online request,
  deep links, the phone's Back button, summary Change links, wrong number message with values kept, **slot taken
  mid-flow**, **double tap = one booking**, honeypot, OAP Fri–Sun disabled, **Tokyo device shows London times**,
  API returns start times only / 404 / 400, unknown tokens show "not found", **axe WCAG 2.1 AA on every step in
  light and dark**, no sideways scroll at 320px.
- `npm test` 294 passed · typecheck clean · lint clean · build success.

**Notes**

- `notFound()` on `/booking/<bad token>` renders the not-found page inside the streamed response, so the HTTP
  status stays 200 (the page is `noindex`).
- Online booking stays **off** (`NEXT_PUBLIC_BOOKING_ENABLED=false`) until the owner confirms service lengths and
  adds the real barbers.
- Owner email/push alerts for new requests come in phases 14 and 16.

**Suggested commit**

```
feat(booking): add booking flow, availability API and request_booking with parity tests
```

---

## Phase 6: dashboard shell + Today

Branch `phase-6-dashboard` (stacked on `phase-5-booking`).

**Scope**

- **Shell** (`dashboard/layout.tsx`): static frame that prerenders; everything reading the session streams in behind
  its own `<Suspense>`. Desktop sidebar (badge, items, "View website"), phone bottom tab bar (safe-area aware,
  slides away and goes `inert` while a text field has focus), sticky header with name · role, **bell** with the
  waiting-request count (links to `#requests`), theme toggle (dashboard preference) and sign out.
  Tabs per role from `lib/dashboard/nav.ts`: owner/admin Today · Calendar · Clients · Team · More; barber Today ·
  Calendar · Clients · Me. `interactive-widget=resizes-content` on dashboard pages.
- **Sheet** (`components/dashboard/sheet.tsx`): native modal `<dialog>`, bottom sheet on phones kept above the
  iPhone keyboard (`visualViewport`), centred panel on desktop, sticky title, `flex: 1 1 auto` body, pinned footer,
  backdrop tap / Esc / Close, focus returns, page scroll locked without jumping.
- **Auto-refresh** every 60 s (`router.refresh()`), paused while hidden, offline or a sheet is open; one catch-up
  refresh when that ends.
- **Skeletons** that appear only after ~90 ms (`.skeleton-delay`), one per page; dashboard `error.tsx` (uses
  `retry`), `not-found.tsx` and `loading.tsx` inside the shell; `[...missing]` so unknown dashboard URLs get the
  shell's not-found too.
- **Today**: greeting + date (London), stats (bookings today, takings taken vs expected, still to come; "Shop
  takings" for owner/admin, "Your takings" for barbers, scoped by RLS), due-back count linking to Clients;
  **Requests** (every pending request, soonest first; "Waiting over 12 hours" highlighted, "Expired", "Same number
  has another booking", "Changed by customer", "Any barber"); **Needs closing** (any day); **Next up** ("Now",
  "in 25 min"); **Today's schedule** with a "now" line and an instant barber filter (owner/admin).
- **Booking card** (coloured edge + status word, time, name, service · price · barber, chips) opens a **details
  sheet**: when, service, barber (and "any barber"), client / "booked as", mobile, status, source, decline reason,
  message sent, **Call**.
- Data: `lib/dashboard/bookings.ts` (session client only, so RLS decides what each role sees). Pure logic added to
  `domain/today.ts`: `bookingName` ("Walk-in customer" / "Deleted client"), `requestFlags`, `hasOtherBooking`,
  `sortRequests`, `scheduleWithNow`.
- More page (real menu; Backup for admins). Calendar, Clients, Team, Services, Website, Settings, Activity,
  Account and Backup are **placeholders** with their final role guards until their phases.
- Fixes: "Staff login" in the footer is a full page load, so the staff area's theme applies before paint;
  `ThemeToggle` takes an `area`. The e2e `expectNoHorizontalScroll` now also fails when a phone browser has zoomed
  out to fit wide content (the old check missed that; it caught a real overflow in the schedule filter here).

**Tests actually run**

- `npm test`: **317 passed** (23 new): booking names, every request flag and its order, request sorting,
  now-line placement (in progress, exact start, empty, other day, summer midnight), barber filter, nav per role
  and active item, auto-refresh (60 s, paused hidden/offline/sheet open, single catch-up, stops on unmount).
- `npm run test:e2e`: **129 passed, 7 skipped** (phone-only checks on desktop; Today tests that need hours left
  today skip near midnight). New: owner/admin/barber nav, More with/without Backup, role-guarded pages show
  not-found inside the shell, unknown URL, bell count, requests with all flags, needs closing, next up, now-line
  order, barber filter, **barbers never see other barbers' bookings**, details sheet (Call link, Esc, focus return,
  scroll lock), **auto-refresh with a fake clock, held while a sheet is open**, tab bar steps aside for typing,
  separate dashboard/site themes, sign out, **axe WCAG 2.1 AA on Today, the open sheet and More in light and
  dark**, no sideways scroll at 320/375/430 px, `noindex`.
- `npm run test:db` 97 passed (no schema change) · typecheck clean · lint clean · build success (every dashboard
  route partially prerendered).
- Manual: production build screenshots, phone and desktop, light and dark, Today and the open sheet.

**Notes**

- Deliberately left for phase 7 (booking actions): Accept/Decline/Done buttons on cards, the actions in the
  details sheet, Walk-in and Booking buttons, and the "Send to customer: WhatsApp | SMS" sheet. No button is shown
  until it works.
- Admin backup reminder comes with Backup (phase 17); the one-time alerts offer with push (phase 16).
- Barbers' "same number has another booking" only sees their own bookings (RLS), by design.

**Suggested commit**

```
feat(dashboard): add dashboard shell, sheet, auto-refresh and Today screen
```

---

## Phase 7: booking actions + Calendar

Branch `phase-7-calendar` (stacked on `phase-6-dashboard`).

**Scope**

- Migration `staff_bookings`: `create_walk_in()` and `create_staff_booking()` (signed-in staff, one shared
  `app.staff_booking()`): confirmed straight away at the current price; barbers only for themselves, owner/admin for
  any bookable barber, never admin or switched-off accounts; 5-minute grid; walk-ins from a week back to the end of
  tomorrow, phone bookings future only and up to a year ahead; walk-ins may be anonymous but a name needs a mobile;
  clients found by number and never renamed (typed name → `booked_name`); overlaps refused (23P01); audited as
  `booking.walk_in` / `booking.phone` by the existing trigger.
- Server actions `dashboard/booking-actions.ts`: accept, decline (optional reason ≤ 200), done, no-show, cancel,
  undo, reschedule, change barber (owner/admin), change service or price (owner/admin, also once done), walk-in,
  phone booking, "message sent". Each: `requireStaff`, Zod, reads the booking through RLS, checks
  `availableActions()`, then updates **only if the booking is still in the state the button was shown for**
  (double taps / stale screens → "This booking has just been changed…" and a refresh, nothing changed).
  Staff-chosen times give **warnings, never blocks** (closed day, outside shop/barber hours, time off, service
  day, barber doesn't do the service) and the button becomes "Move anyway / Save anyway / Book anyway".
- Pure logic `domain/staff-bookings.ts` (schemas, which message follows which action, error texts) and
  `domain/calendar.ts` (URL state, week, counts, grouping, barber columns).
- UI: booking cards get their one primary button (**Accept**, or **Done** once started); one sheet per page for
  details with every allowed action, Decline, Reschedule, Change barber, Change service/price, New walk-in/phone
  booking, and **"Send to customer: WhatsApp | SMS"** with the prefilled text (tapping either records
  `message_sent_at`; the text is never stored). "Are you sure?" bar (focus on Keep) for cancel and no-show.
  Success notices stay visible above the tab bar. **Walk-in** and **Booking** buttons on Today and Calendar.
- **Calendar** (`/dashboard/calendar`): Day / Upcoming, week strip with counts (spoken too), previous/next week
  keeps the weekday, "Back to today", barber filter (owner/admin), "Show cancelled and declined" switch, Upcoming
  grouped by day, desktop barber columns when showing everyone. Everything lives in the URL (bookmarkable, Back
  works, works without JavaScript); with JavaScript the choice highlights at once (`useOptimistic`).
- Fix found by the tests: React 19 resets a form after `<form action>`, snapping controlled selects back to their
  first option while the screen still showed the chosen one; sheet forms now submit without that reset.

**Tests actually run**

- `npm test`: **334 passed** (17 new): calendar URL state (round trip, rubbish ignored), Monday–Sunday weeks across
  months/years, counts per London day with/without cancelled, grouping, barber columns, every action schema
  (decline reason, 5-minute grid, walk-in/phone customer rules, mobile normalising), which message follows each
  action, message text with the change spelled out, database error → friendly text.
- `npm run test:db`: **108 passed** (11 new): both RPCs' rules and error codes, anonymous walk-ins, never renaming
  clients, a week back / end of tomorrow / a year ahead, 5-minute grid, barbers only for themselves, never admin or
  switched-off barbers, overlaps, switched-off services, audit actions, signed-out callers refused.
- `npm run test:e2e`: **158 passed, 16 skipped** (8 phone-only/desktop-only checks; 8 because the final run was at
  9:45pm London and the Today/quick-action tests need hours of the day left: those 4 tests passed on both projects
  in the earlier afternoon runs).
  New: Accept on the card → message with the private link → WhatsApp records "messaged" (link checked, never
  opened), audit entry; **stale screen changes nothing**; decline with reason; Done → Undo → No-show behind
  "Are you sure?"; cancel resets the "message sent" flag; **reschedule with warnings → "Move anyway"**, editing asks
  again, "changed" message, overlap refused; owner changes barber and service/price; barbers get no barber/service
  changes and only their own walk-ins; anonymous walk-in; phone booking adds the client; Calendar week strip,
  weeks keep the weekday, Back button, URL filters survive a reload, barbers can't widen the filter by URL,
  desktop barber columns, Upcoming; **axe WCAG 2.1 AA** on the sheets and the Calendar in light and dark; no
  sideways scroll at 320 px.
- typecheck clean · lint clean · build success.

**Notes**

- Direct server-action calls by id (spec §9) are planned with sign-in security in phase 15; here the database
  refuses the same things (RLS, trigger, RPC checks) and the DB tests prove it.
- Only Hair Cut-length test bookings are used; service lengths are still placeholders.

**Suggested commit**

```
feat(calendar): add booking actions, walk-ins, phone bookings, customer messages and Calendar
```

---

## Phase 8: Clients

Branch `phase-8-clients` (stacked on `phase-7-calendar`).

**Scope**

- Migration `clients`:
  - `client_list(filter, name, phone, staff, limit, offset)`: **security invoker** (RLS decides who is visible; a
    barber's visits and spend only count their own bookings), labels exactly as `domain/clients.ts`
    (Regular = 3+ visits, New = none, Due back = last visit older than the setting with nothing upcoming), useful
    sorting per filter, one page plus the count for every filter.
  - `delete_client(id)`: owner/admin, one transaction: cancels open future bookings, deletes the client, past
    bookings keep their revenue with no client and no name, the name is replaced with "Deleted client" in the
    activity log (and the noise of unlinking their bookings isn't logged).
- **Clients list** (`/dashboard/clients`): search by name or a number typed any way (plain GET form; results load
  from the address), All / Due back / Regulars / New with counts, owner/admin "Clients of" barber filter,
  20 per page with Previous/Next, label chips, last/next visit.
- **Client page** (`/dashboard/clients/[id]`): labels, Call / WhatsApp / SMS (due-back clients get the reminder
  text ready), stats (visits, spent, no-shows, last visit, usual service and barber), upcoming and past bookings
  (first 5, then "Show all") using the booking cards and their actions, **Book again** (usual service and barber,
  3 weeks ahead at the usual time, then the confirmation message), **Edit details** (owner/admin; duplicate number
  refused, values kept) and **Delete client** (owner/admin; says what happens, asks again with focus on Keep).
  "Back to clients" returns to the same list (only ever to a clients-list address). Barbers get "not found" for
  other barbers' clients and see "Spent with you".
- The booking sheet gained prefilled new bookings and a generic panel view (used for Edit and Delete).

**Tests actually run**

- `npm test`: **341 passed** (7 new): list URL round trip and rubbish ignored, safe back link, search arguments
  (numbers in any form → phone digits, names LIKE-escaped), page summary, edit schema.
- `npm run test:db`: **117 passed** (9 new): labels and counts match the seed, sorting, name and phone search,
  counts follow the search, "Clients of", barbers only see their own clients with only their own visits, paging,
  signed-out refused; delete: future bookings cancelled, past revenue kept without a name, name gone from the
  activity log (entries kept as "Deleted client"), owner/admin only, unknown ids refused.
  Two phase 5 tests were made independent of the day the local database was seeded (they relied on the seed's
  dates and failed the morning after a seed).
- `npm run test:e2e`: **188 passed, 8 skipped** (phone-only/desktop-only layout checks). New: filters with counts,
  search by name and by "+44 7700 900 003", Back returns to the same search, "Clients of", 20 per page,
  barbers' own clients only and "not found" for others, results load straight from the address, stats and usual
  service/barber, due-back reminder text in the WhatsApp/SMS links, **Book again** defaults and confirmation,
  **duplicate number refused** then saved, **Delete client** end to end, axe WCAG 2.1 AA (list, client page, edit
  sheet; light and dark), no sideways scroll at 320 px.
- typecheck clean · lint clean · build success.

**Notes**

- Dashboard pages stream behind Suspense, which needs JavaScript to show, so the "works without JavaScript" part
  of the search means: it's a plain GET form and the results come straight from the address.
- e2e tests share the local database with whatever you're browsing; cleanup only removes rows the tests created
  (test numbers 07700 9007xx/9008xx, or the exact booking a test made).

**Suggested commit**

```
feat(clients): add clients list, client page, book again, edit and delete
```

---

## Phase 9: Team

Branch `phase-9-team` (stacked on `phase-8-clients`).

**Scope**

- Migration `team`:
  - `delete_staff(id)`: owner (barbers) / admin (anyone else), never yourself, refused while they have upcoming
    bookings (under the booking lock). No history → row removed with their services and time off; history →
    hidden row with the name only, username and login freed. Returns the login and photo to remove.
  - `end_user_sessions(user)` (secret key only): signs a login out everywhere (password reset, switched off).
  - `log_account_event()`: password resets (done with the secret key) are logged under the person who asked.
- **Team list** (owner/admin): photo or initials, role/title, "you", chips (Takes bookings, On the website, Hidden,
  Switched off). Admin accounts only for admins (RLS). **Add barber** (owner) / **Add person** with a role (admin):
  login made with the secret key, profile inserted with the signed-in session (RLS + audit), login removed again if
  the profile fails; starts hidden and not taking bookings, with the shop's hours and every service; **temporary
  password shown once** with a copy button.
- **Member page** with tabs in the address: **Profile** (name, title, bio, Takes bookings, Show on website; admin
  accounts can't be either), **Photo** (re-encoded on the server to WebP ≤ 800 px, metadata removed; replace or
  remove deletes the old file), **Services**, **Schedule** (weekly hours editor, finish after start, stacked on
  phones; time off as first/last day with "N bookings fall inside these dates" → "Add anyway"), **Account** (role
  for admins, reset password with "Are you sure?" and the new password shown once, switch off/on with an
  upcoming-bookings warning and sign-out everywhere, delete account, blocked while bookings are upcoming).
  Read-only for people you can't edit; usernames can't change.
- Website: profile, photo, services and hours changes refresh the site's cache (`updateTag("site-content")`).
- **Account page** (everyone) now shows your own hours and time off (read-only for barbers: the "Me" tab).
- Server actions accept up to 5 MB (photo uploads).
- Fixes found by the tests:
  - One dashboard-wide toast (`notify()` + `ToastHost`): two actions on one card no longer stack notices, and a
    notice still shows when the refresh replaces the form that asked (e.g. a new photo).
  - A sheet left open when navigating away kept the next page inert (the router keeps the old page hidden):
    sheets now close when their page is hidden or unmounted.

**Tests actually run**

- `npm test`: **347 passed** (6 new): hours form (on/off days, finish after start, 5-minute grid, round trip),
  new person (case-insensitive usernames, rules), time off (last not before first, reason length), warnings text.
- `npm run test:db`: **124 passed** (7 new): delete without history (removed with services and time off, audited),
  with history (hidden row, name only, username reusable), refused with upcoming bookings, owner/barber/self limits,
  admin deletes owners, signed-out refused; `end_user_sessions` secret key only; password-reset log entry and limits.
- `npm run test:e2e`: full run **206 passed, 2 failed, 8 skipped** (phone-only/desktop-only layout checks). The 2
  failures were one phase 6 Today test (phone + desktop) that assumed its own request was the only expired one; the
  seed's sample request had expired too (the local database was seeded the day before). Fixed and rerun: **2 passed**.
  New: owner adds a barber (one-time password, hidden, not bookable, shop hours, every service, audited, **they can
  sign in with it**), duplicate username refused; profile shown on the website (**homepage updates**); photo upload
  served as WebP, then removed (file gone); services; hours (finish before start refused); time off warning → Add
  anyway → remove; **reset password (old one stops working, new one works, logged)**; switch off with warning
  (**their open session ends**), back on; delete blocked by an upcoming booking, then deleted with the login;
  owners never see the admin account and can't change roles; admins add any role and change roles; barbers see
  their own hours and time off read-only; axe WCAG 2.1 AA and 320 px on every Team view in light and dark.
- typecheck clean · lint clean · build success.

**Notes**

- Resetting someone's two-step sign-in comes with two-step sign-in itself (phase 15).
- Time off uses first/last day date fields rather than a range calendar.
- iPhone HEIC photos need converting first until the browser-side converter arrives with Website content (phase 12).

**Suggested commit**

```
feat(team): add team list, add person with one-time password, profiles, photos, services, schedules and account actions
```

---

## Phase 10: Services

Branch `phase-10-services` (stacked on `phase-9-team`).

**Scope**

- Migration `services`: reordering services is logged once per moved row as **"Services reordered"**
  (`service.reorder`, like photos and reviews) instead of "Service edited". `app.audit()` is replaced as a whole
  with only that case added (it was last defined in `triggers`).
- **Services and prices** (`/dashboard/services`):
  - Owner/admin: **add** (name, price in £ → pence, length in 5-minute steps up to 4 hours, **online booking days**,
    e.g. OAP Mon–Thu; all seven = every open day), **edit** (sheet explains existing bookings keep their own
    name, price and length), **switch off/on**, **delete** only if never booked (otherwise "switch it off instead"),
    **reorder** with arrows (behind a Reorder toggle on phones; instant with `useOptimistic`, rolled back with a
    message if it can't be saved; only moved rows are written).
  - A new service is offered by every bookable barber (changeable per person in Team).
  - Barbers: read-only.
  - Every change refreshes the website's cache (price list and online booking).

**Tests actually run**

- `npm test`: **349 passed** (2 new: booking days rules).
- `npm run test:db`: **127 passed** (3 new): reorder logged as `service.reorder` and edits as `service.update`;
  booked services can't be deleted (23503); barbers can't add/change/delete services.
- `npm run test:e2e`: **222 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures.
  New: add with validation, Mon–Thu only, every bookable barber offers it, **shows on the homepage**; bad price
  refused with values kept, saved; **switched off disappears from the website**; delete refused for a booked
  service and allowed for a new one ("Are you sure?" with focus on Keep); reorder instant, saved, survives a reload,
  logged only as "Services reordered"; barbers read-only; axe WCAG 2.1 AA (list and edit sheet, light and dark),
  320 px.
- typecheck clean · lint clean · build success.

**Notes**

- Service lengths are still the placeholders from the price list: the owner can now set the real ones here.

**Suggested commit**

```
feat(services): add services and prices editor with booking days, reorder and safe delete
```

---

## Phase 11: Settings + Activity

Branch `phase-11-settings` (stacked on `phase-10-services`). No migration: settings and closed days were already
audited by triggers and protected by RLS (phase 1).

**Scope**

- **Settings** (`/dashboard/settings`, owner/admin): one card per topic, each saved separately (a save never undoes
  unsaved edits in another card), with a jump bar on phones. Every save refreshes the website's cache.
  - **Opening hours**: shared weekly-hours editor; says how many upcoming bookings fall outside the new hours and asks
    "Save anyway"; bookings are never moved.
  - **Closed days**: today up to two years ahead, optional reason (shown on the website); warns how many bookings are
    on that day ("Add anyway"); duplicates refused; remove.
  - **Booking rules**: minimum notice, how far ahead, due-back weeks, waiting requests per phone, change/cancel cut-off.
  - **Google rating**: rating (comma or point), count, https link; blank rating hides it.
  - **Website notes**: walk-in and offer lines (≤ 200, line breaks become spaces, blank hides).
  - **Website theme**: default for new visitors.
- **Activity** (`/dashboard/activity`, owner/admin): newest first, grouped by day, 50 at a time with "Show older"
  (id cursor) and "Back to the newest"; filters by person (switched-off/deleted people labelled) and type, in the URL
  (GET form, works without JavaScript). Readable labels; edits list the changed fields ("Changed price and length");
  settings changes list what changed. Owners never see admin entries (RLS).
- Shared form parts moved to `form-parts.tsx` (`useSave`, `Form`, `Card`, `SaveButton`, weekly-hours editor) and a
  shared `SaveState` answer type; Team uses them too (no behaviour change).

**Tests actually run**

- `npm test`: **356 passed** (7 new: outside-hours count, warnings, closed-day dates, activity params/links/filters,
  detail lines).
- `npm run test:db`: **134 passed** (7 new): settings change logged with changed columns, unchanged save not logged,
  database range/https checks; closed days added/duplicate (23505)/removed and logged with date and reason; barbers
  refused; activity type filter and cursor through PostgREST; person filter.
- `npm run test:e2e`: **240 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures.
  New: opening hours (finish-before-start refused, closing a day warns and saves, booking untouched, logged once,
  website shows "Closed"); closed days (warning, duplicate refused with values kept, website shows it, remove);
  booking rules + Google (field errors, comma decimal) + notes + theme saved and shown on the website; activity labels,
  admin entries hidden from owners, type/person filters, 50 + "Show older"; axe WCAG 2.1 AA light and dark, 320 px.
- typecheck clean · lint clean · build success.

**Suggested commit**

```
feat(settings): add settings cards (hours, closed days, booking rules, Google, notes, theme) and activity log
```

---

## Phase 12: Website content

Branch `phase-12-website` (stacked on `phase-11-settings`).

**Scope**

- Migration `website`: changing only the shop photo is logged as **"Shop photo changed"** (`website.shop_photo`,
  summary Added / Replaced / Removed, under Website in the Activity filter) instead of "Settings changed".
  `app.audit()` is replaced as a whole with only that case added.
- **Website** (`/dashboard/website`, owner/admin):
  - **Shop photo**: upload, replace, remove ("Are you sure?"); the old file is deleted.
  - **Slideshow** (max 3 shown) and **Recent cuts** (max 4 shown), each with an "x of N shown" meter: drop zone or file
    picker with instant preview, required description (alt text), "Shows a child" (starts hidden until a parent has
    agreed), quick show/hide (instant), reorder (instant, behind a Reorder toggle on phones), edit sheet (description,
    section, shown; warns and won't save when the section is full), replace, delete (file deleted too). Adding to a
    full section adds the photo hidden, with a note beforehand.
  - **Reviews**: add/edit (name, 1–5 stars, text with paragraphs, optional date not in the future, From Google,
    shown), reorder, delete, with a reminder to copy real reviews word for word.
  - Every change refreshes the website's cache.
- **Browser-side photo shrinking** (`src/lib/images/shrink.ts`, used by Website and Team photos): big photos are
  scaled to ≤ 2000 px and re-encoded (WebP, JPEG where the browser can't write WebP) under 4 MB, shown as
  "Ready: 6.2 MB → 640 KB"; iPhone **HEIC** is converted with `heic-to`, loaded only when the browser can't read HEIC.
  Pickers list `.heic,.heif`. The server still re-encodes everything (WebP ≤ 2 MB, upright, metadata removed).
- New dependency: `heic-to` (LGPL-3.0, used unmodified and loaded on demand).

**Tests actually run**

- `npm test`: **363 passed** (7 new: when photos start hidden, meter/messages, descriptions, review rules, shrink
  sizing, HEIC detection, size labels).
- `npm run test:db`: **139 passed** (5 new): shop photo logged as Added/Replaced/Removed; Recent cuts max 4 and
  slideshow max 3 visible (hidden don't count, showing one more refused); description required; reviews: no future
  dates, reorder logged as `review.reorder`; barbers can't add photos/reviews or upload to the website bucket.
- `npm run test:e2e`: **244 passed, 16 skipped**, no failures. Skipped: the 8 phone-only/desktop-only layout checks, plus 8 "today" booking tests that skip themselves after 9pm London time (the run finished at 9:27pm; they passed in the phase 11 run and nothing they use changed).
  New: shop photo (a 5 MB+ photo shrunk in the browser, saved, replaced, removed; old files deleted; logged);
  Recent cuts (description required, added and shown on the homepage, child photo hidden, hide, move to Slideshow,
  delete removes the file); full slideshow (added hidden, showing refused, replace swaps the file); reviews (checks,
  shown on the homepage, reorder, hide, delete); axe WCAG 2.1 AA (page and review sheet, light and dark), 320 px.
- typecheck clean · lint clean · build success.

**Notes**

- HEIC conversion isn't covered by an automated test (no HEIC sample in the repo, and the test browser can't make one);
  please try an iPhone photo once on a non-Safari browser.

**Suggested commit**

```
feat(website): add shop photo, slideshow, recent cuts and reviews editors with browser-side photo shrinking
```

---

## Phase 13: Retention job, error/loading/empty states, performance

Branch `phase-13-retention` (stacked on `phase-12-website`).

**Scope**

- Migration `retention`: `purge_old_data()` (service role and cron only) removes declined, cancelled and
  never-answered bookings whose appointment was over 90 days ago (completed visits and no-shows are kept),
  activity entries over 90 days, clients with no bookings left added over 90 days ago, and rate-limit rows over an
  hour old; returns the counts. `pg_cron` runs it nightly at **03:15 UTC** (job `purge-old-data`). Nothing it removes is
  written to the activity log (no staff session).
- Error, loading and empty screens checked page by page: every dashboard page and `/book`, `/booking/…`, `/login`
  already had a layout-shaped skeleton (shown after ~90 ms) and the error/not-found screens exist. Added the missing
  empty state on Services ("No services yet"). The public and global error pages now use Next 16's `retry()`
  (re-fetches) instead of `reset()` (only re-renders), so "Try again" really tries again.
- Performance:
  - The homepage no longer ships zod: weekly-hours validation moved to `domain/hours-schema.ts` (server/dashboard
    only), so "Open now" doesn't pull it in. Homepage JavaScript **237 KB → 206 KB** gzipped.
  - The HEIC converter (3 MB) is confirmed to be a separate chunk, downloaded only when someone picks an iPhone photo
    that the browser can't read (pages carry a 215-byte loader).
  - Deprecated `priority` on images replaced with `preload` (hero photo/logo, login badge); the small header logo
    loads eagerly instead of being preloaded.
  - Build: homepage fully static; every other page a partial prerender (static shell, streamed data).

**Tests actually run**

- `npm test`: **363 passed**.
- `npm run test:db`: **142 passed** (3 new): purge removes old declined/cancelled/unanswered bookings and keeps
  completed, no-show and recent ones; removes old clients with no bookings and keeps new ones and ones with visits;
  removes 91-day-old activity and keeps 89-day-old; clears old rate-limit rows; anon, owner and admin can't run it;
  the cron job is scheduled at `15 3 * * *`.
- `npm run test:e2e`: **244 passed, 16 skipped**, no failures (8 phone-only/desktop-only layout checks, plus 8 "today" booking tests that skip themselves after 9pm London time; the run ended at 9:45pm).
- typecheck clean · lint clean · build success.

**Notes**

- In production, `pg_cron` must be enabled on the Supabase project (the migration enables it; check
  Database → Cron after `supabase db push`, as the spec's deploy step says).

**Suggested commit**

```
feat(retention): add nightly purge_old_data job, empty/error-state fixes and smaller homepage bundle
```

---

## Phase 14: Customer manage link + owner email

Branch `phase-14-manage` (stacked on `phase-13-retention`).

**Scope**

- Migration `manage`: `cancel_managed_booking(token)`, service role only, under the same shop-wide lock as
  `request_booking()`. Only pending/confirmed bookings, only until the change/cancel cut-off; otherwise
  `not_changeable`. Marks the booking cancelled by the customer (not logged as a staff action).
- `/booking/[token]` (the customer's private page):
  - **Change** → `/book?change=<token>` with service and barber filled in, starting at the time step; name and number
    kept (nothing to retype); their current time counts as free; one transaction; the same link keeps working and the
    change reaches the shop as a new request. Shown only before the cut-off and while online booking is on.
  - **Cancel** asks first (focus on "Keep booking"), then cancels; the page shows the new status.
  - After the cut-off: "It's less than 2 hours before your appointment… please message or call" (or "this time has
    passed"); `/book?change=` refuses too.
  - **WhatsApp the shop** prefilled with "I'd like to change my booking" + the booking (no phone number), Call,
    Directions, **Book another** (`/book?for=<token>`: name and number filled in, "Who is this for?"; a different name
    is stored on that booking only), **Copy link**.
- **Owner alert emails** (Resend HTTP API, no SDK): new online request, customer change (with the old time),
  customer cancel. Name, service, barber and time only, never the phone number; link to the dashboard. Sent in
  `after()` so the customer never waits; never throws, so a failed email can't affect a booking; not sent again for a
  repeated send of the same request. Off unless `RESEND_API_KEY` and `OWNER_ALERT_EMAIL` are set (still off here, as
  agreed); `ALERT_FROM_EMAIL` optional (Resend's shared test sender otherwise, which only delivers to the Resend
  account's own address).

**Tests actually run**

- `npm test`: **368 passed** (5 new: email text for request/change/cancel, never a phone number, off without settings,
  failures don't throw, the exact request sent to Resend).
- `npm run test:db`: **145 passed** (3 new): cancel pending and confirmed once (marked by customer, not in the staff
  log), refused after the cut-off, for finished bookings and unknown tokens; anon and staff can't call it.
- `npm run test:e2e`: **266 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures (run in the morning, so the "today" tests ran too).
  New: cancel (asks first, Keep works, status updates, buttons gone); change (filled in, nothing retyped, same link, old
  booking cancelled with a fresh token, new pending request); too close to the appointment (message, no buttons,
  change page refuses); book another ("Who is this for?", different name kept on that booking only); WhatsApp text
  and Copy link; axe WCAG 2.1 AA light and dark, 320 px.
- typecheck clean · lint clean · build success.

**Notes**

- Emails aren't sent by the automated tests (no real Resend calls); the sender is tested with a stand-in.
- To switch emails on later: create a Resend account, verify the shop's domain (or use the test sender to your own
  address), then set `RESEND_API_KEY`, `OWNER_ALERT_EMAIL` and `ALERT_FROM_EMAIL` in Vercel.

**Suggested commit**

```
feat(manage): add customer change, cancel, book another and copy link, and owner alert emails
```

---

## Phase 15: Sign-in security + two-step sign-in

Branch `phase-15-security` (stacked on `phase-14-manage`).

**Scope**

- Migration `sign_in_security`:
  - `login_wait_seconds`, `record_login_failure`, `clear_login_failures` (service role only): visitor + username
    5 failures / 15 min, visitor 20 / 15 min, username 50 / hour; keyed hashes only; rows last an hour.
  - `log_account_event()` widened: your own password change and two-step on/off (yourself only), admin's two-step
    reset (someone else only), password reset as before; anything else refused.
- **Sign-in**: limits checked before the password ("Too many attempts. Try again in N minutes."), unknown usernames
  limited the same way, a success clears the visitor's failures.
- **`/login/2fa`**: the 6-digit code from the authenticator app; wrong codes share the limits; "Use a different
  account". Until the code is entered the dashboard sends you back here and the database keeps every table locked
  (`require_2fa`, since phase 1).
- **Account**: change password (current password checked without touching this session; NCSC-style rules with a
  live checklist, the server has the final say; logged), **two-step sign-in** (QR code + typed key, confirm with a
  code; turning off needs a current code; logged), **dashboard theme** Light / Dark / System for this device.
- **Team → Account** (admin): two-step status and **Reset two-step sign-in** (removes the app, signs them out
  everywhere, logged).
- Scripts: `npm run reset-2fa -- <username> [--prod]` (recovery; not in the activity log, so note when/why);
  `npm run dev:code -- <username>` (local only: prints the current code for an account with two-step on).
- Tests can call server actions **by id** from the build's manifest (fields first, arguments last, as React sends
  them), skipping the UI.

**Tests actually run**

- `npm test`: **376 passed** (8 new: password rules, wait message, RFC 6238 code vectors).
- `npm run test:db`: **151 passed** (6 new): each limit and its window, clearing, older failures ignored; only the
  server can use them; account events for yourself only, two-step reset admin-only, unknown actions refused.
  Also fixed a date-dependent expectation in an earlier booking test (it assumed the shop is shut on Sundays, which
  stopped being true when the real hours went in; it failed only when "today + 8" was a Sunday).
- `npm run test:e2e`: **286 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures.
  New: lockout after 5 wrong passwords even with the right one, unknown usernames too, hashes only; change password
  (checklist, wrong current password, new one works, old one doesn't, logged); two-step on (wrong code refused),
  sign-in then needs a code (dashboard locked, bad and wrong codes refused, right code continues to the page asked
  for), off with a code, both logged; admin reset (signed out, password-only sign-in); theme Light/Dark/System;
  **direct calls**: the owner's call works (control), a barber's calls to settings, services (add, reorder), delete
  client, reset password and reset two-step change nothing, signed-out calls change nothing; axe WCAG 2.1 AA light and
  dark, 320 px.
- typecheck clean · lint clean · build success.

**Notes**

- Spec difference: no seeded authenticator secrets for the sample logins (seeding one would force every test sign-in
  through the code step). `dev:code` works for any account where two-step was turned on locally.
- In production, check Supabase → Authentication → Multi-factor: TOTP enrol and verify must be on (they are in
  `supabase/config.toml` for local).

**Suggested commit**

```
feat(security): add sign-in limits, two-step sign-in, password change, theme choice and direct-call tests
```

---

## Phase 16: Push alerts + PWA

Branch `phase-16-push` (stacked on `phase-15-security`). No migration (`push_subscriptions` exists since phase 1).

**Scope**

- **Web Push without a library** (`src/lib/push/web-push.ts`, Node crypto only): payload encryption (RFC 8291,
  `aes128gcm`) and VAPID (RFC 8292, ES256). Off unless `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set;
  `npm run vapid:keys` makes a pair.
- **Who gets what** (`domain/push.ts`): admin and owner every online request/change/cancel, a barber only their own,
  never switched-off or deleted accounts; walk-ins and staff bookings don't alert. "New booking request" /
  "Jo · Skin Fade with Sam · Fri 20 Nov, 4:00pm" (a change adds "(was …)"); never the phone number; tap opens Today
  (new/changed) or that day in the Calendar (cancelled). Gone devices (404/410) are deleted.
- `bookingAlert()` (`src/lib/alerts.ts`) loads the booking once and sends the owner email (phase 14) and the pushes,
  in `after()`; never throws.
- Subscriptions: only from real browser push services (Google, Apple, Mozilla, Microsoft), at most 10 per login (the
  oldest go), stored with the secret key against the login; this device's endpoint is kept in an http-only cookie
  so **signing out removes it**.
- **Installable dashboard**: `public/dashboard.webmanifest` (linked from staff pages only: dashboard, login, two-step),
  Apple Home Screen meta; `public/sw.js` (scope `/dashboard`): push + notification click only, **no fetch handler,
  no caching, no offline mode**, served `no-cache`; registration awaited directly (not `serviceWorker.ready`).
- **Account → Booking alerts on this device**: turn on (permission asked from the tap), send a test, turn off;
  "blocked" with How to fix steps (iPhone, Android, computer); iPhone Safari tab → Add to Home Screen first;
  unsupported browsers say so; "not set up for this shop" without keys.
- **Notifications bar** in the installed app (and iPhone Safari tabs) until alerts are on: Turn on, How to fix when
  blocked, Not now (per session). **Today**: a one-time offer in browsers that can show alerts.
- Android `interactive-widget=resizes-content` and the iPhone keyboard height (`visualViewport`) were already in place
  (phase 6).
- `npm run dev:phone`: dev server + a temporary HTTPS tunnel (Cloudflare quick tunnel via npx) to try alerts and the
  installed app on a real phone.
- Tests: Playwright makes throwaway VAPID keys per run and points the server at a local stand-in push service.

**Tests actually run**

- `npm test`: **382 passed** (6 new: recipients, text without phone numbers, allowed push services, a real
  encrypt → decrypt round trip (and a different browser can't read it), VAPID signature/claims, sending + gone).
- `npm run test:db`: **153 passed** (2 new): staff (even admin) can't read or write subscriptions, only the server;
  removed with the login.
- `npm run test:e2e`: **306 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures.
  New: turn on → test alert arrives encrypted and VAPID-signed (decrypted by the test) → turn off; a customer's
  request alerts owner, admin and that barber only (not another barber, not a switched-off account), text checked,
  no phone number, the gone device removed; signing out removes this device; a non-push-service endpoint refused;
  installed-app bar (Not now for the session), blocked → How to fix; Today's one-time offer; manifest/service worker
  checks (staff-only manifest, no fetch handler, `no-cache`); axe WCAG 2.1 AA light and dark.
- typecheck clean · lint clean · build success.

**Notes**

- Push on real phones can't be tested automatically (needs a real push service); please try `npm run dev:phone`
  once on an iPhone (Home Screen app, iOS 16.4+) and an Android phone.
- Alerts are off until the keys are set in Vercel (`npm run vapid:keys`, then Production + Preview; private key
  Sensitive). Changing the keys later means everyone turns alerts on again.

**Suggested commit**

```
feat(push): add booking alerts on staff phones (web push, no library) and the installable dashboard app
```

---

## Phase 17: Backup and restore

Branch `phase-17-backup` (stacked on `phase-16-push`).

**Scope**

- Migration `backup`:
  - `restore_backup(tables, admin_user)` (service role only), one transaction: refuses a backup whose tables or
    columns don't match (`backup_mismatch`), switches the tables' own triggers off while it empties and refills them in
    dependency order (nothing re-audited, audit flags kept exactly), unlinks staff from logins that no longer exist
    (before inserting), skips photos whose files are gone, keeps the restoring admin active (re-adding them if the
    backup predates them), never lowers the activity log's sequence. Returns the counts.
  - `log_backup_event(action, summary)`: download / restore / undo, admins only.
- **Own zip writer and reader** (`src/lib/backup/zip.ts`, node:zlib + CRC-32, no dependency); opens in Windows'
  Expand-Archive, and Windows-made zips read back.
- **Typed table list** (`src/lib/backup/tables.ts`): every table must be listed as backed up or skipped, or the
  build fails. Skipped: `request_attempts`, `login_failures`, `push_subscriptions`.
- **Backup page** (`/dashboard/backup`, admin only):
  - **Download**: `.zip` with `backup.json` (every backed-up table, logins without passwords or two-step secrets,
    photo file names) + `README.txt`; logged; refused with a pointer to the local script if it ever passed 4 MB.
  - **Restore**: choose the zip → preview (backup date, each table's count next to today's) → type `RESTORE`
    (checked on the server) → the current data is saved first as an undo snapshot (private `restore-snapshots`
    bucket, kept only once the restore works) → logins deleted since the backup are re-created (same id and username,
    a new random password to reset in Team) → `restore_backup()`. Logged.
  - **Undo last restore** (once).
- **Today** (admins): a reminder after 7 days without a backup download.
- `npm run backup:prod` (and `backup:local`): rows, logins and every photo file into a dated folder under
  `BACKUP_DIR`, keeping the newest 8; read-only for the live site.

**Tests actually run**

- `npm test`: **389 passed** (7 new: CRC-32 check value, zip round trip (UTF-8 names, binary), damaged/non-zip/too
  many entries refused, table list decisions, pack/unpack, readable refusals, the 7-day reminder).
- `npm run test:db`: **158 passed** (5 new): restore puts every table back without new log entries, keeps audit
  flags, never lowers the sequence; mismatched columns and missing tables refused with nothing changed; gone photos
  skipped, missing logins unlinked, restoring admin kept active; server only; backup events admin only.
  (The restore test starts from a real backup and restores it at the end; DB test files run one at a time.)
- `npm run test:e2e`: **320 passed, 8 skipped** (phone-only/desktop-only layout checks), no failures.
  New: download (zip contents, no passwords, no push keys, logged, Today's reminder goes); restore (preview counts,
  RESTORE required, data replaced, logged) then undo (data back, undo gone); RESTORE checked on the server (direct
  call); non-backup files refused; owner gets "not found" for the page and the download; axe WCAG 2.1 AA, 320 px.
- typecheck clean · lint clean · build success · `npm run backup:local` tried (10 bookings, 4 clients, 5 logins,
  10 photos).

**Notes**

- The local database was reset once during this phase (to re-apply the edited, not-yet-pushed backup migration);
  website photos are re-imported automatically by the next `npm run test:e2e`.
- Restoring re-creates deleted logins with a random password: reset those people's passwords in Team afterwards
  (the success message says how many).

**Suggested commit**

```
feat(backup): add backup download, preview and restore with undo, Today reminder and local backup script
```

---

## Shop data received (2026-11-12)

- **Name:** Salsa Barber · **Address:** 41 Liverpool Road South, L31 7BN (area assumed Maghull, postal town Liverpool)
- **Shop phone:** 0151 309 4681 (landline)
- **Maps:** https://maps.app.goo.gl/529KvjdrRqt25VS29
- **Socials:** Instagram `salsabarber1`, TikTok `@salsabarber1`, Facebook share link, Snapchat link (tracking parameters removed)
- **Logos:** `Logo1.PNG` (round badge) → `assets/logo-original.png`; `logo2.PNG` (wordmark) → `assets/wordmark-original.png`
- **Photos:** `photos/recent cuts` (15, mostly HEIC), `photos/shop photo` (4 HEIC). Imported later via the dashboard or `photos:import`.
- **Owner's personal mobile:** received, deliberately **not** stored in the repo (see open questions).

**Price list** (in the `initial_data` migration; durations are placeholders until confirmed):

| Service | Price |
| --- | --- |
| Hair Cut | £17 |
| Skin Fade | £18 |
| Beard Trim & Shape Up | £14 |
| Boy's Cut (12 & under) | £14 |
| Boy's Skin Fade | £16 |
| Wet Shave | £16 |
| Dry Shave | £14 |
| Normal Zero | £10 |
| All Over No. 2 & Under | £14 |
| OAP Cut (Mon–Thurs) | £14 |
| Full Service | £39 |
| Nose Wax | £2 |
| Ear Wax | £3 |

## Answers received (2026-11-12)

| Topic | Decision | Applied in |
| --- | --- | --- |
| WhatsApp number | Use the shop number (0151 309 4681) for WhatsApp buttons. The owner's personal mobile stays private. | Phase 4 (`site.ts`) |
| Opening hours | Taken from the shop's own opening-times board (Mon–Fri 9–6:30, Sat 8:30–6, Sun 9–4); editable in Settings | Phase 4 (migration), Settings phase 11 |
| Area name | Keep "Maghull" for now, still marked "to confirm" | — |
| Payments | Cash & card (confirmed) | Phase 4 |
| Google rating | Set by owner/admin in Settings; blank hides it | Phase 11 |
| Reviews | Real reviews, typed in word for word by the owner/admin in the dashboard (never invented) | Phase 12 |
| Walk-in text | "Walk-ins welcome."; editable in Settings. Discount text left blank | Phase 4 (migration) |
| Photos | I choose the best ones, leaving out anything that looks like a child | Phase 4 (import) |
| Photo limits | **Slideshow max 3, Recent cuts max 4** (changes the spec's 3 + 3) | Phase 4 (migration + domain) |
| Service lengths | Placeholder lengths for now; owner/admin edits them in Services | Phase 10 |
| Barbers | Added by the owner/admin in Team | Phase 9 |
| OAP Cut | Online booking only Mon–Thu, and **which days a service can be booked is editable per service** in the dashboard | Phase 4 (migration + availability), Services phase 10 |
| Boy's Cut (12 & Under) | Just the service name, no extra note | — |
| Hosting | Vercel default domain (`*.vercel.app`) for now | Phase 18 |
| Owner alert emails | Off for now (the feature stays switched off without `RESEND_API_KEY`) | Phase 14 |

### Still open

1. Merging: keep stacking one branch per phase, or merge into `main`?
2. Booking window ("30 days" = today + 29 days) and the "any barber" rule (free longest before that time): OK?
