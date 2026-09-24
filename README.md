# Agency ATS

A recruiting agency ATS: client magic-link feedback, hiring-manager-approved evaluation criteria,
automatic scorecards, placements and billing.

Stack: Next.js 15, Supabase (Postgres + Auth), Netlify, Claude.

- `src/` the app
- `supabase/migrations/` the database, run in this order in the Supabase SQL Editor
- `supabase/tests/database/` database tests (run automatically by GitHub Actions)
- `netlify.toml` build settings (runs the unit tests before every deploy)

Secrets live in Netlify environment variables, never in this repository.
