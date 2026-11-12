# Salsa Barber

Website, online booking and staff dashboard for Salsa Barber, 41 Liverpool Road South, L31 7BN.

Built with Next.js 16, Tailwind CSS 4, shadcn/ui and Supabase. Progress is tracked in
[implementation-phases.md](implementation-phases.md); the design is described in [docs/design-brief.md](docs/design-brief.md).

## Getting started

```bash
npm install
npm run db:start     # local Supabase in Docker (ports 47320–47329)
npm run env:local    # writes the local Supabase URL and keys into .env.local
npm run photos:import  # website photos (needs JPEGs in photos/converted/)
npm run dev          # http://localhost:3417
```

Local sample logins (dev seed only): `admin`, `owner`, `sam`, `jamie`, password `LocalDev-Sample-1`.
Supabase Studio: http://127.0.0.1:47323

Or with Docker: `docker compose up app`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3417 |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Database tests against local Supabase (RLS, constraints, triggers) |
| `npm run test:e2e` | Builds, then runs Playwright (phone + desktop) against local Supabase |
| `npm run create-admin -- <username> "<Name>"` | Creates an admin login and prints a one-time password (`:prod` for production) |
| `npm run db:start` / `db:stop` | Start / stop local Supabase |
| `npm run db:reset` | Rebuild the local database from migrations + sample seed |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` |
| `npm run env:local` | Copy local Supabase URL/keys into `.env.local` |
| `npm run photos:import` | Imports the chosen website photos from `photos/converted/` (`-- --replace`, `:prod`) |
| `npm run assets:logo` | Regenerate logo sizes, icons and the OG image from `assets/` |

The full guide (deploying, backups, troubleshooting) is written in the launch phase.
