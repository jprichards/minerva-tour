# Setup Guide — Minerva Tour App (New Project)

Use this when setting up a **new** Minerva Tour project from scratch.

## Prerequisites

- Node.js (v18 or higher)
- A Supabase account (free tier is fine)
- npm or yarn

## Step-by-Step Setup

### Step 1: Create the app

Create a new Next.js project (App Router recommended) and install dependencies. Add Supabase: `@supabase/supabase-js` and `@supabase/ssr`. Use Tailwind or your preferred styling.

### Step 2: Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign up or log in, create a **New Project**.
2. Note your **Project URL** and **publishable default key**: **Settings** → **API**.

### Step 3: Run the database schema

1. In Supabase, open **SQL Editor** → **New Query**.
2. Use the schema defined in `database-schema.md` (or a single `schema.sql` you generate from it). Create tables for: users (with role), user_provisions, handicap_history, seasons, events, courses, scores, playoff_brackets, audit_logs, tournaments, app_settings. Include RLS policies and any triggers (e.g. create user row on first sign-in, apply provisioned role).
3. Run the script. Fix any ordering issues (e.g. create `events` before referencing it from `seasons`).

### Step 4: Environment variables

In the project root, create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_publishable_default_key_here
```

Use your Supabase project URL and publishable default key. Get both from **Settings** → **API** in your Supabase dashboard.

### Step 5: Auth and first run

1. Implement login (e.g. Google OAuth + email magic link) and an auth callback that creates/updates your `users` row and applies a role from `user_provisions` or defaults to `non_playing_guest`.
2. Run the app (`npm run dev` or equivalent), sign in.
3. In Supabase **Table Editor** → **users**, set your user's `role` to `admin` (or run `UPDATE users SET role = 'admin' WHERE email = 'your@email.com';`).

### Step 6: Verify

- You can sign in and see a protected area (e.g. home/dashboard).
- Run any tests you've added; fix failures.

## Troubleshooting

- **Invalid API key** — Check `.env.local` and that you're using the **publishable default** key. Restart the dev server after changes.
- **Relation does not exist** — Ensure all schema SQL ran successfully; check table order and foreign keys.
- **User not found after sign-in** — Ensure your auth callback creates/updates the `users` row and that RLS allows the current user to read their row.

## Next steps

- Follow the PRD phases in `prd.md` (e.g. Phase 1: courses and score submission).
- Add audit logging for key actions so admins can troubleshoot later.
