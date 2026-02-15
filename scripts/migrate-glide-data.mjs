#!/usr/bin/env node
/**
 * Minerva Tour — Glide-to-Supabase Data Migration
 *
 * Reads the Glide app's .xlsx export and backfills the Supabase database.
 *
 * Usage:
 *   node scripts/migrate-glide-data.mjs [--dry-run]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL           — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY          — Service role key (preferred for full access)
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY — Fallback anon key
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';

// Load .env.local
config({ path: resolve('.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

// ── Supabase client ──────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE env vars. Check .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Load workbook ────────────────────────────────────────────
const XLSX_PATH = resolve('docs/glide-app/Minerva Tour App.xlsx');
const workbook = XLSX.readFile(XLSX_PATH);

function getSheet(name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) { console.warn(`  [WARN] Sheet "${name}" not found`); return []; }
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

// ── Helpers ──────────────────────────────────────────────────

/** Convert Excel serial date to ISO date string */
function excelDateToISO(serial) {
  if (!serial || typeof serial === 'string') {
    // Try parsing as a date string directly
    if (serial && serial.includes('/')) {
      const d = new Date(serial);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }
  // Excel serial: days since 1899-12-30
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400000;
  const fraction = serial - Math.floor(serial);
  const timeMs = Math.round(fraction * 86400000);
  return new Date(utcMs + timeMs).toISOString();
}

/** Convert Glide course type string to our CourseType enum */
function mapCourseType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t.includes('front')) return 'front_9';
  if (t.includes('back')) return 'back_9';
  if (t === '9 holes' || t === '9_holes') return '9_holes';
  return '18_holes';
}

/** Convert Glide event type code to { is_major, is_playoff, holes } */
function mapEventType(code) {
  switch ((code || '').toUpperCase().trim()) {
    case 'M':  return { is_major: true, is_playoff: false, holes: 18 };
    case 'C':  return { is_major: false, is_playoff: true, holes: 18 };
    case 'R9': return { is_major: false, is_playoff: false, holes: 9 };
    case 'R18':
    default:   return { is_major: false, is_playoff: false, holes: 18 };
  }
}

function clean(v) { return v === '' || v == null ? null : v; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function int(v) { const n = parseInt(v); return isNaN(n) ? null : n; }

// Tracking maps — Glide key → Supabase UUID
const userMap = new Map();      // email (lowercase) → user UUID
const courseMap = new Map();     // "CourseName|Tee|Type" → course UUID
const eventMap = new Map();     // "seasonId:eventNumber" → event UUID
const seasonMap = new Map();    // year → season UUID

let stats = { users: 0, courses: 0, seasons: 0, events: 0, scores: 0, playoffs: 0, handicaps: 0 };

// ══════════════════════════════════════════════════════════════
//  STEP 1: USERS
// ══════════════════════════════════════════════════════════════
async function migrateUsers() {
  console.log('\n━━━ STEP 1: USERS ━━━');
  const members = getSheet('Members').filter(r => r.Name && r['Email Address']);
  const inactive = getSheet('Inactive Members').filter(r => r.Name && r['Email Address']);
  const profiles = getSheet('Profile').filter(r => r.Name && r['Email Address']);

  // Build a merged set keyed by email
  const byEmail = new Map();

  for (const row of [...members, ...inactive]) {
    const email = (row['Email Address'] || '').toLowerCase().trim();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, {});
    Object.assign(byEmail.get(email), {
      full_name: row.Name || row['Player Name'],
      email,
      handicap_index: num(row['Handicap Index']),
      ghin_number: clean(row['GHIN Number']) ? String(row['GHIN Number']) : null,
      profile_picture_url: clean(row.Photo),
      status: row.Status || 'Active',
      player_id: clean(row['Player ID']),
      season_finishes: {
        2017: clean(row['2017 MT Finish']),
        2018: clean(row['2018 MT Finish']),
        2019: clean(row['2019 MT FInish']),
        2020: clean(row['2020 MT Finish']),
      },
    });
  }

  // Merge Profile data (has 2021-2023 finishes)
  for (const row of profiles) {
    const email = (row['Email Address'] || '').toLowerCase().trim();
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        full_name: row.Name || row['Player Name'],
        email,
        handicap_index: num(row['Handicap Index']),
        ghin_number: clean(row['GHIN Number']) ? String(row['GHIN Number']) : null,
        profile_picture_url: clean(row.Photo),
        status: row.Status || 'Active',
      });
    }
    const existing = byEmail.get(email);
    if (!existing.season_finishes) existing.season_finishes = {};
    existing.season_finishes[2021] = clean(row['2021 MT Finish']);
    existing.season_finishes[2022] = clean(row['2022 MT Finish']);
    existing.season_finishes[2023] = clean(row['2023 MT Finish']);
    // Profile has more photo/champ info
    if (row.Photo && !existing.profile_picture_url) {
      existing.profile_picture_url = row.Photo;
    }
    if (row['Champ Year']) {
      existing.champ_years = row['Champ Year'];
    }
  }

  console.log(`  Found ${byEmail.size} unique users to migrate`);

  // First, check what users already exist in DB
  const { data: existingUsers } = await supabase.from('users').select('id, email');
  const existingByEmail = new Map();
  for (const u of (existingUsers || [])) {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u.id);
  }

  for (const [email, data] of byEmail) {
    // Check if user already exists in public.users
    if (existingByEmail.has(email)) {
      const existingId = existingByEmail.get(email);
      userMap.set(email, existingId);
      console.log(`  [SKIP] ${data.full_name} (${email}) — already exists as ${existingId}`);

      // Still update their profile with Glide data
      if (!DRY_RUN) {
        await supabase.from('users').update({
          full_name: data.full_name,
          handicap_index: data.handicap_index,
          ghin_number: data.ghin_number,
          profile_picture_url: data.profile_picture_url,
        }).eq('id', existingId);
      }
      stats.users++;
      continue;
    }

    const role = data.status === 'Inactive' ? 'non_playing_guest' : 'member';

    if (!DRY_RUN) {
      // Step 1: Create auth user via Supabase Admin API
      // This creates a record in auth.users, which the FK requires
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        email_confirm: true,  // Mark email as confirmed
        user_metadata: { full_name: data.full_name },
      });

      if (authError) {
        // User may already exist in auth but not in public.users
        if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
          // List users and find by email
          const { data: listData } = await supabase.auth.admin.listUsers();
          const existing = listData?.users?.find(u => u.email?.toLowerCase() === email);
          if (existing) {
            const userId = existing.id;
            // Insert into public.users
            const { error: pubErr } = await supabase.from('users').upsert({
              id: userId,
              full_name: data.full_name,
              email: email,
              role: role,
              handicap_index: data.handicap_index,
              ghin_number: data.ghin_number,
              profile_picture_url: data.profile_picture_url,
            }).select().single();
            if (pubErr) {
              console.log(`    [ERROR] Public user for ${email}: ${pubErr.message}`);
              continue;
            }
            userMap.set(email, userId);
            console.log(`  [ADD] ${data.full_name} (${email}) → ${userId} [${role}] (auth existed)`);
            stats.users++;
            continue;
          }
        }
        console.log(`    [ERROR] Auth create for ${email}: ${authError.message}`);
        continue;
      }

      const userId = authUser.user.id;

      // Step 2: Insert into public.users using the auth user's ID
      const { error: userError } = await supabase.from('users').insert({
        id: userId,
        full_name: data.full_name,
        email: email,
        role: role,
        handicap_index: data.handicap_index,
        ghin_number: data.ghin_number,
        profile_picture_url: data.profile_picture_url,
      });

      if (userError) {
        console.log(`    [ERROR] Public user insert for ${email}: ${userError.message}`);
        // Try upsert in case a trigger already created it
        const { error: upsertErr } = await supabase.from('users').upsert({
          id: userId,
          full_name: data.full_name,
          email: email,
          role: role,
          handicap_index: data.handicap_index,
          ghin_number: data.ghin_number,
          profile_picture_url: data.profile_picture_url,
        });
        if (upsertErr) {
          console.log(`    [ERROR] Upsert also failed for ${email}: ${upsertErr.message}`);
          continue;
        }
      }

      userMap.set(email, userId);

      // Step 3: Provision entry
      await supabase.from('user_provisions').insert({
        id: randomUUID(),
        email: email,
        role: role,
        claimed_by: userId,
        claimed_at: new Date().toISOString(),
      });
    } else {
      userMap.set(email, randomUUID());
    }

    console.log(`  [ADD] ${data.full_name} (${email}) → ${userMap.get(email)} [${role}]`);
    stats.users++;
  }

  // Import handicap history from GG Handicap Import
  // IMPORTANT: This sheet has TWO separate tables side by side:
  //   Left (cols A-T): GHIN registration data (Email, Name, Index...)
  //   Right (cols Z-AN): Handicap history (GHIN Number, Golfer Name, Current, monthly values)
  // The rows do NOT align by person between tables. We must parse the RIGHT table
  // independently using "Golfer Name" to find users, NOT the left table's Email column.
  const ws = workbook.Sheets['GG Handicap Import'];
  if (ws) {
    // Read cells from the right-side table directly
    const range = XLSX.utils.decode_range(ws['!ref']);
    // Column Z = 25, AA = 26 (Golfer Name), AB = 27 (Current), AC-AN = 28-39 (monthly)
    const GOLFER_NAME_COL = 26; // Column AA
    const CURRENT_COL = 27;     // Column AB
    const MONTH_START_COL = 28; // Column AC

    // Read the header row to get the date serial numbers
    const monthDates = [];
    for (let c = MONTH_START_COL; c <= Math.min(range.e.c, 39); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell && cell.v) {
        // Convert Excel serial date to JS date
        const serial = Number(cell.v);
        if (!isNaN(serial) && serial > 40000) {
          const jsDate = new Date((serial - 25569) * 86400 * 1000);
          monthDates.push({ col: c, date: jsDate.toISOString().split('T')[0] });
        }
      }
    }

    // Build a name-to-userId lookup (first name + last name from userMap keys)
    // userMap is keyed by email. Build a reverse lookup by full name.
    const nameToUserId = new Map();
    for (const [email, userId] of userMap) {
      // Look up user's full name from the existing data
      const memberRow = [...byEmail.entries()].find(([e]) => e === email);
      if (memberRow) {
        const fullName = memberRow[1].full_name?.toLowerCase().trim();
        if (fullName) nameToUserId.set(fullName, userId);
      }
    }

    // Delete old incorrectly-imported handicap history
    if (!DRY_RUN) {
      const { error: delErr } = await supabase.from('handicap_history')
        .delete()
        .eq('source', 'glide_import_ghin');
      if (delErr) {
        console.log(`    [WARN] Could not delete old handicap imports: ${delErr.message}`);
      } else {
        console.log('  Cleared old handicap imports (will re-import correctly)');
      }
    }

    // Parse each data row from the right-side table
    for (let r = 1; r <= range.e.r; r++) {
      const nameCell = ws[XLSX.utils.encode_cell({ r, c: GOLFER_NAME_COL })];
      if (!nameCell || !nameCell.v) continue;

      const golferName = String(nameCell.v).toLowerCase().trim();
      const userId = nameToUserId.get(golferName);
      if (!userId) {
        console.log(`    [SKIP] Handicap for "${nameCell.v}" — no matching user`);
        continue;
      }

      // Import current handicap
      const currentCell = ws[XLSX.utils.encode_cell({ r, c: CURRENT_COL })];
      // Import monthly values
      for (const { col, date } of monthDates) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
        if (!cell || cell.v == null || cell.v === '') continue;
        const val = Number(cell.v);
        if (isNaN(val)) continue;

        if (!DRY_RUN) {
          const { error } = await supabase.from('handicap_history').insert({
            id: randomUUID(),
            user_id: userId,
            handicap_index: val,
            effective_date: date,
            source: 'glide_import_ghin',
          });
          if (error && !error.message?.includes('duplicate')) {
            // Ignore duplicate inserts
          }
        }
        stats.handicaps++;
      }
    }
  }
  console.log(`  Imported ${stats.handicaps} handicap history records`);
}

// ══════════════════════════════════════════════════════════════
//  STEP 2: COURSES
// ══════════════════════════════════════════════════════════════
async function migrateCourses() {
  console.log('\n━━━ STEP 2: COURSES ━━━');
  const courses = getSheet('Courses').filter(r => r.Course && r.Tee);
  const archive = getSheet('Course Archive').filter(r => r.Course && r.Tee);

  // Deduplicate: keep the "Courses" version (newer), archive as fallback
  const byKey = new Map();

  for (const row of [...archive, ...courses]) {
    const key = `${row.Course}|${row.Tee}|${row.Type}`.toLowerCase();
    byKey.set(key, row);
  }

  console.log(`  Found ${byKey.size} unique course/tee combos (${courses.length} active + ${archive.length} archive, deduped)`);

  // Check existing courses
  const { data: existingCourses } = await supabase.from('courses').select('id, course_name, tee_name, type');
  const existingByKey = new Map();
  for (const c of (existingCourses || [])) {
    const key = `${c.course_name}|${c.tee_name}|${c.type}`.toLowerCase();
    existingByKey.set(key, c.id);
  }

  let added = 0, skipped = 0;
  const batchSize = 50;
  const rows = Array.from(byKey.values());

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const toInsert = [];

    for (const row of batch) {
      const courseType = mapCourseType(row.Type);
      const key = `${row.Course}|${row.Tee}|${row.Type}`.toLowerCase();
      const dbKey = `${row.Course}|${row.Tee}|${courseType}`.toLowerCase();
      // Also create composite key used in score records
      const compositeKey = `${row.Course} - ${row.Tee} (${row.Type})`.toLowerCase();

      if (existingByKey.has(dbKey)) {
        const existingId = existingByKey.get(dbKey);
        courseMap.set(key, existingId);
        courseMap.set(compositeKey, existingId);
        courseMap.set(dbKey, existingId);
        skipped++;
        continue;
      }

      const id = randomUUID();
      courseMap.set(key, id);

      // Also map the composite name format used in scores: "CourseName - Tee (Type)"
      courseMap.set(compositeKey, id);

      const addedByEmail = (row['Added By'] || '').toLowerCase().trim();

      toInsert.push({
        id,
        course_name: row.Course,
        tee_name: row.Tee,
        type: courseType,
        rating: num(row.Rating) || 72,
        slope: int(row.Slope) || 113,
        par: int(row.Par) || 72,
        created_by: userMap.get(addedByEmail) || null,
      });
    }

    if (toInsert.length > 0 && !DRY_RUN) {
      const { error } = await supabase.from('courses').insert(toInsert);
      if (error) {
        console.log(`    [ERROR] Course batch insert: ${error.message}`);
        // Try one-by-one
        for (const c of toInsert) {
          const { error: singleErr } = await supabase.from('courses').insert(c);
          if (singleErr) {
            console.log(`    [ERROR] Course "${c.course_name} - ${c.tee_name}": ${singleErr.message}`);
          } else {
            added++;
          }
        }
      } else {
        added += toInsert.length;
      }
    } else {
      added += toInsert.length;
    }
  }

  stats.courses = added;
  console.log(`  Added: ${added}, Skipped (existing): ${skipped}, Total mapped: ${courseMap.size}`);
}

// ══════════════════════════════════════════════════════════════
//  STEP 3: SEASONS & EVENTS
// ══════════════════════════════════════════════════════════════
async function migrateSeasonsAndEvents() {
  console.log('\n━━━ STEP 3: SEASONS & EVENTS ━━━');

  // Extract event data from Round History and Score Archive
  const roundHistory = getSheet('Round History').filter(r => r.Player && r.Player !== 'For Stats' && r.Event);
  const scoreArchive = getSheet('Score Archive').filter(r => r.Name && r['Event Name']);
  const currentScores = getSheet('Current Event Scores').filter(r => r.Name && r['Event Name']);

  // Collect all event numbers and their types
  const eventInfo = new Map(); // eventNumber → { type, dates[] }

  for (const row of roundHistory) {
    const evNum = int(row.Event);
    if (!evNum) continue;
    if (!eventInfo.has(evNum)) eventInfo.set(evNum, { types: new Set(), dates: [] });
    eventInfo.get(evNum).types.add(row['Event Type']);
    const dateStr = row['Round Date'];
    if (dateStr) eventInfo.get(evNum).dates.push(dateStr);
  }

  for (const row of [...scoreArchive, ...currentScores]) {
    const evNum = int(row['Event Name']);
    if (!evNum) continue;
    if (!eventInfo.has(evNum)) eventInfo.set(evNum, { types: new Set(), dates: [] });
    eventInfo.get(evNum).types.add(row['Event Type']);
    const dateStr = row['Formatted Created Dttm'];
    if (dateStr) eventInfo.get(evNum).dates.push(dateStr);
  }

  console.log(`  Found ${eventInfo.size} events: ${[...eventInfo.keys()].sort((a,b) => a-b).join(', ')}`);

  // Determine season year from the dates
  // Looking at dates, they're from 2025 season (3/3/25, 8/9/25, etc.)
  // But let's detect dynamically
  let seasonYear = 2025; // Default
  for (const [, info] of eventInfo) {
    for (const d of info.dates) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        seasonYear = parsed.getFullYear();
        if (seasonYear < 2000) seasonYear += 2000; // Handle 2-digit years like "25"
        break;
      }
    }
    if (seasonYear !== 2025) break;
  }

  console.log(`  Season year: ${seasonYear}`);

  // Check if season already exists
  const { data: existingSeasons } = await supabase.from('seasons').select('id, year');
  let seasonId = existingSeasons?.find(s => s.year === seasonYear)?.id;

  if (!seasonId) {
    seasonId = randomUUID();
    if (!DRY_RUN) {
      const { error } = await supabase.from('seasons').insert({
        id: seasonId,
        year: seasonYear,
        mode: 'regular_season',
      });
      if (error) console.log(`    [ERROR] Season insert: ${error.message}`);
      else stats.seasons++;
    }
    console.log(`  Created season ${seasonYear} → ${seasonId}`);
  } else {
    console.log(`  Season ${seasonYear} already exists → ${seasonId}`);
  }
  seasonMap.set(seasonYear, seasonId);

  // Check existing events
  const { data: existingEvents } = await supabase.from('events').select('id, event_number, season_id');
  const existingEventNums = new Set(
    (existingEvents || []).filter(e => e.season_id === seasonId).map(e => e.event_number)
  );

  // Create events
  for (const [evNum, info] of [...eventInfo.entries()].sort(([a],[b]) => a - b)) {
    if (existingEventNums.has(evNum)) {
      const existing = existingEvents.find(e => e.event_number === evNum && e.season_id === seasonId);
      eventMap.set(`${seasonId}:${evNum}`, existing.id);
      console.log(`  [SKIP] Event ${evNum} already exists → ${existing.id}`);
      continue;
    }

    // Determine type (most common in the set)
    const typeCode = [...info.types].filter(t => t)[0] || 'R18';
    const { is_major, is_playoff, holes } = mapEventType(typeCode);

    // Determine date range from score dates
    let minDate = null, maxDate = null;
    for (const d of info.dates) {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) continue;
      const iso = parsed.toISOString().split('T')[0];
      if (!minDate || iso < minDate) minDate = iso;
      if (!maxDate || iso > maxDate) maxDate = iso;
    }

    // If no dates found, estimate based on event number
    if (!minDate) {
      // Events are roughly 2-3 weeks apart starting in March
      const startMonth = 2; // March
      const estimatedDate = new Date(seasonYear, startMonth + (evNum - 1), 1);
      minDate = estimatedDate.toISOString().split('T')[0];
      maxDate = new Date(estimatedDate.getTime() + 14 * 86400000).toISOString().split('T')[0];
    }
    if (!maxDate) maxDate = minDate;

    // Give a 14-day window if start === end
    if (minDate === maxDate) {
      const start = new Date(minDate);
      // Start 3 days before first score, end 11 days after
      const s = new Date(start.getTime() - 3 * 86400000);
      const e = new Date(start.getTime() + 11 * 86400000);
      minDate = s.toISOString().split('T')[0];
      maxDate = e.toISOString().split('T')[0];
    }

    const eventId = randomUUID();
    eventMap.set(`${seasonId}:${evNum}`, eventId);

    if (!DRY_RUN) {
      const { error } = await supabase.from('events').insert({
        id: eventId,
        season_id: seasonId,
        event_number: evNum,
        name: `Event ${evNum}${is_major ? ' (Major)' : ''}${is_playoff ? ' (Playoff)' : ''}`,
        start_date: minDate,
        end_date: maxDate,
        holes,
        is_major,
        is_playoff,
      });
      if (error) console.log(`    [ERROR] Event ${evNum}: ${error.message}`);
      else stats.events++;
    }

    console.log(`  [ADD] Event ${evNum}: ${typeCode} ${minDate} → ${maxDate} (${is_major ? 'MAJOR' : is_playoff ? 'PLAYOFF' : 'regular'}) → ${eventId}`);
  }
}

// ══════════════════════════════════════════════════════════════
//  STEP 4: SCORES
// ══════════════════════════════════════════════════════════════
async function migrateScores() {
  console.log('\n━━━ STEP 4: SCORES ━━━');

  // Primary source: Round History (has the most complete data with points)
  const roundHistory = getSheet('Round History').filter(r =>
    r.Player && r.Player !== 'For Stats' && r.ID && r.Course
  );

  // Secondary: Score Archive (for scores without IDs in Round History)
  const scoreArchive = getSheet('Score Archive').filter(r => r.Name && r.ID);

  // Tertiary: Current Event Scores
  const currentScores = getSheet('Current Event Scores').filter(r => r.Name && r.ID);

  // Build a dedup set of score IDs we've processed
  const processedIds = new Set();

  // Get season ID
  const seasonId = seasonMap.values().next().value;

  console.log(`  Round History: ${roundHistory.length} scores`);
  console.log(`  Score Archive: ${scoreArchive.length} scores`);
  console.log(`  Current Event: ${currentScores.length} scores`);

  // Check existing scores
  const { data: existingScores } = await supabase.from('scores').select('id');
  const existingScoreIds = new Set((existingScores || []).map(s => s.id));

  // Helper to resolve course ID from the composite name string
  function resolveCourseId(courseStr) {
    if (!courseStr) return null;

    // Try direct lookup
    const directKey = courseStr.toLowerCase();
    if (courseMap.has(directKey)) return courseMap.get(directKey);

    // Parse "Course Name - Tee (Type)"
    const match = courseStr.match(/^(.+?)\s*-\s*(.+?)\s*\((.+?)\)$/);
    if (match) {
      const [, course, tee, type] = match;
      const key = `${course.trim()}|${tee.trim()}|${type.trim()}`.toLowerCase();
      if (courseMap.has(key)) return courseMap.get(key);
    }

    // Fuzzy: try just the composite
    for (const [key, id] of courseMap) {
      if (key.includes(courseStr.toLowerCase().substring(0, 30))) return id;
    }

    return null;
  }

  // Helper to resolve user ID from name or email
  function resolveUserId(nameOrEmail) {
    if (!nameOrEmail) return null;

    // Try as email first
    const asEmail = nameOrEmail.toLowerCase().trim();
    if (userMap.has(asEmail)) return userMap.get(asEmail);

    // Try as name — find matching user
    for (const [email, id] of userMap) {
      // We need to check against the full_name, but we don't have that easily
      // Instead, search by name in our data
    }

    return null;
  }

  // Build a name→email lookup from Members data
  const nameToEmail = new Map();
  const membersData = getSheet('Members').filter(r => r.Name && r['Email Address']);
  const inactiveData = getSheet('Inactive Members').filter(r => r.Name && r['Email Address']);
  for (const row of [...membersData, ...inactiveData]) {
    nameToEmail.set(row.Name.toLowerCase().trim(), (row['Email Address'] || '').toLowerCase().trim());
  }

  function resolveUserByName(name) {
    if (!name) return null;
    const email = nameToEmail.get(name.toLowerCase().trim());
    if (email && userMap.has(email)) return userMap.get(email);
    return null;
  }

  // Process Round History first (richest data)
  let added = 0, skipped = 0, errors = 0;

  for (const row of roundHistory) {
    const glideId = row.ID;
    if (!glideId || processedIds.has(glideId)) continue;
    if (existingScoreIds.has(glideId)) { skipped++; processedIds.add(glideId); continue; }

    const userId = resolveUserByName(row.Player);
    const courseId = resolveCourseId(row.Course);
    const eventNum = int(row.Event);
    const eventKey = eventNum ? `${seasonId}:${eventNum}` : null;
    const eventId = eventKey ? eventMap.get(eventKey) : null;

    if (!userId) {
      // console.log(`    [SKIP] No user for "${row.Player}"`);
      errors++;
      continue;
    }

    const grossScore = int(row['Gross Score']);
    const holesPlayed = int(row['# of Holes']);
    const par = int(row.Par);
    const netStrokesOverPar = int(row['Net Score']);
    const rating = num(row.Rating);
    const slope = int(row.Slope);
    const handicap = num(row.Handicap);

    // Calculate course handicap if we have the data
    let courseHandicap = null;
    if (handicap != null && slope != null) {
      courseHandicap = Math.round((handicap * slope) / 113);
    }

    // Net score = gross - course handicap
    let netScore = null;
    if (grossScore != null && courseHandicap != null) {
      netScore = grossScore - courseHandicap;
    }

    // Points
    const netPoints = num(row['Final Net Points']);

    // Date
    const dateStr = row['Round Date'];
    let createdAt = null;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        createdAt = parsed.toISOString();
      }
    }

    const scoreData = {
      id: glideId,
      user_id: userId,
      event_id: eventId,
      course_id: courseId || randomUUID(), // fallback — shouldn't happen often
      tee_time: createdAt,
      gross_score: grossScore,
      holes_played: holesPlayed,
      is_complete: grossScore != null && holesPlayed != null,
      course_handicap: courseHandicap,
      net_score: netScore,
      net_strokes_over_par: netStrokesOverPar,
      points_awarded: netPoints,
      is_retroactive: true, // Mark imported scores
      submitted_by: userId,
    };

    // Remove null course_id fallback if no course found
    if (!courseId) {
      errors++;
      continue;
    }

    processedIds.add(glideId);

    if (!DRY_RUN) {
      const { error } = await supabase.from('scores').insert(scoreData);
      if (error) {
        if (!error.message?.includes('duplicate')) {
          // console.log(`    [ERROR] Score ${glideId}: ${error.message}`);
          errors++;
        }
      } else {
        added++;
      }
    } else {
      added++;
    }
  }

  console.log(`  Round History: ${added} added, ${skipped} skipped, ${errors} errors`);

  // Process Score Archive (for any scores not already in Round History)
  let archiveAdded = 0, archiveSkipped = 0, archiveErrors = 0;

  for (const row of [...scoreArchive, ...currentScores]) {
    const glideId = row.ID;
    if (!glideId || processedIds.has(glideId)) { archiveSkipped++; continue; }
    if (existingScoreIds.has(glideId)) { archiveSkipped++; processedIds.add(glideId); continue; }

    const userId = resolveUserByName(row.Name) || resolveUserByName(row['Entered By Name']);
    const courseId = resolveCourseId(row['Course (optional)']);
    const eventNum = int(row['Event Name']);
    const eventKey = eventNum ? `${seasonId}:${eventNum}` : null;
    const eventId = eventKey ? eventMap.get(eventKey) : null;

    if (!userId || !courseId) {
      archiveErrors++;
      continue;
    }

    const grossScore = int(row['Actual Gross']) || int(row['Gross Score (optional)']);
    const holesPlayed = int(row['# of Holes']);
    const netStrokesOverPar = int(row['Projected Net']);
    const handicap = num(row.Handicap);
    const slope = int(row.Slope);

    let courseHandicap = null;
    if (handicap != null && slope != null) {
      courseHandicap = Math.round((handicap * slope) / 113);
    }

    let netScore = null;
    if (grossScore != null && courseHandicap != null) {
      netScore = grossScore - courseHandicap;
    }

    const netPoints = num(row['Net Event Points']);

    const dateIso = excelDateToISO(row['Created Date/Time']);

    const scoreData = {
      id: glideId,
      user_id: userId,
      event_id: eventId,
      course_id: courseId,
      tee_time: dateIso || row['Tee Time'] ? excelDateToISO(row['Tee Time']) : null,
      gross_score: grossScore,
      holes_played: holesPlayed,
      is_complete: grossScore != null && holesPlayed != null,
      course_handicap: courseHandicap,
      net_score: netScore,
      net_strokes_over_par: netStrokesOverPar,
      points_awarded: netPoints,
      is_retroactive: true,
      submitted_by: userId,
    };

    processedIds.add(glideId);

    if (!DRY_RUN) {
      const { error } = await supabase.from('scores').insert(scoreData);
      if (error) {
        if (!error.message?.includes('duplicate')) {
          archiveErrors++;
        }
      } else {
        archiveAdded++;
      }
    } else {
      archiveAdded++;
    }
  }

  stats.scores = added + archiveAdded;
  console.log(`  Archive+Current: ${archiveAdded} added, ${archiveSkipped} skipped, ${archiveErrors} errors`);
  console.log(`  TOTAL SCORES: ${stats.scores}`);
}

// ══════════════════════════════════════════════════════════════
//  STEP 5: PLAYOFF BRACKETS
// ══════════════════════════════════════════════════════════════
async function migratePlayoffs() {
  console.log('\n━━━ STEP 5: PLAYOFF BRACKETS ━━━');

  const playoffs = getSheet('Head to Head Playoffs').filter(r => r.Player && r.Flight);
  const seasonId = seasonMap.values().next().value;

  if (playoffs.length === 0 || !seasonId) {
    console.log('  No playoff data or no season — skipping');
    return;
  }

  // Build a name→email lookup
  const nameToEmail = new Map();
  const membersData = getSheet('Members').filter(r => r.Name && r['Email Address']);
  const inactiveData = getSheet('Inactive Members').filter(r => r.Name && r['Email Address']);
  for (const row of [...membersData, ...inactiveData]) {
    nameToEmail.set(row.Name.toLowerCase().trim(), (row['Email Address'] || '').toLowerCase().trim());
  }

  function resolveUser(name) {
    if (!name) return null;
    const email = nameToEmail.get(name.toLowerCase().trim());
    return email ? userMap.get(email) : null;
  }

  // Group by matchup: Round + Match → pair of players
  const matchups = new Map(); // "flight|round|match" → { players, winner, ... }

  for (const row of playoffs) {
    const flight = (row.Flight || '').toLowerCase().includes('championship') ? 'championship' : 'consolation';
    const round = int(row.Round);
    const match = row.Match ? row.Match.toString().replace(/\s*\(.*\)/, '').trim() : '1';
    const key = `${flight}|${round}|${match}`;

    if (!matchups.has(key)) {
      matchups.set(key, { flight, round, match: int(match) || 1, players: [], winner: null });
    }

    const m = matchups.get(key);
    const playerId = resolveUser(row.Player);
    if (playerId) m.players.push(playerId);

    // Check win/lose
    if (row['Win or Lose'] === 'Wins' || row['Win or Lose'] === 'Wins!') {
      m.winner = playerId;
    }
  }

  // Check existing brackets
  const { data: existingBrackets } = await supabase.from('playoff_brackets').select('id, season_id, round, matchup_number');
  const existingKeys = new Set(
    (existingBrackets || []).filter(b => b.season_id === seasonId)
      .map(b => `${b.round}:${b.matchup_number}`)
  );

  let added = 0;
  let matchupNum = 0;
  for (const [, m] of matchups) {
    matchupNum++;
    if (existingKeys.has(`${m.round}:${m.match}`)) continue;

    const bracketData = {
      id: randomUUID(),
      season_id: seasonId,
      flight: m.flight,
      round: m.round || 1,
      matchup_number: m.match || matchupNum,
      player1_id: m.players[0] || null,
      player2_id: m.players[1] || null,
      winner_id: m.winner || null,
    };

    if (!DRY_RUN) {
      const { error } = await supabase.from('playoff_brackets').insert(bracketData);
      if (error) {
        if (!error.message?.includes('duplicate')) {
          console.log(`    [ERROR] Bracket: ${error.message}`);
        }
      } else {
        added++;
      }
    } else {
      added++;
    }
  }

  stats.playoffs = added;
  console.log(`  Added ${added} playoff bracket matchups from ${matchups.size} unique matchups`);
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   MINERVA TOUR — GLIDE → SUPABASE MIGRATION        ║');
  console.log(`║   Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE — writing to database'}${DRY_RUN ? '  ' : ''}       ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await migrateUsers();
    await migrateCourses();
    await migrateSeasonsAndEvents();
    await migrateScores();
    await migratePlayoffs();

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   MIGRATION COMPLETE                                ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║   Users:     ${String(stats.users).padStart(6)}                              ║`);
    console.log(`║   Handicaps: ${String(stats.handicaps).padStart(6)}                              ║`);
    console.log(`║   Courses:   ${String(stats.courses).padStart(6)}                              ║`);
    console.log(`║   Seasons:   ${String(stats.seasons).padStart(6)}                              ║`);
    console.log(`║   Events:    ${String(stats.events).padStart(6)}                              ║`);
    console.log(`║   Scores:    ${String(stats.scores).padStart(6)}                              ║`);
    console.log(`║   Playoffs:  ${String(stats.playoffs).padStart(6)}                              ║`);
    console.log('╚══════════════════════════════════════════════════════╝');
  } catch (err) {
    console.error('\n[FATAL ERROR]', err);
    process.exit(1);
  }
}

main();
