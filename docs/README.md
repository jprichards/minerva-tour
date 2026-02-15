# For New Project — Minerva Tour (from scratch)

Use or copy these docs when **starting a new Minerva Tour app** in a new workspace. They are written for a from-scratch build with no assumption about existing code.

- **`prd.md`** — Product requirements and business rules. Single source of truth for what the app must do; design and implementation choices are left to the builder.
- **`SETUP.md`** — Generic setup: create a new Next.js + Supabase app, env vars, running the schema, making yourself admin.
- **`QUICK_START.md`** — Short checklist for getting a new project running.
- **`database-schema.md`** — Reference schema (tables, columns, RLS) to implement when building the app. Adapt to your chosen stack (e.g. Supabase/Postgres).
- **`GHIN_INTEGRATION.md`** — Handicap integration options and limitations (GHIN has no public API). Useful when you add profiles and handicaps.

**Suggested order:** Read `prd.md` first, then use `SETUP.md` and `QUICK_START.md` to scaffold the project, and use `database-schema.md` as the reference for your data model.
