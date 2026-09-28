# Agency ATS

A recruiting agency ATS: client magic-link feedback, hiring-manager-approved evaluation criteria,
automatic scorecards, placements and billing.

Stack: Next.js 15, Supabase (Postgres + Auth), Netlify, Claude.

- `src/` the app
- `supabase/migrations/` the database, run in this order in the Supabase SQL Editor
- `supabase/tests/database/` database tests (run automatically by GitHub Actions)
- `netlify.toml` build settings (runs the unit tests before every deploy)

Secrets live in Netlify environment variables, never in this repository.

## Updates

- **Update 2** adds candidate search and profiles (with resume upload), clients as a CRM (client → contacts), a benefits checklist on reqs,
  editing for reqs and candidates, and a **Setup check** page (bottom of the left menu) that tells you what is missing.
  After deploying it, run these two files in the Supabase SQL Editor, in order:
  `supabase/migrations/20260924000000_profiles_crm_benefits.sql`, then `supabase/migrations/20260924000100_resume_storage.sql`.
