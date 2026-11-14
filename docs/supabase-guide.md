# Supabase, in plain words

Supabase is the service that stores everything the website and dashboard need. Think of it as three things in one:

1. **A database**: tables, like very strict spreadsheets.
2. **Logins**: the staff accounts and their passwords (customers never have accounts).
3. **File storage**: the photos.

The website itself runs on Vercel and talks to Supabase. You rarely need to open Supabase: the dashboard does
everything day to day. This guide is for when you're curious, or something's wrong.

## What's in the database

| Table | What it holds |
| --- | --- |
| `settings` | One row: opening hours, booking rules, Google rating, website notes and theme |
| `services` | The price list: name, price, length, which days it can be booked online, on/off |
| `staff` | Everyone with a dashboard login: name, role (admin, owner, barber), hours, photo, whether they take bookings |
| `staff_services` | Who does which service |
| `time_off`, `closures` | Barbers' days off; days the whole shop is shut |
| `clients` | Customers: a name and a UK mobile number. No emails, no notes |
| `bookings` | Every booking, with its own copy of the service name, price and length at the time |
| `gallery_photos`, `reviews` | What the website shows |
| `audit_log` | The Activity page: who changed what (kept 90 days) |
| `request_attempts`, `login_failures`, `push_subscriptions` | Short-lived security records and phones' alert keys |

Money is stored in pence (`1700` = £17.00) and times in UTC; the site shows everything in UK time.

## Who can see what (Row Level Security)

Every table has rules ("policies") that the database itself enforces, whatever the website does:

- **The public** (anyone visiting the website) can only read the price list, opening hours, closed days, visible
  photos and reviews, and the team members shown on the site. Never bookings, customers, usernames or the activity
  log.
- **Barbers** see their own bookings and their own customers.
- **The owner** sees everything except the admin account and the admin's activity.
- **The admin** sees everything.
- If someone has **two-step sign-in** turned on, none of their data is readable until they've entered the code.

Customers' booking requests don't go through these rules: they're checked and saved by the website's server with the
secret key, which also applies the limits (how many requests per number and per hour).

## The keys

| Key | Where | Safe to share? |
| --- | --- | --- |
| Publishable key | In Vercel and in the browser | Yes: it only allows what the rules above allow |
| Secret key | Only in Vercel (Sensitive) and your `.env.production.local` | **Never.** It bypasses every rule |
| Database password | Your password manager | **Never.** Only needed for `supabase db push` |

If the secret key ever leaks: Supabase → Project Settings → API keys → create a new secret key, delete the old one,
update `SUPABASE_SECRET_KEY` in Vercel and redeploy.

## Logins

Staff sign in with a **username**. Behind the scenes Supabase stores it as `<username>@staff.salsabarber.invalid`,
which isn't a real mailbox, so no emails are ever sent. Sign-up is switched off: accounts are only created by the
owner or admin in **Team**. Passwords are stored scrambled; nobody can read them, only reset them.

## Photos (Storage)

- `gallery`: the shop photo, slideshow and recent cuts.
- `team`: barbers' photos.
- `restore-snapshots` (**private**): the automatic copy saved just before a backup is restored, for Undo.

Photos are shrunk and cleaned (location data removed) before they're saved. Deleting a photo in the dashboard deletes
the file.

## Things that run on their own

- **Every night at 03:15 UTC** (`purge-old-data`, under Database → Cron): removes bookings that never happened
  (declined, cancelled, never answered) once they're more than 90 days old, activity older than 90 days, and
  customers with no bookings left after 90 days. Completed visits and no-shows are kept.
- **Every morning** Vercel calls `/api/health`, which keeps a free project from pausing.

## Migrations

The files in `supabase/migrations/` describe the database: each one is a step (create these tables, add this rule…).
`npx supabase db push` applies the steps the live project hasn't had yet. Rules:

- Push migrations **before** deploying code that needs them.
- Never change a migration that's already been pushed: add a new file.
- The seed (`supabase/seed.sql`) is sample data for your computer only. Never push it.

## Backups

- **Ours**: Dashboard → Backup (admin) downloads everything as one file, and can restore it with an undo. Do it weekly.
- **Supabase's own**: paid plans keep daily backups (Database → Backups). The free plan doesn't, which is why ours
  matters.

## When something looks wrong

| You see | Look at |
| --- | --- |
| The website shows an error everywhere | Supabase dashboard: is the project **paused**? Press Restore. Then Vercel → Deployments → the latest one's logs |
| "Something went wrong" on one page | Vercel → Project → Logs (filter by the page's address) |
| Someone can't sign in | Too many wrong tries locks them out for 15 minutes. Otherwise reset their password in Team |
| Lost the phone with the authenticator app | The admin resets their two-step sign-in in Team. For the admin themselves: `npm run reset-2fa -- <username> --prod` |
| Need to look at the data | Supabase → **Table Editor** (read only, please: changing rows by hand skips the checks the dashboard makes) |

## Don'ts

- Don't edit or delete rows in the Table Editor unless you know exactly why. Use the dashboard.
- Don't turn sign-up back on.
- Don't make the `restore-snapshots` bucket public.
- Don't run `supabase db reset` while linked to the live project.
