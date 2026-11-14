# Launch guide

Step by step, from this code on your computer to the live website and dashboard. Do the steps in order. Nothing here
needs you to write code. Where a step says "copy", keep the value in a password manager, never in a file you commit.

You'll use three websites:

- **GitHub**: where the code lives.
- **Supabase**: the database, the staff logins and the photo storage. See [supabase-guide.md](supabase-guide.md) for
  what that means.
- **Vercel**: where the website runs.

And on your computer: this project, Node.js 22 or later, and Docker running (for the local copy).

> Menu names on Supabase and Vercel change from time to time. If a name below doesn't match exactly, look for the
> closest one.

---

## 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
2. Name: `salsa-barber`. **Region: London (eu-west-2)**, close to the website (Vercel runs it in London too).
3. Choose a strong **database password** and save it in your password manager. You'll need it once, in step 2.
4. Wait for the project to finish setting up (a minute or two).

## 2. Put the database structure in place

This copies the tables, rules and functions (the "migrations") to the new project. It **never** copies the sample
data: the live site starts empty.

In a terminal in this project:

```bash
npx supabase login                         # opens the browser once
npx supabase link --project-ref <ref>      # <ref> is in the project's URL: supabase.com/dashboard/project/<ref>
npx supabase db push                       # asks for the database password from step 1
```

`db push` lists the migrations it's about to apply; answer yes. If it ever offers to include the seed, say **no**.

## 3. Check the project's settings

In the Supabase dashboard for the project:

- **Authentication → Sign In / Providers**
  - **Email**: enabled (staff sign in with a username, which is an email address behind the scenes).
  - **Allow new users to sign up**: **off**. Only the owner and admin create accounts, from the dashboard.
  - **Confirm email**: off (the staff addresses aren't real mailboxes).
- **Authentication → Multi-Factor**: **TOTP (authenticator app)** enrolment and verification **on**.
- **Database → Cron** (or Integrations → Cron): there's a job called **`purge-old-data`** at `15 3 * * *`, active.
  It's the nightly clean-up. If it isn't there, the `pg_cron` extension needs switching on (Database → Extensions)
  and step 2 running again.
- **Storage**: three buckets: `gallery` and `team` (public) and `restore-snapshots` (**private**).

Then **Project Settings → API keys** and copy three values:

| Name | What it is |
| --- | --- |
| Project URL | `https://<ref>.supabase.co` |
| Publishable key | Public, safe in the browser |
| Secret key | **Private.** Full access to everything. Never share it, never paste it in chat or email |

## 4. Create the Vercel project

1. Push this code to GitHub (a private repository).
2. Sign in at [vercel.com](https://vercel.com) → **Add New → Project** → import the repository. Framework: Next.js
   (found automatically). The region is set to London by `vercel.json`.
3. Before the first deploy, open **Environment Variables** and add these, ticking **Production** and **Preview**
   for each:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 3 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `SUPABASE_SECRET_KEY` | Secret key, marked **Sensitive** |
| `NEXT_PUBLIC_SITE_URL` | The site's address, e.g. `https://salsa-barber.vercel.app` (no slash at the end) |
| `NEXT_PUBLIC_BOOKING_ENABLED` | `false` for now (step 9 turns it on) |
| `NEXT_PUBLIC_SHOW_PLACEHOLDERS` | `false` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | From `npm run vapid:keys` on your computer; the private one **Sensitive** |
| `VAPID_SUBJECT` | `mailto:` and an address you read, e.g. `mailto:you@example.com` |
| `RESEND_API_KEY`, `OWNER_ALERT_EMAIL`, `ALERT_FROM_EMAIL` | Leave out for now (owner emails stay off; see step 11) |

4. **Deploy.** When it finishes, open the address. You should see the homepage with the shop's details and the price
   list (no photos yet).

If you don't know the final address yet, deploy once, copy the `….vercel.app` address Vercel gives you into
`NEXT_PUBLIC_SITE_URL`, and redeploy (Deployments → ⋯ → Redeploy). Anything starting `NEXT_PUBLIC_` only changes
after a redeploy.

## 5. Create the first admin login

The admin is the technical/support account (never a barber, never on the website). On your computer, create a file
called `.env.production.local` in the project folder (it's ignored by git) with:

```
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
SUPABASE_SECRET_KEY=<Secret key>
```

Then:

```bash
npm run create-admin:prod -- <username> "<Your name>"
```

It prints a one-time password. Sign in at `<site>/login`, then straight away:

1. **Account → Password**: choose your own password.
2. **Account → Two-step sign-in**: set it up with an authenticator app. (If you ever lose the phone:
   `npm run reset-2fa -- <username> --prod`.)
3. **Team → Add person**: add the **owner** (role Owner). Give them their temporary password in person. They change it
   on first sign-in, and add their barbers the same way.

## 6. Photos

Either upload them in **Dashboard → Website** (shop photo, slideshow, recent cuts; iPhone photos are fine), or, if
the chosen photos are in `photos/converted/` with `scripts/photos-selection.json`:

```bash
npm run photos:import:prod
```

## 7. Fill in the real details

With the owner, in the dashboard:

- **Settings**: opening hours, closed days (bank holidays), booking rules, Google rating and link, website notes.
- **Services**: the real **length** of every service (they're placeholders until then) and which days each can be
  booked online.
- **Team**: each barber's profile, photo, services, working hours and time off; **Takes bookings** and **Show on
  website** when they're ready.
- **Website**: reviews copied word for word from Google (tick From Google).

## 8. Check the live site

From your computer (nothing is changed by this):

```bash
SMOKE_URL=https://<your site> SMOKE_SUPABASE_URL=<Project URL> SMOKE_SUPABASE_KEY=<Publishable key> npm run test:smoke
```

On Windows PowerShell, set the variables first: `$env:SMOKE_URL="https://…"` (and the other two), then
`npm run test:smoke`.

Everything should pass. Then try it yourself on a phone: the homepage, `/book`, and the dashboard.

## 9. Turn on online booking

When the owner has confirmed hours, service lengths and who does which service: in Vercel set
`NEXT_PUBLIC_BOOKING_ENABLED` to `true` and **redeploy**. Make a test booking with your own mobile number, accept it in
the dashboard, then cancel it.

## 10. Booking alerts on staff phones

On each phone: open `<site>/dashboard`, sign in, and add it to the Home Screen (iPhone: Share → Add to Home Screen;
Android: menu → Install app). Open it from the Home Screen and tap **Turn on** in the bar at the top (or Account →
Booking alerts). Then **Send a test**. iPhones need iOS 16.4 or later.

## 11. Owner alert emails (optional, later)

1. Create a [Resend](https://resend.com) account and verify the shop's domain (or use their test sender, which only
   delivers to your own Resend address).
2. In Vercel add `RESEND_API_KEY` (Sensitive), `OWNER_ALERT_EMAIL` (where alerts go) and `ALERT_FROM_EMAIL`
   (e.g. `Salsa Barber <bookings@yourdomain>`), then redeploy.

## 12. Backups

- At least once a week: **Dashboard → More → Backup → Download backup** (the admin's Today page reminds you after 7
  days). Keep the files somewhere private: they contain customers' names and numbers.
- Optionally, a full copy including the photo files on your computer: set `BACKUP_DIR` in `.env.production.local`
  to a private folder, then `npm run backup:prod` (keeps the newest 8).

## 13. A custom domain (later)

Vercel → Project → **Domains** → add it and follow the DNS instructions. Then change `NEXT_PUBLIC_SITE_URL` to the new
address and redeploy (links in customers' messages use it).

---

## Changing things later

- **Code changes**: push to GitHub; Vercel deploys automatically. Preview deployments use the same database, so
  test carefully.
- **Database changes** (a new file in `supabase/migrations/`): run `npx supabase db push` **before** deploying the code
  that needs it. Never edit a migration that's already been pushed; add a new one.
- **Never** run `supabase db reset` or the seed against the live project.

## Keep the free Supabase project awake

Free Supabase projects pause after a week without use. `vercel.json` calls `/api/health` every morning, which counts
as use. Vercel's free plan includes this. If the site ever shows an error and the Supabase dashboard says the project
is paused, press **Restore** there.
