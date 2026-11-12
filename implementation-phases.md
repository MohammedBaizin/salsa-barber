# Implementation phases

Spec: `new-barbershop-project-prompt.md`. One phase at a time: build → test → update this file → stop for review and commit.

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold, Docker, theming, design tokens, logo assets | **Done, awaiting review** |
| 1 | Schema, roles, RLS, audit, seed (Supabase) | Not started |
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

## Shop data received (2026-11-12)

- **Name:** Salsa Barber · **Address:** 41 Liverpool Road South, L31 7BN (area assumed Maghull, postal town Liverpool)
- **Shop phone:** 0151 309 4681 (landline)
- **Maps:** https://maps.app.goo.gl/529KvjdrRqt25VS29
- **Socials:** Instagram `salsabarber1`, TikTok `@salsabarber1`, Facebook share link, Snapchat link (tracking parameters removed)
- **Logos:** `Logo1.PNG` (round badge) → `assets/logo-original.png`; `logo2.PNG` (wordmark) → `assets/wordmark-original.png`
- **Photos:** `photos/recent cuts` (15, mostly HEIC), `photos/shop photo` (4 HEIC). Imported later via the dashboard or `photos:import`.
- **Owner's personal mobile:** received, deliberately **not** stored in the repo (see open questions).

**Price list** (initial-data migration in phase 1; durations still needed):

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
