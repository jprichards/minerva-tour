---
name: ghin-scrape
description: >
  Bulk-update member GHIN handicap indexes from a screenshot of the GHIN website.
  ONLY use this skill when the user explicitly invokes it by name (e.g. "run ghin-scrape").
  Do NOT auto-apply when handicaps or GHIN are mentioned in other contexts.
---

# ghin-scrape

Bulk-update member handicap indexes by extracting data from a GHIN website screenshot.

## Workflow

Follow these steps in order. Do not skip the confirmation steps.

### Step 1: Extract data from screenshot

Read the user-provided screenshot(s) using vision. Extract every member row as a `(name, handicap_index)` pair. If handicap index shows "NH" or is blank, note it as `null`. A "+" prefix (e.g. "+3.0") is a valid positive handicap -- store as the numeric value (3.0).

Present the extracted data as a markdown table for user confirmation:

| # | Name (from GHIN) | Handicap Index |
|---|-------------------|----------------|
| 1 | John Smith        | 12.3           |

Ask: "Does this look correct? Any corrections before I proceed?"

### Step 2: Fetch current members from DB

Query Supabase (via REST API, MCP, JS client, or direct SQL -- whatever is available):

```sql
SELECT id, full_name, handicap_index, ghin_number
FROM users
WHERE role IN ('admin', 'member', 'playing_guest')
ORDER BY full_name;
```

Use the service role key from `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`) for auth.

### Step 3: Match and diff

Match extracted names to DB members:
- **Primary**: case-insensitive match on `full_name`
- **Secondary**: if GHIN numbers are visible in the screenshot, cross-reference `ghin_number`
- **Fuzzy**: if a name is close but not exact, flag it for user confirmation

Known fuzzy matches (confirmed by user):
- "Jay Kornder II" (GHIN) = "Jay Kornder" (DB)
- "Zachary Taylor" (GHIN) = "Zack Taylor" (DB)

Build four lists:
1. **Will update** -- matched members where handicap changed (show old -> new)
2. **Verified unchanged** -- matched members where handicap is the same (no update to `users`, but still insert a `handicap_history` row as a verification record)
3. **Not in screenshot** -- DB members not found in the screenshot. Leave completely unchanged. Do NOT update their handicap. Do NOT insert a handicap_history row. Report them with their GHIN number so the user can add them to their GHIN "following" list for next time.
4. **Not in DB** -- names from GHIN that don't match any DB member. Skip these.

Present all four lists and ask: "Ready to apply the updates?"

### Step 4: Execute updates

**For members with changed handicaps** (from "will update" list):

```sql
UPDATE users
SET handicap_index = {new_handicap}, updated_at = NOW()
WHERE id = '{user_id}';

INSERT INTO handicap_history (user_id, handicap_index, effective_date, source)
VALUES ('{user_id}', {new_handicap}, CURRENT_DATE, 'manual');
```

**For members with unchanged handicaps** (from "verified unchanged" list) -- insert history only, no user update:

```sql
INSERT INTO handicap_history (user_id, handicap_index, effective_date, source)
VALUES ('{user_id}', {current_handicap}, CURRENT_DATE, 'manual');
```

Generate as a single script and execute. Members not in the screenshot are left completely untouched (no update, no history entry).

### Step 5: Verify and report

Run a verification query:

```sql
SELECT u.full_name, u.handicap_index, h.effective_date
FROM users u
JOIN handicap_history h ON h.user_id = u.id
WHERE h.effective_date = CURRENT_DATE AND h.source = 'manual'
ORDER BY u.full_name;
```

Present a final summary:

| Member | Old | New | Status |
|--------|-----|-----|--------|
| John Smith | 13.1 | 12.3 | Updated |

Report totals: X updated, Y verified unchanged, Z not in screenshot, W not in DB.

## Database Schema Reference

**users** table:
- `id` UUID (PK)
- `full_name` TEXT
- `handicap_index` NUMERIC(5,1) -- range +3.0 to 54.0
- `ghin_number` TEXT (optional)
- `updated_at` TIMESTAMPTZ

**handicap_history** table:
- `id` UUID (PK, auto-generated)
- `user_id` UUID (FK -> users.id)
- `handicap_index` NUMERIC(5,1)
- `effective_date` DATE
- `source` TEXT -- use 'manual' for this workflow
- `created_at` TIMESTAMPTZ (auto)
