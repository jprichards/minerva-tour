# Minerva Tour App — Build Progress

## What's Done

### Phase 0: Foundation Setup (Complete)
- [x] Next.js 16 project with App Router, TypeScript, Tailwind CSS
- [x] Supabase client setup (browser + server + middleware)
- [x] Auth: Google OAuth + email magic link, auth callback
- [x] User creation trigger (auto-creates user row on signup, applies provisioned role)
- [x] Middleware for session refresh and route protection
- [x] Mobile-first layout with bottom navigation + "More" menu
- [x] PWA manifest
- [x] Toast notification system
- [x] Complete database schema (SQL file ready to run in Supabase)
- [x] RLS policies for all tables (including notifications)
- [x] Audit logging utility (client + server)

### Phase 1: Core Member Experience (Complete)
- [x] **Courses**: List, search, grouped by course name, add course, edit course, course detail, add another tee (pre-filled locked name), admin-only delete
- [x] USGA NCRDB link for course lookup
- [x] Duplicate prevention (unique constraint on course_name + tee + type + rating + slope + par)
- [x] Audit trail: who added/edited each course
- [x] **Score Submission**: 3-step flow (select course → select player → enter details)
- [x] Submit for self or other member
- [x] Tee time creation (incomplete round)
- [x] Gross score + holes played entry (partial rounds supported 1–max)
- [x] Net score calculation with course handicap formula
- [x] Net score preview before submission
- [x] Completed rounds list with search/filter
- [x] Tee times list (sorted by date, own first)
- [x] Score detail with edit/delete (within current event only; admins bypass)
- [x] Score editing inline on detail page
- [x] **9-hole bridging**: UI to combine two 9-hole scores into an 18-hole bridged round
- [x] Off-season score submission blocking
- [x] Playing guest restrictions (no course add, no regular season scores)

### Phase 2: Leaderboards & Calculations (Complete)
- [x] **Scoring engine**: Course handicap, net score, partial round formulas
- [x] **Point calculations**: Regular events (1 point per participant) and majors (1.33x or 10 min)
- [x] **Current event leaderboard** with projected points
- [x] **Season standings** with cumulative points
- [x] Toggle between event vs season view
- [x] Toggle between Net vs Scratch mode
- [x] Highlight current user on leaderboard
- [x] Medal icons for top 3
- [x] **Tiebreaker logic**: Net score → handicap → holes played (event); points → handicap → events played → scores posted (season)
- [x] Off-season leaderboard blocking

### Phase 3: Home Dashboard (Complete)
- [x] Personalized greeting
- [x] Current event card with submit/leaderboard links
- [x] Quick action grid (Start Round, Tee Times, Standings, Courses)
- [x] Current handicap display
- [x] Recent rounds list
- [x] Quick links (Rules, USGA NCRDB)
- [x] Google Photos album link (from app settings)
- [x] Notification bell with unread count

### Phase 4: Profile & Members (Complete)
- [x] Profile page with avatar, name, email, role
- [x] Profile picture upload (Supabase Storage)
- [x] Current handicap + GHIN number display
- [x] Quick stats (total rounds, avg net, best net)
- [x] Handicap history timeline
- [x] Edit profile (name, GHIN number)
- [x] Sign out
- [x] **Members list**: Search, profile links, handicap display
- [x] **Member profile**: Stats, recent scores, handicap history

### Phase 5: Admin Panel (Complete)
- [x] Admin dashboard with links to sub-sections
- [x] **User Management**: View all users, search, edit role, edit handicap (with history), delete
- [x] **User Provisioning**: Add single user (email + role), bulk import (CSV/comma/newline), view provisions (pending vs claimed), delete pending provisions
- [x] **Audit Logs**: Paginated log viewer, filter by action type, search, expandable detail view with JSON, mobile-friendly
- [x] **Season & Event Management**: Create seasons, switch mode, create/edit events, set active event, handicap capture button
- [x] **Playoff Bracket Management**: Create matchups by round/flight, set winners, delete matchups
- [x] **Tournament Management**: Create/edit/delete tournaments, activate/deactivate (auto-switches season mode)
- [x] **App Settings**: Google Photos URL, Tour Rules URL

### Phase 6: Additional Pages (Complete)
- [x] **Event History**: Browse past events by season, expandable results with scores and points
- [x] **Schedule**: Calendar view + list view of events, season selector, active event highlighting
- [x] **Stats**: Personal scoring overview, best/worst rounds, scoring trends chart, courses played most, compare with members
- [x] **Head-to-Head**: Compare net scores event-by-event against other members
- [x] **Playoffs**: Member-facing bracket view with round labels, flight tabs, player slots, winner advancement

### Phase 7: Guest, Tournament & Notifications (Complete)
- [x] **Non-Playing Guest Access**: Public `/view` page with current event + leaderboard (no auth required)
- [x] **Tournament Page**: Active tournament display, tournament leaderboard by total net, round count, stats
- [x] **Notifications**: In-app notification system with real-time via Supabase channels, notification bell, mark read/unread, delete, typed notifications (event, score, handicap, admin, tournament, etc.)

## What's Not Done Yet

### Not Built / Lower Priority
- [ ] Offline support / service worker sync
- [ ] Push notifications (web push via service worker)
- [ ] Data export (CSV/PDF)
- [ ] GHIN API integration (Phase 2 per PRD)
- [ ] Native iOS/Android apps
- [ ] Admin database table viewer/editor
- [ ] Admin mode toggle (switch between member/admin view)
- [ ] Dedicated retroactive score entry UI
- [ ] Playing Guest auto-revert after tournament
- [ ] Connection loss detection / offline error handling
- [ ] Splicing prevention (duplicate score guard)

### Known Limitations
- **Notifications table**: Run `supabase/add-notifications.sql` in Supabase SQL Editor after initial schema
- **Real-time updates**: Notifications use real-time; leaderboard still requires manual refresh
- **Tournament format**: PRD notes format details are "TO BE DEFINED" — current implementation is stroke play scoring
- **Retroactive scores**: Admin can mark scores as retroactive but no special UI for the first-2-events rule

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Icons**: Lucide React
- **Deployment**: Ready for Vercel

## Routes (33 total)
| Route | Description |
|-------|-------------|
| `/` | Root redirect |
| `/login` | Auth page (Google + email magic link) |
| `/auth/callback` | OAuth callback |
| `/view` | Public guest leaderboard (no auth) |
| `/home` | Dashboard |
| `/scores` | My scores (completed + tee times) |
| `/scores/add` | Submit score (3-step) |
| `/scores/bridge` | Bridge two 9-hole scores |
| `/scores/[id]` | Score detail |
| `/leaderboard` | Event + season leaderboard |
| `/courses` | Course list |
| `/courses/add` | Add course |
| `/courses/[id]` | Course detail |
| `/courses/[id]/edit` | Edit course |
| `/profile` | My profile |
| `/profile/edit` | Edit profile |
| `/members` | Members list |
| `/members/[id]` | Member profile |
| `/event-history` | Past event results |
| `/schedule` | Calendar + list view |
| `/stats` | Tour stats |
| `/stats/[userId]` | Head-to-head |
| `/playoffs` | Playoff brackets |
| `/tournament` | Tournament page |
| `/notifications` | Notifications |
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/provisions` | User provisioning |
| `/admin/seasons` | Season & event management |
| `/admin/playoffs` | Playoff bracket management |
| `/admin/tournaments` | Tournament management |
| `/admin/audit` | Audit logs |
| `/admin/settings` | App settings |

## Test Suite

A comprehensive test suite has been implemented with **220+ tests** across 5 testing levels:

### Unit Tests (95 tests) — `src/__tests__/unit/`
- **scoring.test.ts** (57 tests): Course handicap, partial handicaps, net scores, regular/major event points, tie splitting, score formatting
- **handicap-capture.test.ts** (4 tests): Handicap capture for events, error handling, empty member scenarios
- **notifications.test.ts** (6 tests): sendNotification, sendBroadcastNotification, edge cases
- **database-types.test.ts** (11 tests): Type unions, interface shapes, all roles/modes/actions
- **middleware.test.ts** (17 tests): Public path detection, redirect logic, dev bypass behavior

### Component Tests (25 tests) — `src/__tests__/components/`
- **BottomNav.test.tsx** (7 tests): Auth-gated rendering, nav links, More menu, admin visibility
- **NotificationBell.test.tsx** (5 tests): Auth-gated, unread badge, 99+ cap
- **pages.test.tsx** (13 tests): Page rendering for event history, members, schedule, stats, playoffs, tournament, notifications, bridge scores, loading states

### Integration Tests (16 tests) — `src/__tests__/integration/`
- **hooks.test.tsx** (8 tests): useUser, useSeason, useNotifications hooks with mocked Supabase
- **scoring-workflow.test.ts** (8 tests): Full event scoring, ranking, points distribution, partial rounds, season accumulation

### Functional Tests (45 tests) — `src/__tests__/functional/`
- **score-submission.test.tsx** (6 tests): Score page rendering, off-season blocking, guest restrictions
- **admin-access.test.tsx** (6 tests): Admin page with all 7 sections, non-admin redirect, loading state
- **login-flow.test.tsx** (10 tests): Login page rendering, Google OAuth, magic link, error handling
- **course-add.test.tsx** (8 tests): Course form rendering, playing guest restriction, validation
- **role-enforcement.test.ts** (15 tests): All role+mode combinations for access control

### End-to-End Tests (39 tests) — `e2e/`
- **public-pages.spec.ts**: Login page, guest view, auth protection (redirect checks for 8 routes)
- **login-interaction.spec.ts**: Form interactions, responsiveness, input validation
- **navigation.spec.ts**: 404 handling, callback route, redirect loop prevention
- **dev-bypass-pages.spec.ts**: All 14 protected pages load via dev bypass

### Running Tests
```bash
npm test              # Run all Vitest tests (unit/component/integration/functional)
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E tests (requires dev server)
npm run test:all      # All tests (Vitest + Playwright)
```

## Getting Started
1. Create a Supabase project at supabase.com
2. Run `supabase/schema.sql` in Supabase SQL Editor
3. Run `supabase/add-notifications.sql` for notification support
4. Copy `.env.local.example` to `.env.local` and fill in your Supabase URL + publishable default key
5. Enable Google OAuth in Supabase Auth settings
6. `npm install && npm run dev`
7. Sign in, then set your user role to `admin` in Supabase Table Editor
