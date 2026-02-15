# Quick Start — New Minerva Tour Project

Checklist for getting a new Minerva Tour app running from scratch.

## Setup checklist

- [ ] Create a Supabase project at [supabase.com](https://supabase.com)
- [ ] Create your app (e.g. Next.js + Supabase client)
- [ ] Run the database schema (see `database-schema.md`) in Supabase SQL Editor
- [ ] Add `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- [ ] Implement auth (Google + email magic link) and auth callback that creates/updates `users` and applies role from `user_provisions` or default
- [ ] Run the app and sign in
- [ ] Set your user’s role to `admin` in Supabase (Table Editor → **users** or SQL)
- [ ] Confirm you can access a protected route and (if you have tests) run tests

## Environment variables

`.env.local` in project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-default-key-here
```

Get both from Supabase: **Settings** → **API** (Project URL and publishable default key).

## Making yourself admin

After first sign-in:

- **Table Editor:** Supabase → **Table Editor** → **users** → find your email → set `role` to `admin` → Save
- **SQL:** `UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';`

Then use the PRD (`prd.md`) to build out features phase by phase.
