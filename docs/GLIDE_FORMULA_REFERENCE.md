# Glide App Formula Reference: "Current Event Scores" Tab

This document is a comprehensive breakdown of every formula in the "(2025) Minerva Tour App" Glide spreadsheet's "Current Event Scores" tab. It serves as the source of truth for achieving parity between the Glide app's scoring logic and our Next.js app.

**Source file:** `docs/glide-app/(2025) Minerva Tour App.xlsx`

---

## Global Variable

The handicap allowance percentage lives in the Controls sheet:

- **`Controls!W2`** = `0.95` (labeled "Playing Handicap %")
- This is the multiplier applied to course handicap for net scoring (95% allowance)
- In our app, this is now stored per-season as `seasons.handicap_allowance` (integer 1-100, so 95 = 0.95)

---

## Score Entry Methods

The Glide app supports two ways of entering scores:

1. **Gross Score entry** (col I): Player enters their total gross score directly
2. **Over Par entry** (col B + C): Player incrementally enters strokes over par and holes completed

Many formulas have branching logic to handle both entry methods. The key distinction:
- When col I (Gross Score) has a value, use it directly
- When col I is empty, derive gross from `Par + Over Par` (col K + col B)

---

## Column-by-Column Breakdown

### User Input Columns (no formulas)

| Col | Header | Description |
|-----|--------|-------------|
| B | Over Par | Running total of strokes over par (incremental entry mode) |
| C | Thru | Number of holes completed so far (incremental entry mode) |
| F | Course (optional) | Selected course/tee combo (e.g. "Wolf Creek - Blue (18 Holes)") |
| I | Gross Score (optional) | Total gross score when entered directly (complete round entry mode) |
| T | Entered by | Email of the person who entered the score |
| U | Created Date/Time | Timestamp of score creation |
| W | Tee Time | Optional tee time |
| Y | ID | Unique score identifier (UUID) |
| Z | Last Updated By | Email of last editor |
| AA | Last Updated Time | Timestamp of last edit |
| AQ | Hide from score list | Manual override to hide a score |
| AU | Me vs. Other Member | Whether score is for "Me" or another member |
| AV | Selected Member | Name of the member (when entering for someone else) |
| AY | Current Location | GPS location (unused in our app) |

---

### Data Lookup Columns

These pull data from other sheets (Courses, Profile) based on the selected course and player.

#### Col A: Name
```
=if(len(F)=0, "", if(AU="Me", AC, AV))
```
**Logic:** If no course selected, empty. Otherwise: if entering for yourself, use the entered-by name (col AC); if entering for another member, use the selected member name (col AV).

**App equivalent:** Resolved at score entry time from the authenticated user or the selected player.

---

#### Col E: Handicap
```
=IF(LEN(A) = 0, "", if(J=18, vlookup(A, Profile!A:E, 3, false), vlookup(A, Profile!A:F, 5, false)))
```
**Logic:** Look up the player's handicap from the Profile sheet. Uses the **18-hole handicap index** (Profile col C) for 18-hole courses, or the **9-hole handicap** (Profile col E) for 9-hole courses.

**App equivalent:** `users.handicap_index` -- our app only stores one handicap index. The 9-hole handicap is typically half the 18-hole index per USGA rules.

---

#### Col G: Rating
```
=IF(LEN(F) = 0, "", vlookup(F, Courses!A:H, 5, false))
```
**Logic:** Look up course rating from the Courses sheet (col E = Rating).

**App equivalent:** `courses.rating`

---

#### Col H: Slope
```
=IF(LEN(F) = 0, "", vlookup(F, Courses!A:H, 6, false))
```
**Logic:** Look up slope from the Courses sheet (col F = Slope).

**App equivalent:** `courses.slope`

---

#### Col J: # of Holes
```
=IF(LEN(F) = 0, "", vlookup(F, Courses!A:H, 7, false))
```
**Logic:** Look up number of holes from the Courses sheet. Derived from the course type (18 Holes, 9 Holes, Front 9, Back 9) via the Types sheet.

**App equivalent:** Derived from `courses.type` via `getMaxHoles()`.

---

#### Col K: Par
```
=IF(LEN(F) = 0, "", vlookup(F, Courses!A:H, 8, false))
```
**Logic:** Look up par from the Courses sheet (col H = Par).

**App equivalent:** `courses.par`

---

### Core Scoring Formulas

These are the critical calculation columns. Variables used throughout:
- `E` = Handicap Index
- `H` = Slope
- `G` = Rating
- `K` = Par
- `I` = Gross Score (direct entry)
- `B` = Over Par (incremental entry)
- `C` = Thru (holes completed)
- `J` = Total Holes
- `Controls!W2` = 0.95 (handicap allowance)

---

#### Col L: Actual Gross
```
=if(len(A)=0, "", if(len(I)>0, I, K+B))
```
**Logic:** If gross score was entered directly (col I), use it. Otherwise, derive from `Par + Over Par`.

**Math:** `Actual Gross = Gross Score (if provided) OR Par + Over Par`

**App equivalent:** The app always stores the final gross score. The incremental over-par entry is handled in the UI before saving.

---

#### Col M: Net Score (from gross score entry only)
```
=IF(LEN(A) = 0, "",
  ROUND(
    I - ROUND(Controls!W2 * ((E*H/113) + (G-K)), 0) - K,
  0))
```
**IMPORTANT:** This formula only produces correct results when col I (Gross Score) has a value. When the player used over-par entry, col I is empty and this formula returns a nonsensical value. Use col Q (Projected Net) as the authoritative net score in all cases.

**Math (expanded):**
1. Unrounded Course Handicap = `(HandicapIndex * Slope / 113) + (Rating - Par)`
2. Playing Handicap = `round(0.95 * UnroundedCourseHandicap)`
3. Net Over Par = `round(GrossScore - PlayingHandicap - Par)`

**Worked example (Devin Blankenship, Event 1):**
- Handicap=8.7, Slope=132, Rating=71.0, Par=71, Gross=81
- Unrounded CH = (8.7 * 132 / 113) + (71.0 - 71) = 10.16 + 0 = 10.16
- Playing Handicap = round(0.95 * 10.16) = round(9.652) = **10**
- Net Over Par = round(81 - 10 - 71) = **0** (Net Even)

**Worked example (George Lane, Event 1):**
- Handicap=8.6, Slope=136, Rating=69.3, Par=71, Gross=89
- Unrounded CH = (8.6 * 136 / 113) + (69.3 - 71) = 10.35 + (-1.7) = 8.65
- Playing Handicap = round(0.95 * 8.65) = round(8.22) = **8**
- Net Over Par = round(89 - 8 - 71) = **10**

**App equivalent:** `calculateNetScore()` in `src/lib/scoring.ts` -- uses WHS formula with `(Rating - Par)` and per-season handicap allowance.

---

#### Col N: Projected Gross
```
=IF(LEN(A) = 0, "",
  ROUND(
    B + (ROUND(Controls!W2 * ((E*H/113) + (G-K)), 0) / J) * (J - C) + K,
  0))
```
**Logic:** Projects what the player's final 18-hole gross score would be if they continue at their current pace, accounting for the playing handicap benefit over remaining holes.

**Math (expanded):**
1. Playing Handicap = `round(0.95 * ((Index*Slope/113) + (Rating-Par)))`
2. Handicap strokes per hole = `PlayingHandicap / TotalHoles`
3. Projected Gross = `round(OverPar + HandicapPerHole * (TotalHoles - ThruHoles) + Par)`

**Intuition:** The player's current over-par (B) is their raw performance. The formula adds back the handicap benefit they'll receive over the remaining unplayed holes, plus par, to project a gross score.

**App equivalent:** Projection logic is handled in UI pages, not in `scoring.ts`. The formula here shows projection should use the playing handicap, not the raw course handicap.

---

#### Col O: Actual Scratch
```
=IF(LEN(A) = 0, "",
  if(len(C) + len(I) = 0, "",
    if(len(I) > 0,
      I - ROUND(((0*H)/113) + (G-K), 0) - K,
      ROUND(L - ROUND(((0*H)/113) + (G-K), 0) - K, 0)
    )
  ))
```
**Logic:** Scratch score uses handicap index of 0. The formula simplifies to:
- `ROUND((0*Slope/113) + (Rating-Par))` = `ROUND(Rating - Par)`
- Scratch Over Par = `Gross - ROUND(Rating - Par) - Par`

This is equivalent to `Gross - Rating` (rounded).

**Math:** `Scratch Over Par = round(GrossScore - round(Rating - Par) - Par)`

When gross is entered directly (col I): uses I directly (no outer round needed since all are integers).
When using over-par entry: uses Actual Gross (col L) with outer ROUND.

**App equivalent:** `calculateScratchScore()` -- currently `round(Gross - Rating)`. These are mathematically equivalent.

---

#### Col P: Projected Scratch
```
=IF(LEN(A) = 0, "",
  if(len(C) + len(I) = 0, "",
    if(len(I) > 0,
      I - ROUND(((0*H)/113) + (G-K), 0) - K,
      ROUND(N - ROUND(((0*H)/113) + (G-K), 0) - K, 0)
    )
  ))
```
**Logic:** Same as Actual Scratch but uses Projected Gross (col N) instead of Actual Gross (col L) when the player used over-par entry. If gross was entered directly, actual and projected scratch are the same.

**App equivalent:** The app calculates scratch at the time of score entry/completion, so projected scratch is only needed for in-progress rounds on the leaderboard.

---

#### Col Q: Projected Net (AUTHORITATIVE net score)
```
=IF(LEN(A) = 0, "",
  if(len(C) + len(I) = 0, "",
    if(len(I) > 0,
      M,
      ROUND(N - ROUND(Controls!$W$2 * ((E*H/113) + (G-K)), 0), 0) - K
    )
  ))
```
**Logic:** This is the canonical net score used for rankings.
- If gross was entered directly: uses col M (Net Score) directly
- If using over-par entry: applies the full net formula to the Projected Gross (col N)

**Math (over-par entry path):**
1. Playing Handicap = `round(0.95 * ((Index*Slope/113) + (Rating-Par)))`
2. Projected Net Over Par = `round(ProjectedGross - PlayingHandicap) - Par`

Note: The outer ROUND and subtraction of K are split differently here vs col M, but the result is the same for integer inputs.

**App equivalent:** The app stores `net_strokes_over_par` on the scores table. This is the value that should match col Q.

---

#### Col AT: Score Needed for E (Net Even)
```
=IF(LEN(A) = 0, "",
  ROUND(Controls!W2 * (((E*H)/113) + (G-K)), 0) + K)
```
**Logic:** The gross score a player needs to shoot to post a net even (E) result.

**Math:** `Net Even Gross = PlayingHandicap + Par`

**Worked example (Devin Blankenship):**
- Playing Handicap = 10, Par = 71
- Score Needed for E = 10 + 71 = **81** (matches his actual gross, hence net E)

**App equivalent:** Score detail page computes `PlayingHandicap + Par` for the "Score Needed to shoot Net E" display.

---

### Display / Formatting Columns

These format scores for display in the Glide app.

#### Col D: Display Projection?
```
=IF(LEN(A) = 0, "", "Y")
```
Always "Y" if a score exists. Controls visibility in the Glide UI.

---

#### Col V: Formatted Created Dttm
```
=IF(LEN(A) = 0, "", TEXT(U, "M/D/YY - H:MM AM/PM"))
```
Formats the creation timestamp for display.

---

#### Col X: Tee Time (to date)
```
=if(len(A)=0, "", text(W, "DDD M/D - H:MM AM/PM"))
```
Formats tee time as "Mon 3/3 - 2:58 PM".

---

#### Col AB: Formatted Last Updated Dttm
```
=IF(LEN(AA) = 0, "", TEXT(AA, "M/D/YY - H:MM AM/PM"))
```
Formats the last-updated timestamp.

---

#### Col AC: Entered By Name
```
=IF(LEN(T) = 0, "", vlookup(T, Profile!B:J, 9, false))
```
Looks up the name of the person who entered the score (from their email).

---

#### Col AD: Updated By Name
```
=IF(LEN(Z) = 0, "", vlookup(Z, Profile!B:J, 9, false))
```
Looks up the name of the person who last updated the score.

---

#### Col AI: Total Over Par
```
=IF(LEN(A) = 0, "",
  if(len(B) + (I) = 0, "",
    if(len(I) > 0, I - K, B)))
```
**Logic:** Gross strokes over par. If gross entered directly: `Gross - Par`. If over-par entry: use Over Par directly.

---

#### Col AJ: Total Over Par (Formatted)
```
=IF(LEN(A) = 0, "",
  if(AI = 0, "E",
    if(AI < 0, AI,
      if(len(AI) > 0, "+" & AI,
        if(len(AI) = 0, "E", AI)))))
```
**Logic:** Formats over-par as "+19", "-2", or "E" for even.

**App equivalent:** `formatGrossScore()` and `formatNetScore()` in `scoring.ts`.

---

#### Col AH: Total Thru
```
=IF(LEN(A) = 0, "",
  if(len(I) > 0, "Thru F",
    if(J = C, "Thru F",
      if(len(C) > 0, "Thru " & C, ""))))
```
**Logic:** Shows round progress. "Thru F" if complete (gross entered or holes played = total holes), "Thru X" if in progress, empty if just a tee time.

---

#### Col AE: Gross (Net) or Tee Time
```
=IF(LEN(A) = 0, "",
  if(len(AH) = 0,
    "Tee Time: " & if(len(W)=0, text(U,"DDD M/D - H:MM AM/PM"), text(W,"DDD M/D - H:MM AM/PM")),
    if(Q > 0,  AJ & "(+" & Q & ") " & AH,
    if(Q = 0,  AJ & "(E) " & AH,
               AJ & "(" & Q & ") " & AH))))
```
**Logic:** Main display string. Shows either "Tee Time: Mon 3/3..." if no score yet, or "+19(+9) Thru F" format: `GrossOverPar(NetOverPar) ThruStatus`.

---

#### Col AF: Gross (Net) or empty
Same as col AE but returns empty string instead of tee time when no score exists.

---

#### Col AG: Tee Time or Empty
```
=IF(LEN(A) = 0, "",
  if(len(AH) = 0,
    if(len(W)=0, text(U,"M/D/YY - H:MM AM/PM"), text(W,"DDD M/D - H:MM AM/PM")),
    ""))
```
Returns tee time string only when no score has been entered yet; empty otherwise. Complement of col AF.

---

#### Col AK: Gross (Actual Scratch)
```
=IF(LEN(A) = 0, "",
  if(len(AH) = 0, "",
    if(O > 0,  AJ & "(+" & O & ") " & AH,
    if(O = 0,  AJ & "(E) " & AH,
               AJ & "(" & O & ") " & AH))))
```
Display string using actual scratch score instead of net. Format: "+19(+21) Thru F".

---

#### Col AL: Gross (Projected Scratch)
Same as col AK but uses Projected Scratch (col P) instead of Actual Scratch (col O).

---

### Progress / Status Columns

#### Col AM: Round Progress
```
=if(len(A)=0, "",
  if(len(I) > 0, 18,
    if(C = "", 0,
      if(J = 9, C*2, C))))
```
**Logic:** Normalizes progress to an 18-hole scale. If gross entered: 18 (complete). For 9-hole courses, doubles the thru count. Used for sorting/progress display.

---

#### Col AW: Thru 0,9,18 (0,1,2,3)
```
=IF(LEN(A) = 0, "",
  if(AX = "", 0,
    if(AX < 1, 0,
      if(AX < 9, 0,
        if(AX < 18, 2,
          if(AX = 18, 3))))))
```
**Logic:** Bucketed progress indicator: 0 = not started/early, 2 = mid-round, 3 = complete. Used for Glide UI filtering/grouping.

---

#### Col AX: Total Thru with Override
```
=if(len(A)=0, "",
  if(len(I) > 0, J,
    if(C = "", "", C)))
```
**Logic:** If gross entered directly, total holes = max holes (complete round). Otherwise, use the thru count. This provides a clean numeric thru value.

---

### Reference Columns

#### Col AN: Event Name
```
=IF(LEN(A) = 0, "", Types!H2)
```
Pulls the current event name from the Types/Controls sheet.

---

#### Col AO: Net Event Points
```
=IF(LEN(A) = 0, "", vlookup(Y, 'Scores + Points'!A:Z, 20, false))
```
Looks up the final net points for this score from the "Scores + Points" sheet (col T = "Initial Net Points with Minimums @ 1"). Note: The points calculation itself happens in Glide computed columns, not in spreadsheet formulas.

---

#### Col AP: Scratch Event Points
```
=IF(LEN(A) = 0, "", vlookup(Y, 'Scores + Points'!A:Z, 24, false))
```
Looks up the final scratch points from "Scores + Points" (col X = "Initial Scratch Points with Minimums @ 1").

---

#### Col AR: Score Image
```
=IFERROR(VLOOKUP(Q, 'Score Images'!A:C, 3, false), "")
```
Looks up a decorative image based on the net score value.

---

#### Col AS: NCRDB
```
=if(len(A)=0, "", "http://ncrdb.usga.org/")
```
Static link to USGA NCRDB lookup.

---

#### Cols AZ-BC: Combined Scores Helper
```
AZ (Golfer):  =IF(LEN(A) = 0, "", A)
BA (Course):  =IF(LEN(A) = 0, "", F)
BB (Thru):    =IF(LEN(A) = 0, "", C)
BC (Score):   =IF(LEN(A) = 0, "", B)
```
Mirror columns used by the "Combined Scores" sheet to merge live Grint scores with app scores for the leaderboard.

---

## Summary: Formula-to-App Parity Checklist

### Currently correct in the app
- Regular event point calculation (`calculateRegularEventPoints`)
- Major event point calculation (`calculateMajorEventPoints`)
- Tie-breaking / point splitting (`splitTiedPoints`)
- Scratch score calculation (`calculateScratchScore`) -- equivalent math
- Gross score formatting (`formatGrossScore`, `formatNetScore`)
- Course data lookups (rating, slope, par, holes)
- **Net score calculation** (`calculateNetScore`): Uses WHS formula `(Index*Slope/113) + (Rating-Par)` with per-season handicap allowance. Verified against 2025 Glide data (41/41 scores match, 0 mismatches).
- **Net even target**: Score detail page shows `PlayingHandicap + Par` for "Score Needed to shoot Net E"
- **Projected gross/net for in-progress rounds**: `calculateProjectedScore` uses playing handicap passed by callers; leaderboard already uses `calculatePlayingHandicap` (correct WHS formula) for projections.
- **Course handicap display**: Score detail page shows unrounded course handicap (with Rating-Par), unrounded playing handicap (with allowance), and rounded playing handicap.

### Historical allowance note
- 2025+ seasons use 95% handicap allowance (stored in `seasons.handicap_allowance`)
- Older seasons (2018-2022) used 100% allowance. The per-season `handicap_allowance` field must be set correctly for each season to produce matching results.

### Not applicable to our app
- Col A (Name resolution) -- handled by auth/user selection
- Cols AE-AG (display strings) -- our UI builds these differently
- Col AM, AW (progress bucketing) -- Glide-specific UI patterns
- Cols AZ-BC (combined scores helper) -- no Grint integration
- Col AR (score images) -- different UI approach
- Col AQ (hide flag) -- not needed

---

## Worked Examples

### Example 1: Devin Blankenship (Event 1, R18)
| Field | Value |
|-------|-------|
| Handicap Index | 8.7 |
| Course | Wicker Point - III |
| Slope | 132 |
| Rating | 71.0 |
| Par | 71 |
| Gross Score | 81 |
| Allowance | 95% |

**Calculation:**
1. Unrounded CH = (8.7 * 132 / 113) + (71.0 - 71) = 10.159 + 0 = **10.159**
2. Playing Handicap = round(0.95 * 10.159) = round(9.651) = **10**
3. Net Over Par = 81 - 10 - 71 = **0 (Even)**
4. Scratch Over Par = round(81 - 71.0) = **10**
5. Score Needed for E = 10 + 71 = **81** (he shot exactly net even)

### Example 2: George Lane (Event 1, R18)
| Field | Value |
|-------|-------|
| Handicap Index | 8.6 |
| Course | Heritage Golf Links - Heritage/Tradition - Blue |
| Slope | 136 |
| Rating | 69.3 |
| Par | 71 |
| Gross Score | 89 |
| Allowance | 95% |

**Calculation:**
1. Unrounded CH = (8.6 * 136 / 113) + (69.3 - 71) = 10.348 + (-1.7) = **8.648**
2. Playing Handicap = round(0.95 * 8.648) = round(8.216) = **8**
3. Net Over Par = 89 - 8 - 71 = **10**
4. Scratch Over Par = round(89 - 69.3) = round(19.7) = **20**

### Example 3: Blake Addleton (Event 1, R18)
| Field | Value |
|-------|-------|
| Handicap Index | 14.6 |
| Course | Rocky Branch GC - Gold |
| Slope | 126 |
| Rating | 71.2 |
| Par | 72 |
| Gross Score | 87 |
| Allowance | 95% |

**Calculation:**
1. Unrounded CH = (14.6 * 126 / 113) + (71.2 - 72) = 16.271 + (-0.8) = **15.471**
2. Playing Handicap = round(0.95 * 15.471) = round(14.697) = **15**
3. Net Over Par = 87 - 15 - 72 = **0 (Even)**
4. Scratch Over Par = round(87 - 71.2) = round(15.8) = **16**
