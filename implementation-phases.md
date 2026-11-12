# Implementation phases

Spec: `new-barbershop-project-prompt.md`. One phase at a time: build → test → update this file → stop for review and commit.

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold, Docker, theming, design tokens, logo assets | Done (committed) |
| 1 | Schema, roles, RLS, audit, seed (Supabase) | **Done, awaiting review** |
| 2 | Domain logic (time, money, phone, hours, availability, messages…) | Not started |
| 3 | Auth (username login, requireStaff, proxy) | Not started |
| 4 | Homepage | Not started |
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

## Open questions for the owner

1. **WhatsApp number:** which number should customers WhatsApp/SMS? The shop phone is a landline. Should the owner's
   mobile be public on the site, or only used privately (e.g. alerts)?
2. **Durations** for each service (and what "Full Service" includes).
3. **Opening hours** and regular closed days.
4. **Barbers:** names, titles, who does which service, working hours.
5. **Payments:** cash and card? (currently "Cash & card", unconfirmed)
6. **Area name:** is "Maghull" right for the site?
7. **OAP Cut Mon–Thurs:** should online booking only offer it Monday to Thursday?
8. **Boy's Cut 12 & under / Boy's Skin Fade:** any age note to show?
9. Google rating/review link, real reviews to copy, walk-in and discount text.
10. Domain name for the live site.
