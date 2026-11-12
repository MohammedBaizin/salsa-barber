# Implementation phases

Spec: `new-barbershop-project-prompt.md`. One phase at a time: build → test → update this file → stop for review and commit.

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold, Docker, theming, design tokens, logo assets | Done (committed) |
| 1 | Schema, roles, RLS, audit, seed (Supabase) | Done (committed on `phase-1-database`) |
| 2 | Domain logic (time, money, phone, hours, availability, messages…) | Done (committed on `phase-2-domain`) |
| 3 | Auth (username login, requireStaff, proxy) | Done (committed on `phase-3-auth`) |
| 4 | Homepage | **Done, awaiting review** |
| 5 | Booking flow + availability API | Not started |
| 6 | Dashboard shell + Today | Not started |
| 7 | Booking actions + Calendar | Not started |
| 8 | Clients | Not started |
| 9 | Team | Not started |
| 10 | Services | Not started |
| 11 | Settings + Activity | Not started |
| 12 | Website content | Not started |
| 13 | Retention job, error/loading/empty states, performance | Not started |
| 14 | Customer manage link + owner email | Not started |
| 15 | Sign-in security + 2FA | Not started |
| 16 | Push alerts + PWA | Not started |
| 17 | Backup / restore | Not started |
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
