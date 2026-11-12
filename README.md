# Salsa Barber

Website, online booking and staff dashboard for Salsa Barber, 41 Liverpool Road South, L31 7BN.

Built with Next.js 16, Tailwind CSS 4, shadcn/ui and Supabase. Progress is tracked in
[implementation-phases.md](implementation-phases.md); the design is described in [docs/design-brief.md](docs/design-brief.md).

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3417
```

Or with Docker: `docker compose up app`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3417 |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run assets:logo` | Regenerate logo sizes, icons and the OG image from `assets/` |

The full guide (deploying, backups, troubleshooting) is written in the launch phase.
