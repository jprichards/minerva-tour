# Minerva Tour App

**How to use this PRD:** This document is the single source of truth for **what** the app must do—features, user roles, business rules, and data requirements. It is written for a **fresh start**: no assumption about existing code or UI. **Design and implementation choices** (layout, visual style, navigation pattern, component structure, tech stack within the recommendations) are left to the builder. Prefer clear requirements over prescriptive UI; allow creative freedom where it doesn’t conflict with the rules below.

---

**Overview**

This app is the hub for members of The Minerva Tour Golf Club (MGC). In this app, members can submit scores, view the leaderboards, view the season schedule, view stats, view scores from previous events. For members who are admins, they can configure what the members can see and do, change the mode from regular season to playoffs or special tournaments, adjust settings, view logs and audit for debugging.

The first major version of this app will be a website that is meant to be used on mobile devices (iOS and Android). Users will save the website to their home screen to use like a progressive web app. In a future phase, after most functionality is completed and validated working, we will also create a native version of the app for iOS and Android.

## **Context about the Minerva Golf Club:**

### **Format:**

- During the Regular Season, there is a tour event window every two weeks in which each player may submit as many scores as they would like. The best net score will be counted toward the event, the remaining scores will be discarded.
- The Regular Season has 9 event windows
- Each two week event window begins on a Monday morning and ends on Sunday night.
- Each event is for either 9, 18, or 36 holes. 18 hole rounds may be split into two 9 hole rounds to fit the event format. See the “Schedule” tab for the full season event schedule (you can add it to your own calendar too)
- Players accumulate points for results in each event similar to the Fedex Cup on the PGA tour. Certain events are classified as majors and are worth more points. See the “Scoring” section below for more details

### **General Rules and Guidelines:**

- The tour complies with all USGA “Rules of Golf” (found at [https://www.usga.org/content/dam/usga/pdf/2015/2016 Rules/2016-rulesofgolf-USGAfinal.pdf](https://www.usga.org/content/dam/usga/pdf/2015/2016%20Rules/2016-rulesofgolf-USGAfinal.pdf)) , unless otherwise noted above, and with all rule changes for the 2019 PGA Tour season (found at [http://www.usga.org/rules-hub/rules-modernization/text/major-proposed-changes.html](http://www.usga.org/rules-hub/rules-modernization/text/major-proposed-changes.html))
- Notable updates to the 2019 USGA rules include:
  - No penalty for striking the flag stick with a putt
  - No penalty for repairing spike marks on the putting line
  - No penalty for accidentally moving your ball.
- A quadruple bogey is the maximum score a player can score on any hole
- The score posting process is available [here](https://minervatour.wordpress.com/rules/posting-scores/)
- Event weeks begin on Monday morning and end on Sunday night (unless the deadline is extended due to weather or group consensus).
- All scores are due by 11:59 PM on Sunday the week of the official tour event
- “Remote” scores are allowed. Rounds do not need to be played on the same course to be eligible.
- Scores should be submitted on the same day in which they are played
- Scores must be shot during the event window to be eligible**.**
  - Note: A provision is available to players who live in a location where golf cannot be played at the beginning of the Minerva Tour season. The first two events are eligible for retroactive scores to be posted by these players but the events must be made up by the end of event 4. The best score posted in each event window applies to the current event, subsequent posted scores are applied as makeup rounds to the first two events.
- If you are able, you may play multiple rounds during a single event week and submit all of your scores. Your best net score will be selected and applied to the active event. There is no limit to the number of rounds you can play in a single event week.
- Playing multiple balls during a single round and submitting each ball as a separate score is not allowed.
- The maximum scored allowed per hole in a match play event (for example Bobby Jones Cup) is a net quad. This means, a player may not pick up their ball, say they made a gross quad and receive handicap strokes on top of this score. The player must play the ball out to a maximum of net quadruple bogey.
- Major and Playoff events are 18 holes (final event is 36 holes). 9 hole scores may not be combined to form an 18 hole score in these events.
- Regular 18 hole events allow for 9 hole scores to be combined to form an 18 hole score. However, 18 hole scores may not be divided and combined with another outstanding 9 hole score (termed “splicing”). 9 hole scores are automatically combined with the next 9 hole score within the event window even if it is not the “next golf played” (same procedure as GHIN handicap process, allowing for “bridging” across one or multiple 18 hole rounds).

### **Handicapping:**

- The tour follows all best practices set by the USGA for maintaining handicaps. This is done automatically through GHIN . More details on the USGA handicapping process is available here: [http://www.usga.org/content/usga/home-page/Handicapping/handicap-manual.html#!rule-14389](http://www.usga.org/content/usga/home-page/Handicapping/handicap-manual.html#!rule-14389)
- A USGA compliant handicap is required to post an official score to the Minerva Tour (at least 54 holes must be played).
- The maximum handicap is 54
- **Handicap locking per event**: Event scores are handicapped based on the player’s official GHIN handicap at the time of the first day of the event. The handicap is locked for the entire event window — all scores submitted within that event use the same locked handicap, regardless of any changes that may occur during the event. Admins import the latest GHIN handicaps between events (typically the evening before or morning of the next event), at which point the new handicap takes effect for that next event only. The `handicap_index_used` field on each score stores the handicap that was in effect at the time of scoring.
- Official handicaps through GHIN are used for Minerva Tour event scoring.

### **Format & Rules**

Local Minerva Tour Rules and Guidelines

- Max hole score - The max score on any hole is **gross quadruple bogey**
- Gimmies - **No gimmies** allowed, players must putt everything out
- Major course/tee requirement - **Major and Playoff events** must be played from course/tee **rated 68 or higher and may not be comprised of combined 9 hole scores**
- Out of Bounds + Lost Ball -
    Two additional options are available in case of a lost ball or out of bounds:
  1. Player must return to the place of the previous shot under one penalty stroke.
  2. Player may take a drop within 2 club lengths of the position of the lost ball or where the ball went out of bounds under penalty of **2 strokes.**
  3. Player may take a drop 2 club lengths inside the nearest fairway edge, no closer to the hole than where the ball was lost or where the ball went out of bounds under penalty of **2 strokes.**
- Lost Ball Relief - In the event a ball has been lost and if you are **virtually certain** that your ball is lost in standard rough or fairway grass **on the hole you are playing**, you may elect to take a free drop in the area where your ball is estimated to have come to rest. The spirit of this rule is to provide relief in situations where a ball should be find-able (such as in light rough or embedded in the fairway), but it inexplicably cannot be found.
    **Using this rule requires mandatory reporting to the membership with photo evidence and explanation of circumstances.**
    This rule does not apply if the ball is expected to be in the following areas:
  - Heavy rough which is longer than the course’s standard rough length (i.e. tall rough between holes at Lawsonia
  - Ivy covered areas
  - Hazards (marked by red or yellow stakes)
  - Bunkers
  - Out of bounds areas
  - Bushes or low brush
  - Drainage ditch
  - Pinestraw
- Scoring -
  - Course handicap calculations as applied to Net score are **rounded to the nearest stroke**
  - Net scores are rounded to the **nearest stroke**
  - In case of a tie in an event, points are split evenly between the tied players and rounded to the **nearest tenth of a point**

### **Scoring**:

- Scoring for each tour event will be done with a standard handicapped stroke play format. To calculate a net score normalized for course difficulty and player ability, the WHS (World Handicap System) Playing Handicap formula is used:
  1. **Playing Handicap** = `round((Handicap Index × Slope / 113 + (Course Rating − Par)) × Handicap Allowance)`
  2. **Net Strokes Over Par** = `Gross Score − Playing Handicap − Par` (rounded to nearest stroke)
  - Each player is assigned a Playing Handicap based on their handicap index, the course they are playing (slope, rating, par), and the season’s handicap allowance percentage.
  - The Playing Handicap is subtracted from the gross score, then Par is subtracted to get “Net Strokes Over Par”.
  - The `(Course Rating − Par)` term adjusts for courses where rating differs from par (e.g., a par 72 course rated 69.3 reduces the handicap strokes given). The allowance percentage is applied to the entire unrounded value before a single final rounding.
  - The player with the lowest “Net Strokes Over Par” is the winner.
- **9-Hole Handicap Adjustment**: For 9-hole events/courses, the handicap index is halved and rounded to one decimal place before applying the WHS formula. This matches the Glide app’s use of a separate 9-hole handicap column (which was HI / 2, rounded to 1 decimal):
  1. **9-Hole HI** = `round(Handicap Index / 2, 1 decimal)`
  2. **Playing Handicap** = `round((9-Hole HI × Slope / 113 + (Rating − Par)) × Handicap Allowance)`
  - The app stores only the 18-hole GHIN index (`users.handicap_index`). The halving is applied automatically in `effectiveHandicapIndex()` when the course type is 9-hole.
- **Handicap Allowance**: A configurable percentage applied to each player’s course handicap for net scoring purposes, set per season on the Admin > Seasons page. This follows USGA/WHS “handicap allowance” terminology.
  - The full formula: `Playing Handicap = round((Index × Slope / 113 + (Rating − Par)) × allowance / 100)`
  - Default: 100% (full handicap). Starting in 2024, the league adopted a 95% handicap allowance to better balance competition between low and high handicap players.
  - Pre-2024 seasons: 100%. 2024 onward: 95%. New seasons default to 95%.
  - When a season’s handicap allowance is changed, all net scores for that season should be recalculated.
  - Valid range: 1-100%.
  - See `[docs/GLIDE_FORMULA_REFERENCE.md](GLIDE_FORMULA_REFERENCE.md)` for detailed formula breakdowns, worked examples, and parity checklist.
- Note: Ranking by “Net Strokes Over Par” allows us to play on courses with variations in yardage/course par (i.e. executive courses with par 62, par 70, par 72, etc.)
- Regular Season scoring on the the Minerva Tour is done as follows
  - The winner of **9 hole events** and **non-major 18 hole events** receives 1 point for each player who plays in the event. Subsequent places receive one less point per place. For example, if 3 people play in a 9 hole event, first place wins 3 points, second place 2 points, and third place 1 point
  - **Majors (18 holes)** are assigned higher point values. Winners receive **1.33** points per participant or 10, whichever is greater. Subsequent places will receive points as indicated below:
    - Place - Point Payout
      - 1st - Max of (# of participants * 1.33) or (10)
      - 2nd - 1st place minus 3
      - 3rd - 2nd place minus 2
      - 4th - 3rd place minus 1
      - 5th - 4th place minus 1
      - 6th - 5th place minus 1
      - 7th and beyond - 1 less per place (minimum of 1 point)
    - For example, if 7 participants play, below are the payouts (1st place receives minimum of 10 points)
      - Place - Points
        - 1st - 10
        - 2nd - 7
        - 3rd - 5
        - 4th - 4
        - 5th - 3
        - 6th - 2
        - 7th - 1
    - If 15 participants play, below are the payouts (First place receives 15 * 1.33 rounded to the nearest tenth of a point)
      - **Place - Points**
        - 1st- 20
        - 2nd - 17
        - 3rd - 15
        - 4th - 14
        - 5th - 13
        - 6th- 12
        - 7th - 11
        - 8th through 15th - 1 less per place (minimum of 1 point)

**Playoffs:**

The final 3 events of the season make up the Minerva Tour playoffs. Seeding for the playoffs are determined by the first 9 events which make up the regular season. The top 6 members of the regular season qualify for the championship flight of the head-to-head playoff. The top 2 seeds receive a first round bye, however they will compete against each other for the right to select their round 2 opponent. Seed #2 will play seed #6 and seed #4 plays #5 in the first round.

The format for each playoff round, by default, is net stroke play where the best net score posted by each player during the event is used. If players are able to compete in person, they may agree to play a different format such as handicapped match play or any other mutually agreed upon format. If competitors cannot physically play together or cannot agree on a format, the match will revert to the default “best net” stroke play.

Consolation flights will be organized for players who finish outside of the top 6 in the regular season. You must play in at least 1 regular season event to qualify for the playoffs.

Note: The championship match is 36 holes. All other playoff rounds are 18 holes.

**Results:**

Tour Champion:

- The winner of the Minerva Tour is the winner of the championship match in the championship playoff flight. The winner will have their name engraved on the Minerva Tour Trophy which is passed from champion to champion each year. The winner also receives a Purple Jacket and a cash prize.

Scratch Champion:

- The scratch champion is the player who scores the most points throughout the season without handicap assistance. Scores in the scratch competition are calculated as if every member is a 0.0 handicap. Event points are awarded in the same manner as for the net competition. The scratch competition runs for the entire length of the season (including playoff events). Major events (including the Championship) have elevated point payouts; an event's major status is determined solely by the `is_major` flag on the event record in the database.
- **Scratch scoring formula**: Scratch Strokes Over Rating = Gross Score − ROUND(Rating − Par) − Par. This is the same structure as net scoring but with a 0.0 handicap index (Scratch CH = ROUND(Rating − Par)), ensuring scratch scores are normalized across courses of different difficulty. Uses spreadsheet-style rounding (half away from zero) to match Glide.
- **Scratch standings**: Accumulate scratch points across ALL events in the season (regular + playoff). The leaderboard should show scratch standings alongside net standings.

Unicorn:

- The player who loses the Unicorn flight of the playoffs will be crowned as the “Unicorn”. In this flight, the bottom players from the regular season standings who have played at least one event play head-to-head. The loser of each round advances to the next round (reverse bracket). Even in a matchup where one player posts a score and the other DNPs, the DNP player advances. The last two seeds (highest seed numbers) in the Unicorn flight receive a first-round bye. The player who finishes in the unicorn position must use the pink unicorn headcover for one year (throughout the following Minerva Tour season).

**Tie Breakers:**

Tour Champion:

- The champion of the Minerva Tour will be decided by the winner of the final match of the championship playoff flight.
- If two players are tied after the final match and the two players are geographically located in the same location, they may agree to play an 18 hole handicapped match play round at a mutually agreed upon course. If the two players are unable to meet in person, the additional playoff event will be 18 holes of handicapped stroke play with the net winner being crowned champion (best net score is used).
- If two or more players are still tied and are playing at the same location, the match continues to sudden death extra hole play. If players are not playing at the same location, an additional 18 hole event is required.

Playoff Qualification and Seeding

- If two or more players are tied in the standings after the final regular season event, the tie breaker in all circumstances goes to the player with the lower handicap during the final regular season event. For example after the final regular season event, a 10 handicap and a 16 handicap are tied for 6th place on the season, the 10 handicap would qualify for the championship flight of the playoffs as a 6 seed.
- The above also applies for all tiebreakers to determine playoff seeding.
- If the tie is still not broken by handicap, the next tie breaker is the number of events competed in on the season
- The next tie breaker is the total number of scores posted on the season.
- Finally, the tie will be broken with a coin flip if none of the above breaks the tie.

Playoff Advancement:

- The tiebreaker for playoff advancement to the next round is the player’s playoff seed (applies to advancement from the first to the second and second to championship playoff events). The player with the better seed wins the tie (3 seed wins tiebreaker over a 6 seed)
  - Note: The players in the match may mutually agree to settle the tie in a different manner (i.e. sudden death holes, additional round, etc.) but the tie must be resolved by the end of the event window otherwise the standard tiebreaker mentioned above will apply)

Unicorn:

- The tie breaker for the recipient of the “Unicorn” award will first be the player with the worse seed.

## **User Personas of the app:**

- Administrator - the commissioner of the Minerva Golf Club (as well as the developer of this app). They run the operations of the league, setting up the season events, tournaments, and playoffs. They will need to be able to control what users see in the app, control the data associated with each user (such as scores), and be able to see logging and audit events for troubleshooting from within the app itself (often the admin will need to troubleshoot a member’s issue from their phone while on the golf course, and won’t have access to a computer at the time)
- Member - the primary user of the app. In this app the primary uses will be to log scores, create/add courses to log their scores against, view leaderboards and scores of other members, view stats of their own or across the membership.
- Playing Guest - this is a special user account for users who are not members of MGC, but are playing in the Member-Guest tournament. They will need the ability to input scores while in tournament mode (set to Member-Guest). They can view leaderboards, other users, stats, etc, but after the tournament is over, their view of the app should switch to be like that of a non-playing Guest user.
- Non-Playing Guest - this user can view current scores and leaderboards, but cannot make any changes to anything within the app. It is view only.

## **App Major Requirements:**

### **Meta:**

- **4 user modes** - Administrator, Member, Playing Guest, Non-Playing Guest
- Administrators, Members, and Playing Guests must use email to signin. Email will be how user accounts are tracked and managed. Non-Playing Guests do not need to sign-in and will get a limited, read only, view of the app. Users signing in can either Sign In With Google, or get a one-time code emailed to them to enter in. If a user signs in with an email that is not explicitly provisioned in the system as an Administrator, Member, or Playing Guest, then they should be treated as a Non Playing Guest.
- **App Access**: Non-Playing Guests can access the app via URL shared by members. When they visit, they get a very limited, read-only view.
- Administrators can switch between member and admin modes within the app. Being in Admin mode allows them to switch the mode of the app between off-season, regular season, and playoffs. They can also turn on Tournament mode, which can happen at any time during off-season, regular season, or playoffs. Administrators should be able to see all user accounts, modify roles (admin, member, playing guest, non playing guest), provision users (by email address) who have not signed-in yet, and delete users. Administrators should be able to set the schedule for each tour event window.
- All data about the club, users, seasons, playoffs, scores, courses, tournament data, stats, etc should be stored in a database that an administrator can access/view and, if needed, modify from within the app while in admin mode. Admins need the ability to view and edit specific tables/data (not full SQL query access, as admins will almost always be viewing from their phone).
- **Audit Trail & Logging**: Store actions and events so an administrator can view and search them in the app (e.g. while troubleshooting on a phone). Track every material action (logins, score submissions and edits, course add/edit/delete, etc.) with: who did it, what type of action, what entity was affected, and structured details (for edits: before/after; for add/delete: relevant data). Support filtering by type and time, and make logs easy to scan on a mobile device.
- **Offline Support**: App must work offline to save scores locally and sync when connection returns (in case someone loses service while on the golf course).
- **Data Retention**: All data should be stored in a place that comes with data retention and availability out of the box. Historical data should be retained indefinitely (all previous seasons).

### **UI/Navigation Structure:**

The app is mobile-first (used on phones, often outdoors). Layout and visual design are up to the builder; the following describe **what** needs to be reachable, not exactly how.

**Areas the app must expose (structure by role and mode as needed):**

- **Home** — Default landing for signed-in users: current event status, user’s position, quick actions to start a round or add a tee time, and links to standings, rules, photos (external), and schedule.
- **Scores** — Entry point for score submission and tee times; access to course list for selecting where the round is played.
- **Leaderboard** — Current event and season standings; ability to switch between current-event view and season view, and between Net and Scratch standings.
- **Courses** — List of courses (with search) and course detail; from a course, users can edit, add another tee, or start a round / add tee time.
- **Event History** — Past events and results.
- **Tour Stats** — Stats views (see Stats section).
- **Members** — List of members (as appropriate for role).
- **Admin** — Visible only to administrators: mode switching, user management, schedule, data/audit, etc.
- **User profile** — Own profile: picture, name, email, current handicap; ability to change profile picture (upload from device, photo library, or camera). Profile pictures should be available where it’s useful (e.g. profile, leaderboards, tee time views). Each member has a profile page showing stats, scores, and handicap history.

### **Member:**

**Course Management:**

- Members can view and add golf courses. To submit a score, they choose the course and tee from the list. To add a course, require: Course Name, Tee Name, Type (18 Holes, 9 Holes, Front 9, or Back 9), Rating, Slope, Par. Provide a link to [https://ncrdb.usga.org](https://ncrdb.usga.org) so users can look up course data. A course can be added multiple times (once per tee); rating and par vary by tee and by 9 vs 18 holes.
- **Course detail**: From the list, users can open a read-only detail view with all course info, and from there: enter edit mode, add another tee for the same course (course name pre-filled and locked), or start a round / add a tee time.
- **Add another tee**: When adding a tee for an existing course, only tee name, type, rating, slope, and par are required.
- **Editing**: Any member can edit any course (honor system; no admin approval). Editing is done from the course detail view, not by inline edit on the list.
- **Deletion**: Only administrators can delete courses.
- **Duplicate prevention**: Block saving when the exact same combination (course name, tee, type, rating, slope, par) already exists. Allow slight variants (e.g. different rating) so multiple entries for the same course with different data are possible.
- **Audit**: Record who added and who last edited each course, and show that on the course detail (e.g. “Added by … on …”, “Last edited by … on …”).

**Score Submission:**

- During the regular season, users submit scores during or after their round. From the Scores area, they choose a course and tee (full course list with search/browse; if the course isn’t listed, they can add it). They can choose “Me” or “Other Member” (with a searchable way to pick another member) set a round date (defaults to today, always saved), optionally set a tee time of day, and/or enter gross score. The round date and tee time are split into separate inputs: the date field (required, defaults to today) and the time field (optional). When no time is provided, only the date is stored and displayed. Saving with only a date (and no score) creates an incomplete round they can finish later.
- **Tee times**: Users can create multiple future tee times (incomplete rounds). Show incomplete tee times in a dedicated area: course name, tee, type, player, tee time date/time; sort by date with the current user’s tee times first; support search/filter. Tapping a tee time opens a screen where they can enter or update score (gross score to par or gross score, and holes played). Once a score is entered, the round counts as complete and moves out of “tee times” into completed rounds. Users can change the course/tee on an existing tee time or round from the detail screen (via a "Change" button in edit mode) with a searchable course picker filtered by the current event’s hole count.
- **Quick Score (tap-to-increment)**: The tee time detail page shows a "Quick Score" panel for editable, in-progress tee times. It displays the current gross score to par with large -/+ buttons to increment or decrement, and the current hole thru with left/right arrow buttons. Each tap updates the UI immediately; the DB save is debounced (~800ms) so the leaderboard stays near-real-time. Slack notifications are debounced with a longer delay (~15s) so rapid taps produce a single notification. A summary line below the panel shows calculated gross, net, and thru. The existing Edit flow (text-field entry for gross score or gross-to-par) remains available via the pencil icon for members who prefer typing.
- **Score entry**: Support entering gross score (or gross score to par) and holes played. Holes played can be 1 through the course maximum (9, 18, or 36) to support partial rounds. Allow updating the score as the round progresses. Net score must be calculated by the app (members do not enter course handicap):
  - **Playing Handicap**: `round((Handicap Index × Slope / 113 + (Rating − Par)) × Handicap Allowance)`. The raw course handicap `(Index × Slope / 113)` is an intermediate value; the Playing Handicap incorporates `(Rating − Par)` and the season’s handicap allowance before a single final rounding.
  - **Partial rounds**: Use proportional Playing Handicap and par: Partial Playing Handicap = Full Playing Handicap × (Holes Played / Max Holes), rounded; Partial Par = Full Par × (Holes Played / Max Holes), rounded; then Gross = Partial Par + (gross to par), Net = Gross − Partial Playing Handicap, Net to Par = Net − Partial Par.
  - **Complete rounds**: Net = Gross − Playing Handicap, Net to Par = Net − Par (rounded to nearest stroke).
  - Show gross and net to par and holes played where relevant (e.g. on tee time detail and completed rounds).
  - **Unrounded course handicap**: Display the raw decimal `(Handicap Index × Slope / 113) + (Rating − Par)` alongside the rounded Playing Handicap on tee time detail, round detail, and score submission pages.
  - **Net E target**: Display the gross score needed to shoot net even, calculated as `Playing Handicap + Par`, shown with its to-par value (e.g. “90 (+18)”). Shown on tee time detail, round detail, and score submission pages.
- **Editing/deleting**: Members can edit or delete only scores in the current event window. Past events are locked; admins can correct those.
- **Other member**: Members can submit and update scores on behalf of other members (with a clear way to select who is playing).
- **Copy to members**: After creating a tee time (or round), users can copy it to one or more other members without re-selecting the course. Two entry points: (1) a post-submit success screen with a multi-select member picker, and (2) a "Copy to Members" button on the tee time / round detail page. Copies always create tee-time-only records (course, tee time, event — no score). Duplicate detection prevents creating a second tee time for the same member/course/event combination.
- **Completed rounds**: List completed rounds (e.g. grouped by person, best net first). Include course, tee, holes, gross, net; support search/filter.
- **Scores page filters**: The Scores page has Completed and Tee Times tabs sharing a single set of filters (year, event, My Rounds, search). The year defaults to the current season; the event defaults to the current event (if one exists), otherwise "All Events". Switching between tabs retains all filter values. If the selected event doesn't exist in the other tab's data, the filter gracefully falls back to "All Events" for display while preserving the selection for when the user returns to the original tab.
- **Score corrections**: Admins can correct scores (including wrong course data) and edit locked (past event) scores.
- **Validation**: Honor system—no strict validation on score values.
- **Live scoring**: Leaderboard and scores should update as new scores are posted (real-time or refresh).
- **Partial rounds in leaderboard**: In-progress rounds are projected to a full-round equivalent using the pace-based projection formula: `Projected Gross = round(OverPar + (PlayingHandicap / TotalHoles) * RemainingHoles + Par)`, then `Projected NOP = round(ProjectedGross - PlayingHandicap) - Par`. The projected NOP (not the partial-round NOP) is used for leaderboard ranking and projected points during an event. If a partial round is not completed by event end, it doesn’t count for points.
- **9-hole bridging**: For regular 18-hole events only (not majors/playoffs), members manually combine two 9-hole scores to form an 18-hole score; no splicing (splitting an 18-hole score to combine with another 9).
- **Course handicap**: Calculated from member’s handicap index; never entered manually by the member.

**Leaderboards:**

- All users that have started a round, or completed a round should have their scores displayed on a leaderboard for the current season event with the projected points payout if scores stay the same. As users add more scores, the leader board should dynamically update based on projected points payouts.
- There should also be a season wide leaderboard for both Net and Scratch champion. When viewing the leaderboard, the user should be able to toggle between the current event leaderboards or the season standing leaderboards.

**Stats:**

- Members can view detailed stats for themselves and other members, including:
  - Average net score
  - Best/worst rounds
  - Courses played most
  - Scoring trends over time
  - Head-to-head records (me vs. another member)
  - Compare any two members head-to-head (via Tour Stats page picker, navigates to `/stats/{player2}?vs={player1}`)
- Stats should be viewable for both current season and previous seasons.

**Schedule:**

- Display schedule in both calendar view and list view.

**Handicap:**

- **Phase 1 (MVP)**: Admin manually updates member handicaps.
- **Phase 2 (Future)**: Direct GHIN integration to automatically pull handicaps.
  - **Note**: GHIN does not provide a public API. Integration requires:
    - Contacting state/regional golf association for official API access
    - OR becoming a GHIN-licensed vendor/partner
    - OR using unofficial wrappers (with terms of service risks)
  - See `GHIN_INTEGRATION.md` in this folder for detailed information
- App should track handicap history over time for each member.
- Handicaps are locked at the start of each event window. All scores submitted during an event use the handicap that was in effect when the event began. The locked value is stored in each score record as `handicap_index_used`. Admins import updated handicaps from GHIN between events (evening before or morning of the next event). (If GHIN integration is implemented, it would automatically capture from GHIN).
- Users can add/edit their GHIN number in their profile (if not pre-provisioned by admin).

### **Playing Guest:**

- Playing Guests participate in specific tournaments (primarily Member-Guest tournament).
- **Limitations**: Cannot add courses or participate in regular season events.
- **Permissions**: Can view historical data, member stats, and tournament-related info.
- **Status Management**: When admin completes a tournament, Playing Guests should automatically revert to Non-Playing Guest status. However, some Playing Guests return for multiple tournaments, so the system should allow them to switch back and forth based on which tournaments they are participating in.

### **Non-Playing Guest:**

- View-only access to current scores and leaderboards.
- Cannot make any changes within the app.
- No sign-in required.

### **Administrator:**

**User Management:**

- View all user accounts and modify roles (admin, member, playing guest, non-playing guest).
- **User provisioning**: Admins can provision users by email before they sign in. When a user signs in for the first time, the app assigns the provisioned role; if not provisioned, default to non-playing guest. Admins need to: add provisions (email + role), view all provisions and see who has signed in vs pending, edit or delete provisions before sign-in, and update roles for already-provisioned users. Bulk import (e.g. paste list of emails or CSV) is desirable.
- Delete users.

**Season/Mode Management:**

- Switch app mode between off-season, regular season, playoffs, and tournament mode.
- Set and modify the schedule for each tour event window.
- Extend event windows for weather/emergency situations by modifying the schedule.
- Configure per-season handicap allowance percentage (1-100%) for net scoring. See Handicap Allowance under Scoring for details.

**Playoff Management:**

- Admin manually sets playoff bracket matchups and advancement.
- Admin can inline-edit existing matchups to change Player 1, Player 2, and Winner via dropdown selectors, enabling retroactive entry of historical bracket data.
- For the "top 2 seeds compete for right to select round 2 opponent" scenario, the admin manually selects the opponent after it is determined outside of the app (via Slack, text message, etc.).
- Playoff coordination and communication between matched players happens externally (not in the app).

**Data Management:**

- Correct member scores (especially scores from previous locked events).
- Manually enter retroactive scores for members in unplayable climates (for first 2 events, must be made up by end of event 4).
- View and edit database tables directly from the app.

**Reporting & Troubleshooting:**

- Access audit logs from within the app with filtering, search, and sort by type and time; view structured event data.

### **Tournament Mode:**

- Tournaments can occur during off-season, regular season, or after playoffs.
- Main tournaments: **Member-Guest** (typically first half of regular season) and **Bobby Jones Cup** (end of regular season, after playoffs).
- Tournaments may have different scoring rules, leaderboards, and team formats from regular events.
- Tournament results are visible in a dedicated tournament area when admin has tournament mode enabled.
- Some tournaments are one-off events with just a few participants.

**Tournament Format Details (TO BE DEFINED):**

- Member-Guest tournament format: team-based? Scoring method (best ball, alternate shot, combined)?
- Bobby Jones Cup format details: match play brackets? Team format?
- What settings does admin need to configure when creating a tournament? (format, scoring rules, eligibility, point values, pairings/teams?)
- Should tournament pairings/teams be randomly assigned, manually set by admin, or member-selected?

**Playoff Bracket Display:**

- Show the playoff bracket in a clear visual format (e.g. ladder or tree) so matchups and advancement are easy to follow.

### **Off-Season Mode:**

- Members can only view historical data (no score submissions, even for practice rounds).
- No leaderboards or stats tracking during off-season.
- Read-only mode for members.

### **Notifications:**

- Both push notifications and in-app notifications.
- **Priority**: Event window open/close notifications and reminders for members who haven't submitted scores are nice-to-have features to add after major functionality is complete.

### **Data Export & Backup (Nice-to-Have, Not High Priority):**

- Export capabilities: season results to CSV/PDF, leaderboard snapshots.
- Data backup/restore functionality accessible to admins.

### **Security & Permissions:**

- No rate limiting needed on score submissions.
- No special protection against data tampering - all members and users are trusted friends with 0% chance of malicious behavior.

### **Chirps (Automated Score Commentary):**

- When a qualifying score notification is sent to Slack, the app can attach an automated "chirp" — a humorous, personalized commentary based on the player's performance. **Chirps appear only in Slack** (as part of score-related Slack messages). They are **not** shown on score cards, leaderboards, or elsewhere in the app.
- **Chirp trigger configuration** (`app_settings` key `chirp_config`): Controls when chirps may fire — **round complete only** (default), matching legacy behavior, or **all score updates** (in-progress and completed rounds). Slack still respects per-event-type toggles in `slack_config`; chirp trigger config only gates whether a chirp line is included on applicable score notifications.
- **Chirp buckets** are based on net strokes over par: -5 or better (legendary — mega hype), -4 to -1 (excellent — positive), E to +1 (neutral — decent/positive-leaning), +2 to +4 (mediocre — **no chirp fired**), +5 to +8 (rough — light roast), +9 or worse (bad — fully roasted). The mediocre range intentionally has no chirp — Slack notifications still fire but without a chirp line. Ranges were calibrated from historical score distribution and refined based on league member feedback.
- Templates use `$first_name` as a placeholder which is substituted with the player's first name.
- **Selection model (feature flag `chirps-queue`):**
  - **Flag off (default):** Behavior is unchanged from the original implementation — each bucket has multiple chirp templates; when a chirp fires, a **random** template is chosen from the matching bucket's pool.
  - **Flag on:** Each bucket uses an **ordered queue**. Chirps are **consumed one at a time** in queue order. Used chirps are **archived** (not deleted). **AI auto-replenishment** keeps approximately **10** active queued chirps per bucket (driven by **`chirp_ai_config`** in `app_settings`, separate from `chirp_config`). Members can **reorder** queued chirps (move up/down), **add manual** chirps to the queue, and **revive** items from the archive. An **Initialize Queue** button supports first-time setup (populate queues from existing templates).
- Chirps add personality and social engagement in Slack, inspired by the original Glide app's chirps feature.
- Chirps are purely entertainment — they have no effect on scoring or standings.
- **Chirp Management (Implemented):**
  - All members can add new chirp templates to any performance bucket via `/chirps`.
  - All members can edit existing chirp templates (inline editing).
  - All members can delete chirp templates (with confirmation).
  - Management page accessible from the More menu and Admin dashboard.
  - 6 bucket accordions show chirp counts and templates with add/edit/delete controls. The mediocre bucket shows a "No chirp" indicator and does not support queue management or AI generation.
  - `$first_name` placeholder hint shown on the page.
  - **Admin bucket range editor**: Admins see a collapsible "Score Range Configuration" section at the top of the chirps page to adjust the net score thresholds for each bucket. Ranges are validated (must be strictly increasing) and stored in `app_settings` under key `chirp_bucket_ranges`. A reset-to-defaults button is available. Labels throughout the page update dynamically to reflect configured ranges.
  - Changes take effect immediately for future score submissions and Slack notifications.
  - Stored in the `chirp_templates` database table with RLS policies for authenticated members.
  - Hardcoded templates in `src/lib/chirps.ts` serve as fallback when DB is unavailable and as seed data source.
  - Seed script (`scripts/seed-chirps.mjs`) imports existing hardcoded templates into the database.
  - The Slack notify route (server-side) resolves chirps from DB-backed templates (random pool or queue, per flag) with automatic fallback to hardcoded templates when needed.

### **Betting/Wagering (Deferred — Future Phase):**

- The original Glide app included a betting feature where members could propose bets (with moneyline odds, max wagers, expiration dates) and other members could accept them. This feature is deferred to a future phase.
- When implemented, it should include: bet creation with description and odds, bet acceptance, bet resolution tracking, and integration with Venmo handles for settlement.

### **Error Handling & User Experience:**

- **Lost Connection During Score Submission**: Use offline-first approach - save locally and sync when connection returns. Show clear sync status indicator.
- **Confirmation Messages**: Display confirmation toasts/messages after key actions (score submitted, course added, tee time saved, etc.) to provide user feedback.
- **Error Messages**: Show friendly, actionable error messages when something goes wrong (e.g., "Unable to save score. Check your connection and try again.").

### **Google Photos Integration:**

- **MVP**: External link to Google album (admin can set URL).
- **Future Enhancement**: Admin can import photos from Google album URL to display within the app itself.

### **Rules Display:**

- **MVP**: Link out to WordPress site.
- **Future Enhancement**: Display rules inline within the app.

### **Tech Stack Recommendations:**

Since this will be AI-coded and you want to prioritize ease of use for administrators and ease of troubleshooting:

- **Recommended Approach**: Use modern, well-documented frameworks with strong AI coding tool support
- **Backend**: Firebase or Supabase (both have excellent documentation, built-in auth, real-time sync, and are AI-friendly)
- **Database**: Use the default database that comes with Firebase/Supabase (Firestore or PostgreSQL respectively) for simplicity
- **Frontend**: Next.js with React (most popular, best AI coding support, built-in PWA capabilities)
- **Rationale**: These are the most "AI-codeable" stacks with extensive documentation, examples, and community support. They handle offline sync, auth, and real-time updates out of the box, reducing custom code needed.

### **Complete Cost Breakdown:**

**AI Coding Tool** (choose one):

- **Cursor**: $20/month - Best option for this project
- **[Bolt.new](http://Bolt.new)**: $25/month
- **Claude Pro** (with manual setup): $20/month
- **Free alternatives**: Replit (limited free tier), v0 (limited free tier)

**Backend & Database** (choose one):

**Option 1: Supabase (RECOMMENDED)**

- **Free tier**: Up to 500MB database, 50K monthly active users, 2GB bandwidth
- **This is plenty for your golf league** (likely 10-50 members)
- **Cost**: $0/month (free tier will cover you)
- **Paid tier**: $25/month (only if you exceed free limits - unlikely)
- **What you get**: PostgreSQL database, authentication, real-time subscriptions, storage

**Option 2: Firebase**

- **Free tier (Spark plan)**: 1GB storage, 10GB bandwidth/month, 50K document reads/day
- **Should be sufficient** for your use case
- **Cost**: $0/month on free tier
- **Paid tier**: Pay-as-you-go (Blaze plan) - probably $0-5/month for small league
- **What you get**: Firestore database, authentication, real-time sync, storage

**Hosting** (choose one):

**Option 1: Vercel (RECOMMENDED)**

- **Free tier**: Unlimited personal projects, 100GB bandwidth/month
- **Perfect for your needs**
- **Cost**: $0/month
- **Paid tier**: $20/month (only needed for teams or high traffic)

**Option 2: Netlify**

- **Free tier**: 100GB bandwidth/month, 300 build minutes/month
- **Also sufficient**
- **Cost**: $0/month

**Domain (optional)**:

- **Cost**: $10-15/year from Namecheap or Google Domains
- **Not required** - Vercel gives you a free [yourapp.vercel.app](http://yourapp.vercel.app) domain

---

### **TOTAL MONTHLY COST:**

**Minimum (Free hosting + backend):**

- AI Tool: $20/month (Cursor)
- Backend: $0/month (Supabase free tier)
- Hosting: $0/month (Vercel free tier)
- **TOTAL: $20/month**

**Recommended Setup:**

- **Cursor**: $20/month
- **Supabase**: $0/month (free tier)
- **Vercel**: $0/month (free tier)
- **Custom domain**: ~$1/month ($12/year)
- **TOTAL: ~$21/month**

**Only pay for AI coding during active development** - Once the app is built, you can cancel Cursor and only pay for hosting/backend if you exceed free tiers (which is unlikely for a small golf league).

---

### **Cost After Development:**

Once the app is fully built:

- **Backend (Supabase)**: $0/month (free tier covers you)
- **Hosting (Vercel)**: $0/month (free tier covers you)
- **Domain**: ~$1/month (optional)
- **TOTAL: $0-1/month**

You only need to pay for the AI coding tool ($20/month) while actively building new features. For maintenance and small fixes, you can use free AI tools or re-subscribe for a month when needed.

### **Edge Cases:**

- **Event with no participants**: No points awarded to anyone.
- **Retroactive scores**: Members in unplayable climates can request via Slack to submit retroactive scores for first 2 events (must be made up by end of event 4). Admin manually enters the score, course, and tee for previous event(s).

---

## **Development Phases & Implementation Sequence:**

### **Phase 0: Foundation Setup**

**Goal**: Get the basic infrastructure running

**🤖 AI Can Do This**: You don't need to do this manually. AI coding tools (like Cursor, v0, Bolt, Claude with Projects, etc.) can generate and set up all of this for you.

**What to do:**

- Set up Next.js project with PWA capabilities
- Configure Firebase or Supabase (auth, database, storage)
- Set up basic project structure and routing
- Implement mobile-responsive layout
- Set up authentication (Google Sign-In + one-time email code)
- Create user roles (Admin, Member, Playing Guest, Non-Playing Guest)
- Deploy to hosting (e.g. Vercel/Netlify)

**Example Prompt for AI:**

*"Create a new Next.js project for the Minerva Tour App with the following setup: mobile-first responsive design, PWA capabilities, Firebase/Supabase for backend (auth + database), bottom navigation with 3 tabs (Home, Scores, Leaderboard), authentication supporting Google Sign-In and one-time email codes, and a user roles system (Admin, Member, Playing Guest, Non-Playing Guest). Deploy it to Vercel. Use Tailwind CSS for styling. Set up the project structure and routing."*

**Deliverable**: A deployed, empty app shell that users can log into

---

### **Phase 1: Core Member Experience - Score Submission**

**Goal**: Members can add courses and submit scores

**1.1 Course Management:**

- Create courses table/collection
- Add Course: Course Name, Tee Name, Type, Rating, Slope, Par; link to USGA course database
- Course list with search; course detail with edit, add another tee, start round / add tee time
- Course edit (all members); course delete (admin only)
- Prevent exact duplicate courses; track who added/edited each course

**1.2 Basic Score Submission:**

- Create scores and users tables
- Add Tee Time flow (select course/tee, set tee time); Submit Score (gross score, holes played)
- Edit/delete scores within current event only; show own scores; allow submitting for other members
- Tee times: list incomplete tee times (course, tee, player, date/time); sort by date, own first; search; open to enter/update score; completed rounds move to completed list

**1.3 Admin Handicap Management:**

- Create handicap history table
- Build admin panel to manually update member handicaps
- Display handicap on member profiles

**Deliverable**: Members can add courses and submit scores; admins can manage handicaps

---

### **Phase 2: Leaderboards & Calculations**

**Goal**: Display live leaderboards with correct scoring

**2.1 Scoring Calculations:**

- Implement course handicap calculation formula
- Implement net score calculation (Net Strokes Over Par formula)
- Handle rounding (course handicap and net scores to nearest stroke)
- Implement point payout calculations (regular events, majors, playoffs)
- Handle tied scores (split points, round to nearest tenth)

**2.2 Event Management:**

- Create events database table (event windows with dates)
- Create season database table
- Admin can create/edit event schedule
- App mode switching (off-season, regular season, playoffs, tournament)
- Automatic handicap capture at event window start

**2.3 Leaderboards:**

- Build current event leaderboard with projected points
- Build season standings leaderboard (Net champion)
- Build season standings leaderboard (Scratch champion)
- Toggle between event vs season leaderboards
- Real-time updates as scores are posted
- Display partial rounds with projected points
- Filter out incomplete partial rounds after event window ends

**Deliverable**: Working leaderboards that update in real-time with correct calculations

---

### **Phase 3: Home Dashboard & Navigation**

**Goal**: Create the home experience and complete navigation

**3.1 Home Tab:**

- Display current event status
- Display user's current position in event and season
- Quick action buttons (Start a round, Add a tee time)
- Quick links (Standings, Rules [link to WordPress], Photos [external link], Schedule)
- **Share button** in the top-right header (replaces notification bell). Tapping opens the native OS share sheet (via Web Share API) to share the app link via text, email, social media, etc. Falls back to copy-to-clipboard with visual "Copied!" feedback on browsers that don't support the Web Share API.

**3.2 Navigation:**

- Build hamburger menu with all sections
- Create Event History view
- Create Courses list view
- Create Members list view
- Create member profile pages (stats, scores, handicap history)
- Implement bottom navigation that changes based on mode (Regular Season, Tournament, Playoffs)

**3.3 Schedule Views:**

- Build calendar view of schedule
- Build list view of schedule

**Deliverable**: Complete navigation and home experience

---

### **Phase 4: Stats & History**

**Goal**: Members can view detailed statistics

**4.1 Individual Stats:**

- Average net score
- Best/worst rounds
- Courses played most
- Scoring trends over time
- Calculate and display for current season and all-time

**4.2 Comparative Stats:**

- Head-to-head records between members
- Member comparison views

**4.3 Event History:**

- View past events with results
- View past seasons with final standings
- Historical data retained indefinitely

**Deliverable**: Complete stats and historical data views

---

### **Phase 5: Admin Panel & Data Management**

**Goal**: Admins can manage all aspects of the app

**5.1 User Management:**

- View all users
- Modify user roles
- **User Provisioning UI:**
  - Form to add single user provision (email + role)
  - Bulk import interface (paste list of emails, CSV import, or similar)
  - View all provisions with status (pending vs. signed in)
  - Edit/delete provisions before users sign in
  - Update roles for already-provisioned users
- Delete users

**5.2 Data Management:**

- View and edit database tables (mobile-friendly interface)
- Correct scores (including locked scores from previous events)
- Manually enter retroactive scores

**5.3 Audit Logs:**

- Track every action (logins, score submissions, edits, course additions, etc.)
- Categorize events by type
- Build filtering, searching, and sorting interface (mobile-friendly)
- Make events structured and easily queryable

**5.4 Season/Event Management:**

- Admin mode accessible to admins
- Create/edit event windows
- Modify event window dates (for weather extensions)
- Set event types (9-hole, 18-hole, 36-hole, major, playoff)

**Deliverable**: Complete admin panel with full data management capabilities

---

### **Phase 6: Playoffs**

**Goal**: Handle playoff bracket and advancement

**6.1 Playoff Bracket:**

- Display traditional left-to-right ladder/tree bracket
- Show top 6 seeds in championship flight
- Show consolation flights
- Show Unicorn flight (reverse bracket with "Loser Advances" banner, last 2 seeds get bye)

**6.2 Playoff Management:**

- Admin manually sets matchups
- Admin manually sets round 2 opponent selection (for top 2 seeds)
- Track playoff advancement
- Apply playoff tiebreaker rules (better seed wins)

**6.3 Playoff Scoring:**

- Best net score per player in each round
- Handle 36-hole championship match
- Apply playoff-specific rules

**Deliverable**: Full playoff bracket and management system

---

### **Phase 7: Offline Support & Sync**

**Goal**: App works without internet connection

**7.1 Offline Functionality:**

- Implement offline-first data storage
- Save scores locally when offline
- Queue actions when offline
- Sync when connection returns

**7.2 Sync Status:**

- Show clear sync status indicator
- Handle sync conflicts gracefully
- Show confirmation when sync completes

**Deliverable**: App fully functional offline on the golf course

---

### **Phase 8: Polish & UX Enhancements**

**Goal**: Make the app delightful to use

**8.1 Confirmation Messages:**

- Toast notifications after key actions
- Success/error messages
- Loading states

**8.2 Error Handling:**

- Friendly, actionable error messages
- Graceful degradation when features fail

**8.3 9-Hole Bridging:**

- UI for members to manually combine 9-hole scores
- Validate against splicing rules
- Only for regular 18-hole events (block for majors/playoffs)

**8.4 Photos:**

- Admin can set Google Photos album URL
- Link to album from home page

**Deliverable**: Polished, production-ready app

---

### **Phase 9: Tournament Mode (Member-Guest & Bobby Jones Cup)**

**Goal**: Support tournament functionality

- Complete tournament format definitions (currently in TO BE DEFINED)
- Build tournament tab in navigation
- Tournament-specific scoring and leaderboards
- Tournament results display
- Playing Guest status management (auto-revert after tournament)
- Different tournament formats and rules

**Deliverable**: Full tournament support

---

### **Future Enhancements (Post-MVP):**

- GHIN integration (automatic handicap pulling)
- Data backup/restore functionality
- Google Photos import (display photos within app)
- Inline rules display (instead of linking to WordPress)
- Native iOS/Android apps
- Betting/wagering system (see Betting section above)

---

### **Implemented Features (Not Originally in PRD):**

The following features have been built and should be considered part of the app's current specification:

**Offline Architecture & Performance:**

- **Service worker** (`public/sw.js`): Pre-caches static assets, stale-while-revalidate for resources, network-first for navigation.
- **SWR + IndexedDB caching** (`src/components/SWRProvider.tsx`, `src/lib/offline/cache.ts`): All data fetching uses SWR with IndexedDB persistence for instant page loads and offline fallback.
- **Offline banner** (`src/components/OfflineBanner.tsx`): Displays connectivity status and pending sync count.
- **Offline score queue** (`src/lib/offline/sync-queue.ts`): Queues score submissions when offline and flushes when connection returns.
- **Online status detection** (`src/lib/hooks/useOnlineStatus.ts`): React hook for real-time online/offline state.

**Notifications:**

- **Push notifications** (`src/lib/push-notifications.ts`, `src/app/(protected)/notifications/page.tsx`): Full Web Push API integration with subscribe/unsubscribe, VAPID key support, and push event handling in the service worker.
- **In-app notification bell** (`src/components/navigation/NotificationBell.tsx`): Bell icon with unread badge in the header, linking to notifications page.
- **Notification types**: event_start, event_end, score_posted, handicap_update, admin_message, season_mode, tournament, general.

**Data Export:**

- **CSV/PDF export** (`src/lib/export.ts`): Export leaderboards and event history as CSV or PDF (print-to-PDF via HTML). Available on leaderboard and event history pages.

**Admin Features:**

- **Database viewer** (`src/app/(protected)/admin/data/page.tsx`): Mobile-friendly table browser with search, pagination, and inline editing for all 9 core tables.
- **Retroactive scores** (`src/app/(protected)/admin/retroactive/page.tsx`): Dedicated admin page for entering retroactive scores for members in unplayable climates.
- **Audit log viewer** (`src/app/(protected)/admin/audit/page.tsx`): Filterable, searchable audit log with structured event data and mobile-friendly display.

**Score Features:**

- **9-hole bridging** (`src/app/(protected)/scores/bridge/page.tsx`): Dedicated UI for combining two 9-hole scores into one 18-hole score, with splicing prevention.
- **Gross-to-par score entry**: Toggle between entering gross score or gross score relative to par, available on both the add-score page (`scores/add`) and the score/tee-time edit page (`scores/[id]`).
- **Quick Score panel** (`src/components/QuickScore.tsx`): Tap-to-increment score entry on the tee time detail page. Shows gross-to-par with -/+ buttons and hole thru with arrow buttons. DB saves debounced at 800ms; Slack notifications debounced at 20s. Uses `useQuickScoreSave` hook (`src/lib/hooks/useQuickScoreSave.ts`).
- **Major/playoff course rating validation**: Warning when selected course rating is below 68 for major/playoff events.
- **Course filtering by event holes**: When an active event exists, the course list on score submission and tee time pages only shows courses matching the event's hole count (18h/36h events show only 18-hole courses; 9h events show only 9-hole/front-9/back-9 courses). An info banner indicates the filtering. Pre-selected courses that don't match are cleared.

**Chirps:**

- **Automated score commentary** (`src/lib/chirps.ts`): Score-based trash talk templates with performance buckets and `$first_name` substitution. Bucket ranges are admin-configurable via `app_settings` (`chirp_bucket_ranges`) and default to distribution-calibrated thresholds. `getChirpBucket` accepts optional custom ranges; `buildBucketLabels` generates display labels from any range configuration. Chirps are attached only in Slack score notifications (not in-app UI).
- **Chirp + Slack settings** (`app_settings`): `chirp_config` stores chirp trigger mode (round-complete-only vs all score updates). `chirp_ai_config` stores AI generation settings for queue replenishment when the `chirps-queue` feature flag is enabled.
- **AI generation utility** (`src/lib/chirps-ai.ts`): Server-side helper used to generate chirp text for queue replenishment.
- **API**: `POST /api/chirps/generate` — runs `generateChirps` from `chirps-ai.ts` to fill queue buckets up to 10 (optional JSON body `{ bucket }` for one bucket; omit for all buckets below target). Authenticated members and admins.

**Data Migration:**

- **Glide-to-Supabase migration** (`scripts/migrate-glide-data.mjs`): Comprehensive migration script that imported all historical data from the legacy Glide app (30 users, 216 handicap records, 805 courses, 12 events, 227 scores, 6 playoff matchups). Script is idempotent and uses Supabase Admin Auth API for user creation.
- **Glide data source guidance** (from commissioner): Round History "Gross Score" is unreliable (pulls from Projected Gross). For correct gross, use Score Archive "Gross Score (optional)" if populated, otherwise derive from Over Par + Par. The "Actual Gross" column (col 11) in Score Archive implements this as a formula. RH "Net Score" and "Scratch Score" are the source of truth for standings.
- **Projected Gross bug fix**: Glide's "Round History" tab stores Projected Gross (not Actual Gross) in its "Gross Score" column for scores entered via direct gross entry. This affected 797 scores across 2020-2025. All migration scripts (`migrate-glide-data.mjs` and `import-YYYY-season.mjs` for 2020-2025) now cross-reference the "Score Archive" tab's "Actual Gross" column to correct the value. Fix script: `scripts/fix-projected-gross-scores.mjs` (matches by Glide UUID for 2025, by user+event+gross for 2020-2024). 2018-2019 data uses a different format ("Round Data") and is unaffected.
- **NOP formula fix**: Import scripts (2018-2024) computed `net_strokes_over_par` as `round(gross - courseHandicap - rating)` instead of `gross - courseHandicap - par`. This affected 736 scores. Fix script: `scripts/fix-nop-rating-vs-par.mjs`. All import scripts patched to use `par`.
- **Historical data reimport** (`scripts/reimport-glide-scores.mjs`): Comprehensive reimport of 2018-2025 data from Glide as-is. Imports scratch scores (`scratch_strokes_over_rating`), scratch event points (`scratch_points_awarded`), net event points (`points_awarded`), and handicap index used (`handicap_index_used`) directly from Glide without recalculation. Supports `--dry-run` (preview), `--verify` (post-import validation), and `--year YYYY` (single year). Sources: RH "Scratch Score" and "Scores + Points" tab for 2020-2025; deterministic `Gross - ROUND(Rating - Par) - Par` for 2018-2019 scratch.
- **Historical score UI treatment**: Scores from seasons prior to 2026 are read-only in the UI. The score detail page hides the handicap breakdown (uses current HI, wrong for historical), scoring differential, edit/delete buttons, QuickScore, and Copy to Members. Instead it shows a "Historical Score" banner with the handicap index at time of play, and displays stored scratch score and both net/scratch points. The scores list page skips fallback net calculation for historical scores.

**Trophies & Hall of Fame:**

- **Trophy data model** (`trophies` and `season_finishes` tables): Stores awards won by members (Minerva Tour Champion, Scratch Champion, Bobby Jones Cup, Member-Guest, Most Improved, Playoffs Winner, Consolation Winner, Unicorn, Edge Solutions Cup, Hole in One) with year, award type, emoji, and optional description (location).
- **Trophy Case on profiles** (`members/[id]/page.tsx`, `profile/page.tsx`): Each member's profile displays their award history with emojis, award names, locations, and years, plus season finish history.
- **Emoji badges on members list** (`members/page.tsx`): Compact unique trophy emojis displayed next to each member's name in the members list.
- **Hall of Fame page** (`/hall-of-fame`): Dedicated page listing all award categories with winners by year, grouped by award type (Champions, Scratch Champions, Bobby Jones Cup, etc.), showing player photos and emoji badges.
- **Data migration** (`scripts/import-trophies.mjs`): Import script that parses the Glide xlsx Profile sheet's "Champ Year" column and season finish columns (2017-2023) to populate trophy and finish data.
- **Emoji mapping**: 🏆 Minerva Tour Champion, 🥇 Scratch Champion, 📉 Most Improved, 🌳 Bobby Jones Cup (Team Magnolia), 🌺 Bobby Jones Cup (Team Azalea), 🇺🇸 Bobby Jones Cup (Hilton Head, pre-team era), 🍻 Member-Guest, 🦄 Unicorn, 🎖 Playoffs Winner, 🥈 Consolation Winner, 📀 Edge Solutions Cup, 1️⃣ Hole in One.

**Slack Integration:**

- **Slack Bot integration** (`src/lib/slack.ts`, `src/lib/slack-notify.ts`, `src/app/api/slack/`): Posts rich notifications to a configured Slack channel when key events occur.
- **Admin configuration** (extended in `/admin/settings`): Admins paste a Slack Bot Token, select a channel from a dropdown (populated via Slack API), and toggle which events fire notifications.
- **Event types**:
  - `tee_time` — New tee time created (player, course/tee, date/time)
  - `score_in_progress` — Score posted for an in-progress round (gross, net, holes played; chirp line only when chirp trigger config allows all score updates)
  - `round_complete` — Round finished (gross, net, holes; chirp line included when chirp trigger config allows)
  - `score_edit` — Score edited (before/after values)
  - `retroactive` — Retroactive score entered by admin (player, course, event)
  - `feedback_submitted` — User submitted feedback (type, title, description, attachment links if any)
- **Architecture**: Client fires a fire-and-forget POST to `/api/slack/notify` after score operations and feedback submissions. The API route reads the Slack config from `app_settings` server-side (bot token never exposed to browser), checks if the event type is enabled, reads **`chirp_config`** to decide whether to attach a chirp for this notification (round-complete-only vs all score updates), **consumes** the next chirp from the matching bucket when the **`chirps-queue`** flag is on (ordered queue + archive + replenishment), otherwise picks a **random** pool template, formats a Slack Block Kit message, and posts via `chat.postMessage`.
- **Projected points**: For `score_in_progress`, `round_complete`, and `retroactive` events, the API route queries the current event's completed scores from the database, ranks the player among all participants (handling ties with point splitting), and includes both projected net and scratch points in the Slack message. Points are calculated server-side using the same formulas as the leaderboard (`calculateProjectedPoints` in `src/lib/scoring.ts`). Tee time notifications show "Points: -" since no score exists yet.
- **Message format**: Compact single-section Slack blocks with no header/title blocks. Chirps appear as regular-sized italic text with a `:studio_microphone:` emoji. No event-type emojis on player lines. Feedback messages show a type-specific emoji (:bug:, :bulb:, :speech_balloon:), submitter name, title, description, and clickable attachment links when present.
- **Feedback channel**: Admins can optionally configure a separate Slack channel for feedback notifications (stored as `feedback_channel_id` and `feedback_channel_name` in `slack_config`). If not configured, feedback posts to the main score channel. The admin settings page shows a "Feedback Channel" dropdown (visible after loading channels) with a "Same as score channel" default option.
- **Configuration stored in** `app_settings`: `slack_config` (JSONB) holds bot_token, channel_id, channel_name, per-event-type enabled flags, and optional feedback_channel_id/feedback_channel_name. **`chirp_config`** and **`chirp_ai_config`** (separate keys) hold chirp trigger mode and AI generation settings for queue replenishment.
- **Error handling**: Slack notifications are best-effort — failures are silent and never block score submission or feedback submission.

**iOS Standalone Session Persistence:**

- **Problem**: iOS WKWebView can evict `document.cookie` storage when the standalone (home screen) PWA process is killed, causing users to re-authenticate on every launch.
- **Session backup** (`src/lib/session-persistence.ts`): Mirrors auth tokens (access + refresh) to `localStorage` on every auth state change. `localStorage` is preserved more reliably than cookies in iOS standalone mode.
- **Auto-backup component** (`src/components/SessionPersistence.tsx`): Mounted in the root layout, subscribes to Supabase `onAuthStateChange` to keep the backup in sync. Clears backup on sign-out.
- **Login page recovery** (`src/app/(auth)/login/page.tsx`): On mount, checks for an existing session or a localStorage backup. If found, restores the session via `setSession()` and redirects to `/home` without requiring re-authentication. Shows a branded loading state during recovery.

**Testing:**

- **Comprehensive test suite**: 670+ tests covering unit, component, integration, functional, and E2E testing using Vitest, React Testing Library, and Playwright. TDD workflow enforced via workspace rules.

---

### **Tips for AI Coding:**

**Start Small:**

- Don't try to build everything at once
- Complete and test each phase before moving to the next
- Each phase should result in a working, deployable version

**Prompting Strategy:**

- Give the AI the entire spec as context, but ask it to implement one phase at a time
- Reference specific sections of this spec in your prompts
- Example: "Based on the Minerva Tour App spec, implement Phase 1.1 Course Management"

**Testing Between Phases:**

- Deploy and manually test after each phase
- Have members try it on their phones
- Fix issues before moving to next phase
- A comprehensive automated test suite (220+ tests) has been implemented covering unit, component, integration, functional, and E2E tests (see PROGRESS.md for details)

**Database Schema:**

- Have the AI create the complete database schema upfront (even if not all tables are used yet)
- This prevents migration headaches later

**Key Tables to Create Early:**

- users (with role, handicap, handicap_history)
- courses (with all tee variations)
- scores (with event_id, user_id, course_id)
- events (with season_id, dates, type, is_major)
- seasons (with year, mode)
- audit_logs (for all actions)
- feedback (bug reports, feature requests, general feedback)

---

## **Feedback System:**

### **Overview:**

Users can submit bug reports, feature requests, or general feedback directly within the app. Admins manage an inbox to review, respond to, and close out submissions.

### **User Features:**

- Submit feedback with a type (Bug Report, Feature Request, Other), title, and description
- Attach up to 3 screenshots or videos (max 10MB each) to any submission
- View "My Submissions" list with status badges (Open, In Progress, Resolved, Closed)
- Expand submissions to see full description and admin response
- Delete own submissions (with confirmation) — cleans up attachments from storage and logs an audit event
- Accessible from Profile page ("Send Feedback" card) and More menu ("Feedback" link)

### **Admin Features:**

- Dedicated "Feedback Inbox" in the admin section
- Filter by status (Open, In Progress, Resolved, Closed) and type (Bug, Feature, Other)
- Expand any entry to view description, attachments, and write a response
- Change feedback status with one tap
- Delete any feedback entry (with confirmation) — cleans up attachments from storage and logs an audit event
- **Attachment cleanup**: When feedback is closed or deleted, all uploaded files are deleted from storage and the attachments array is cleared to prevent indefinite storage growth

### **Database:**

- `feedback` table with RLS policies (users insert/read own, admins read/update all)
- `feedback-attachments` Supabase Storage bucket (private, authenticated access)
- File path convention: `{user_id}/{feedback_id}/{filename}`

---

## 12. Event Recaps

### **Overview:**

Automates the end-of-event recap process. After an event wraps, the commissioner generates an AI-drafted recap from the standings data, reviews/edits it, and publishes it to Slack along with standings images — replacing the previous manual screenshot/ChatGPT/copy-paste workflow.

### **Commissioner Workflow:**

1. Go to **Admin > Season & Events** and tap the **Recap** (sparkle) icon on any event
2. Recap page loads with a preview of event standings (net) and season standings through that event
3. Optionally enter **Commissioner Notes** to add context the standings don't show (e.g., "Matt played a career round at St. Andrews")
4. Tap **Generate Recap** — the app sends standings data + notes to the configured AI endpoint
5. Review and edit the AI-generated recap text in a textarea
6. Tap **Post to Slack** — the app generates 4 standings images, uploads them, and posts a Block Kit message with the recap text + images to the configured Slack channel
7. Success state shown; recap saved to database. Can re-generate or re-post at any time

### **Timing:**

- Works for any past event by event ID — the commissioner can generate recaps Sunday evening, Monday morning, or weeks later
- Season standings are computed "as of" the recapped event using a `throughEventNumber` parameter, ensuring they don't include scores from later events

### **AI Configuration (Admin Settings):**

- **API Endpoint**: Any OpenAI-compatible chat completions URL (Grok, OpenAI, Anthropic proxy, self-hosted)
- **API Key**: Stored server-side, never sent to client
- **Model**: e.g., `grok-3`, `gpt-4o`
- **System Prompt**: Fully customizable, ships with a default tuned for casual "group chat" energy
- **Max Tokens**: Configurable (default 700, ~300-450 words)
- Grok models are recommended for the default prompt's tone

### **Slack Integration:**

- Recap channel is configurable separately from score notification channel
- Recaps post as Block Kit messages: header, recap text section, 4 standings image blocks (event net, event scratch, season net, season scratch)
- Images are generated server-side via `@vercel/og` and uploaded to a `recaps` Supabase Storage bucket

### **Standings Images:**

- 4 PNG images generated server-side: Event Net, Event Scratch, Season Net, Season Scratch
- Clean table design with rank, player name, score, points
- Hosted publicly in Supabase Storage for Slack to render

### **Database:**

- `event_recaps` table: stores recap text, commissioner notes, 4 image URLs, Slack message timestamp, and posted status per event (unique on event_id)
- `app_settings` key `ai_config`: stores AI endpoint, key, model, prompt, max_tokens
- `slack_config` extended with `recap_channel_id` and `recap_channel_name`

---

## 13. Feature Flags

### **Overview:**

A self-hosted feature flag system for gradual rollouts. Flags gate new functionality so it can be tested with specific users before full rollout, and can be turned off instantly without affecting existing behavior.

### **How it works:**

- Flags are created in code (added to the `FEATURE_FLAGS` registry in `src/lib/feature-flags.ts` and inserted into the database via SQL) — never from the admin UI
- The admin UI (Admin > Settings, bottom of page) shows all existing flags with toggle switches and targeting controls
- Flags support per-user targeting (`target_user_ids`) and per-role targeting (`target_roles`) with OR logic
- A disabled flag or missing flag always evaluates to `false` (safe default)
- Client components use `useFeatureFlag(FEATURE_FLAGS.KEY)` which returns `{ enabled, loading }`
- API routes and server components use `isFeatureEnabled(supabase, FEATURE_FLAGS.KEY, userId)`
- Flag state is cached in localStorage for flash-free page loads and offline PWA support

### **Targeting logic:**

- `enabled = false` → OFF for everyone (kill switch)
- `enabled = true` + no targeting → ON for everyone (global rollout)
- `enabled = true` + `target_user_ids` set → ON only for listed users
- `enabled = true` + `target_roles` set → ON only for matching roles
- Both set → OR (either match grants access)

### **Admin UI (Admin > Settings > Feature Flags):**

- Toggle flags on/off (saves immediately)
- Expand per-flag targeting: role checkboxes and user picker
- No create or delete — flag lifecycle is managed in code, DB rows via SQL

### **Flag lifecycle:**

1. Created in code during development (registry entry + DB row via SQL)
2. Enabled for specific testers via admin targeting
3. Widened to roles for broader rollout
4. Global rollout (clear targeting arrays)
5. Cleanup: remove flag checks from code, delete DB row via SQL

### **Database:**

- `feature_flags` table: key (PK), description, enabled, target_user_ids (UUID[]), target_roles (TEXT[]), created_at, updated_at, updated_by
- RLS: all authenticated users can read, admins can manage

