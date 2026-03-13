- ##Open##

- Tour Stats
  - Turn current page into User tab
  - Add "aggregate" tab
    - Sub-tab for season vs all time?
- Bulk update handicaps in admin mode
- event history should show both people if they both tied for first place,
including the medal image
  - see `docs/tie-breaking-logic.md`
- Playoff auto-seeding -- currently manual. The PRD says seeds come from  
season standings (top 6 regular season), but the admin UI requires manual  
selection. This is a feature gap, not a formula/calculation gap.
- On playoff bracket page, remove consolation and unicorn bracket filter for previous years where it was not filled out. Only show brackets that have data. If retroactively filled out later then show the filter. 
- Handicap history on user profiles should show first 5 with show more/all button 
- When looking at another member, there is a button at very button “show full stats” that takes you to h2h page against them. Should relabel that button
- Bridge Score needs work, currently shows old rounds with the same 2/16/2026 date for everything
  - should only show rounds in current event
  - talk to Robby on how that works if 18hole event but restricts 9hole selection
  - maybe remove?
- Touch target for scores tab at bottom still sometimes hard to tap. Maybe expand touch target and add a few more pixels buffer from bottom
- Use historical score distribution data to consider changes to chirp bucket ranges
  - admin mode feature to modify score bucket ranges?
- Hide tournament more tab, not using this app for tourney for time being bc golf genius preferred
- Schedule page have export calendar link? Make admin configurable
- Schedule page on dark mode - current even highlighting looks off and hard to read inside box

##Fixed pending verification##

- Incremental score update buttons 
- Incorporate 95% scoring math
- Glide Round History "Gross Score" column stores Projected Gross (not Actual Gross) for scores entered via direct gross entry. 
  - 797 scores across 2020-2025 affected. 
  - Correct gross comes from Score Archive "Actual Gross" (col 11) per commissioner.
  - Migration scripts fixed + correction script at scripts/fix-projected-gross-scores.mjs.
  - Applied 2025-03-06: 797 gross scores corrected in DB (666 for 2020-2024, 131 for 2025).
- Import scripts computed net_strokes_over_par using course rating instead of par.
  - 736 scores across 2018-2026 had wrong NOP. 
  - Fix script: scripts/fix-nop-rating-vs-par.mjs.
  - Applied 2025-03-06: all 736 corrected. Import scripts also patched (rating→par).

##Done##

- refactor score/tee times detail page
- some audit logs data have null info that should be populated (fixed: enriched score_edit and score_delete audit log payloads with full metadata — player, course, tee, holes, net scores, tee time, event, before/after format)
- tile discrepency between my profile and other member profiles
  - other member - # rounds, avg net, best net, worst net
  - my profile - # rounds, avg net, best net
- viewing a tee time, would like a way to enter score as over par instead of gross score
- Admin > Feedback inbox truncates title
- Lock handicaps before event
  - users cant update hdcps in-app, all driven by admin, so this is inherently locked?
- Share button on home screen (replaces notification bell). Uses Web Share API with clipboard fallback.
- Need a way to switch to different course/tees on a previously entered round/tee time
- tee times not showing how many holes, just " holes"
- need to make it so if its an 18 hole event, only 18 hole courses can be selected
- I'm on the west coast right now, submitted that tee time in app as 1p tee time
and it converted it to 8p
- handicap history on profile show date inputted, since we'll have 2
or more handicap updates per month for 2 events per month
- a way to copy a tee time or a round and link a diff member. As commish, I'm typically creating the scores for a 4some, way easier than doing it 4 times incl course lookup. 
  - DONE - Copy to Members feature added (post-submit flow + score detail page)
- Deleted score still appears on leaderboard with 1 point (Robby Dewling, 2026 S1E1).
  - SWR leaderboard cache was not invalidated on score delete/edit/create.
  - Also: delete silently succeeded when RLS blocked it (0 rows, no error).
  - Fix: invalidate SWR 'leaderboard' cache on all score mutations + verify delete returned rows.

##Won't Do##