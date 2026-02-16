# GHIN Integration Guide (Reference for New Project)

Use this when adding handicaps to a Minerva Tour app. GHIN has no public API; this doc summarizes options and limitations.

**GHIN does not provide a public, open API** for handicap lookup by GHIN number. The options below are for reference when you add handicaps.

## Official Options

### 1. Contact Your State/Regional Golf Association

GHIN is administered through state and regional golf associations. To get official API access:

1. **Contact your state golf association** (e.g., Georgia State Golf Association, California Golf Association)
2. **Request API access** for your application
3. **Obtain proper credentials** and authorization
4. **Comply with USGA privacy/data policies** (handicap data is personal information)

**Pros:**
- Official and supported
- Compliant with terms of service
- Reliable and stable

**Cons:**
- May require partnership or vendor status
- Could involve fees or contracts
- May take time to set up

### 2. Become a GHIN-Licensed Vendor/Partner

Many tournament management software systems have built-in GHIN integration because they're licensed vendors. This typically requires:

- Business partnership with GHIN/USGA
- Compliance with data privacy requirements
- Possible licensing fees

## Unofficial Options (Use with Caution)

### Reverse-Engineered Wrappers

There are some open-source projects that reverse-engineer GHIN's internal endpoints:

- **graphql-ghin-wrapper** (GitHub: `rgstephens/graphql-ghin-wrapper`)
  - Provides GraphQL interface to GHIN data
  - Uses internal endpoints like `golfermethods.asmx/FindGolfer`
  - **Warning**: Not officially supported, may violate terms of service

**Risks:**
- Could violate GHIN's terms of service
- Endpoints may change without notice
- No official support
- Potential legal/privacy issues

## Recommended Approach for Minerva Tour

### Phase 1: Manual entry (MVP) -- CURRENT
- Admins manually update member handicaps.
- Users can view their handicap on their profile.
- Capture and store handicap at the start of each event window.

#### Bulk update via GHIN screenshot (Cursor Skill)

A Cursor agent skill exists at `.cursor/skills/ghin-scrape/SKILL.md` to streamline bulk handicap updates. The workflow:

1. Login to the GHIN website and take a screenshot of the club member list
2. In Cursor chat, share the screenshot and say **"run ghin-scrape"**
3. The agent extracts names and handicap indexes from the image
4. Matches members to the database by `full_name` (with known fuzzy matches like "Jay Kornder II" = "Jay Kornder", "Zachary Taylor" = "Zack Taylor")
5. Presents a diff for confirmation before executing
6. Updates `users.handicap_index` and inserts `handicap_history` rows with `source: 'manual'`
7. Reports any DB members missing from the screenshot (with GHIN numbers so they can be added to the GHIN "following" list)

**Important**: Members not present in the screenshot are left completely untouched -- no update, no history entry. Invoke the skill explicitly by name; it does not auto-trigger on mentions of GHIN or handicaps.

### Phase 2: Sync button (only if you have API access)
- There is **no public GHIN API**. Tested endpoints return HTML or 404; programmatic access requires official credentials from a state/regional golf association or GHIN partnership.
- If you obtain API access, a “Sync from GHIN” flow can update `handicap_index` and write to `handicap_history` with source `'ghin'`.

### Phase 3: Official integration (long-term)
- Pursue official partnership with state golf association.
- Implement automatic sync (e.g. daily or before event windows).

## Implementation Considerations

### Database schema (for your app)

Include at least:

```sql
-- Users table has:
ghin_number TEXT  -- GHIN number stored
handicap_index NUMERIC(5, 1)  -- Current handicap

-- Handicap history table has:
source TEXT  -- 'manual', 'ghin' (for future integration)
```

### Sync Strategy

If/when API access is available:

1. **Scheduled Sync**: Daily/weekly background job to sync handicaps
2. **Event Window Sync**: Automatically sync before event windows start
3. **Manual Sync**: Admin-triggered sync for specific users
4. **User-Triggered**: Users can request sync (if allowed)

### Error Handling

- Handle API rate limits
- Graceful degradation if API is unavailable
- Log sync attempts and failures
- Notify admins of sync issues

## Resources

- [USGA Handicap Manual](http://www.usga.org/content/usga/home-page/Handicapping/handicap-manual.html)
- [GHIN Support](https://usgasupport.zendesk.com)
- State Golf Association websites (varies by state)
