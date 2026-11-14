# Salsa Barber

Website, online booking and staff dashboard for Salsa Barber, 41 Liverpool Road South, L31 7BN.

- **Going live, step by step:** [docs/launch-guide.md](docs/launch-guide.md)
- **What Supabase is and what's in it:** [docs/supabase-guide.md](docs/supabase-guide.md)
- **How it was built, phase by phase (and every decision):** [implementation-phases.md](implementation-phases.md)
- **Design:** [docs/design-brief.md](docs/design-brief.md)

## How the parts fit

```
 Customers ──► Website (/, /book, /booking/<private link>)  ┐
                                                            ├─► Next.js app on Vercel (London) ──► Supabase (London)
 Staff ──────► Dashboard (/dashboard, installable on phones) ┘        │                        database · logins · photos
                                                                      ├─► Web Push ──► staff phones (booking alerts)
                                                                      └─► Resend ────► owner email (optional, off)
```

- **Website**: the homepage (prices, photos, team, reviews, opening hours, map on tap) and online booking. Customers
  don't have accounts: a request comes with a private link where they can see, change or cancel it.
- **Dashboard**: Today, Calendar, Clients, Team, Services, Website, Settings, Activity, Account and Backup, by role
  (admin, owner, barber). Staff confirm bookings by WhatsApp or text with one tap (no paid messaging).
- **Supabase**: the database enforces who can see what, the booking rules and the no-double-booking rule itself, so
  the website can't get them wrong.
- **Nightly**: old data is cleaned up (Supabase cron). **Daily**: Vercel calls `/api/health`.

Built with Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4, shadcn/ui and Supabase.

## Working on it locally

Needs Node.js 22+, Docker, and the Supabase CLI (via `npx`).

```bash
npm install
npm run db:start       # local Supabase in Docker (ports 47320–47329)
npm run env:local      # writes the local Supabase URL and keys into .env.local
npm run photos:import  # website photos (needs JPEGs in photos/converted/)
npm run dev            # http://localhost:3417
```

Local sample logins (sample data, this computer only): `admin`, `owner`, `sam`, `jamie`, password `LocalDev-Sample-1`.
Supabase Studio: http://127.0.0.1:47323. Or with Docker: `docker compose up app`.

Configuration lives in `.env.local` (see `.env.example`; never commit real values) and the shop's details in
`src/lib/site.ts`. Everything else (prices, hours, team, photos, reviews) is edited in the dashboard.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3417 |
| `npm run dev:phone` | Dev server + a temporary HTTPS address to try the installed app and alerts on a real phone |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Database tests against local Supabase (rules, constraints, triggers, restore) |
| `npm run test:e2e` | Builds, then runs Playwright (phone + desktop) against local Supabase |
| `npm run test:smoke` | Read-only checks of a deployed site: `SMOKE_URL=https://… npm run test:smoke` |
| `npm run db:start` / `db:stop` | Start / stop local Supabase |
| `npm run db:reset` | Rebuild the **local** database from migrations + sample seed |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` after a migration |
| `npm run env:local` | Copy local Supabase URL/keys into `.env.local` |
| `npm run create-admin -- <username> "<Name>"` | Creates an admin login, prints a one-time password (`create-admin:prod` for live) |
| `npm run reset-2fa -- <username> [--prod]` | Removes someone's authenticator app (lost phone) and signs them out |
| `npm run dev:code -- <username>` | Local only: prints the current two-step code for an account |
| `npm run vapid:keys` | Makes the key pair for booking alerts (Vercel env) |
| `npm run photos:import` | Imports the chosen website photos from `photos/converted/` (`-- --replace`, `:prod`) |
| `npm run backup:prod` / `backup:local` | Full copy (rows, logins, photo files) into `BACKUP_DIR`, keeping the newest 8 |
| `npm run assets:logo` | Regenerate logo sizes, icons and the OG image from `assets/` |

## Deploying

The full walk-through is in [docs/launch-guide.md](docs/launch-guide.md). In short:

1. `npx supabase db push` to the live project (**migrations only, never the seed**), always **before** deploying
   code that needs them.
2. Push to GitHub; Vercel builds and deploys. Environment variables are listed in the guide (Production and Preview;
   the secret key and the alert private key marked Sensitive).
3. `npm run test:smoke` against the live address.

`NEXT_PUBLIC_*` variables are built into the site: change them in Vercel, then **redeploy**.
Online booking is switched on or off in **Dashboard → Settings → Online booking** (when off, `/book` shows a call/WhatsApp panel instead).

## Backups

- Weekly: **Dashboard → More → Backup → Download backup** (admin). Restore is on the same page, with an undo.
- Optional full copy with photo files: `npm run backup:prod` (set `BACKUP_DIR` in `.env.production.local`).
- Backup files hold customers' names and numbers: keep them private.

## When something breaks

| Symptom | What to do |
| --- | --- |
| Whole site shows an error | Supabase dashboard: project paused? Press **Restore**. Then Vercel → Deployments → latest → Logs |
| One page says "Something went wrong" | Vercel → Logs, filtered by that page; "Try again" re-fetches it |
| A deploy failed | Vercel → Deployments → the failed one → Build logs. The previous deploy keeps running; you can **Promote** an older one |
| Database error after a deploy | Probably a migration wasn't pushed first: `npx supabase db push`, then redeploy |
| Staff member locked out | Wait 15 minutes (too many tries), or reset their password in Team |
| Lost authenticator phone | Admin: Team → their profile → Account → Reset two-step sign-in. For the admin: `npm run reset-2fa -- <username> --prod` |
| Alerts stopped on a phone | Account → Booking alerts → Turn off, then Turn on, then Send a test |
| Wrong data after a restore | Backup → **Undo last restore** (works once) |

## Privacy and security

- Customers give only a name and a UK mobile number. No emails, notes, tracking or analytics.
- Phone numbers never appear in emails, alerts or the activity log. Private booking pages are opened only by their
  random link, never by phone number.
- Staff accounts: username + password, attempt limits, optional two-step sign-in; sign-up is off.
- The secret key is only used on the server (`src/lib/supabase/admin.ts`). `.env*` files are never committed or
  uploaded (`.gitignore`, `.vercelignore`).
