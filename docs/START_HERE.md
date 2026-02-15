# Start Here — Build the Minerva Tour App (Full Sweep)

Use this when you want an agent (or yourself) to **build as much of the app as possible in one run** (e.g. a few hours), instead of going phase-by-phase.

## What to do

1. **Create a new workspace** — New folder, new repo, or new Cursor/IDE project. No existing Minerva Tour code.

2. **Copy this folder into the new project** — Copy the entire `for-new-project` folder (or at least these files) into the new workspace, e.g. as `docs/` or `prd-docs/`:
   - `prd.md` (required)
   - `database-schema.md` (required)
   - `SETUP.md`, `QUICK_START.md`, `GHIN_INTEGRATION.md` (helpful)
   - This file: `START_HERE.md`

3. **Give the agent this brief** (paste into the first message or a `.cursorrules` / project instructions):

---

**Brief for the agent:**

You are building the **Minerva Tour App** from scratch in one extended session (aim for a few hours of work). The single source of truth is **`docs/prd.md`**. Read it fully first.

**Goal:** Build as much of the app as you can end-to-end in this session. Prefer **breadth**: get one path working through the stack (auth → courses → scores → leaderboard/profile) rather than perfecting one area. We can refine and add tests in a follow-up.

**Tech:** Use the stack recommended in the PRD: Next.js (App Router), React, Supabase (auth, Postgres, storage). Implement the schema from **`docs/database-schema.md`**. Mobile-first UI; exact layout and design are up to you.

**Scope (in rough order):**
1. Project setup: Next.js, Supabase, env, run the full schema (users, user_provisions, courses, scores, events, seasons, audit_logs, etc.), auth (Google + email magic link), role from `user_provisions` on first sign-in.
2. Core member experience: course list/add/edit (admin-only delete), course detail, “add another tee”, link to USGA NCRDB. Score submission: pick course/tee, tee time and/or gross score, “me” or “other member”, tee times list and detail, partial rounds (holes played 1–36), net calculation (formulas in PRD). Completed rounds list; edit/delete only in current event.
3. Profile: profile page, profile picture upload (Supabase Storage), handicap and GHIN number (manual for now; see GHIN doc).
4. Leaderboard: current event and season standings (net, and scratch if you have time), points per PRD.
5. Home: current event status, quick actions (start round, add tee time), links to standings/rules/photos/schedule.
6. Admin: audit log (log key actions; admin viewer with filter/search if time), user list and role changes, user provisioning (add/view provisions). Event/season management and schedule if time.
7. Navigation: make sure Home, Scores, Leaderboard, Courses, Profile, and Admin (for admins) are reachable; layout is your choice.
8. Offline/sync and polish as time allows.

**Constraints:**
- Follow the business rules in the PRD (scoring formulas, point payouts, 9-hole bridging rule, who can edit/delete what).
- Log important actions to an `audit_logs` table for admin troubleshooting.
- If you run out of time, document what’s done and what’s left (e.g. in a `PROGRESS.md` or in the PRD).

**Do not** assume any existing code or file structure. Create the project and structure from scratch. If something in the schema or PRD is ambiguous, choose a reasonable interpretation and note it.

---

4. **Run the session** — Start the agent with the brief above (or a short message that points to it: “Read `docs/START_HERE.md` and the PRD, then build the app as described.”). Let it run for your chosen time (e.g. 2–4 hours), then review the app and any PROGRESS/notes.

5. **Afterward** — You can continue in the same workspace incrementally (fix bugs, add tests, fill in phases 2–3 of the PRD) or use the PRD and `docs/` again for another “full sweep” in a different direction.
