/**
 * Import 2020 season data from the Glide "(2020) Minerva Tour App.xlsx".
 *
 * Differences from 2022-2024:
 *   - No "For Stats" placeholder rows
 *   - Event column contains strings like "Event 1 (18 Holes)",
 *     "Event 4 (18 Holes - Major)", "zEvent 12 (Championship - 36 Holes)"
 *   - Event number must be parsed from the string
 *   - Event type (Major, 9/18 holes) is embedded in the event name
 *
 * Usage:
 *   node scripts/import-2020-season.mjs [--dry-run]
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const XLSX_PATH = resolve('docs/glide-app/(2020) Minerva Tour App.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEASON_YEAR = 2020;

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  try {
    const parts = dateStr.toString().split(' - ');
    const datePart = parts[0].trim();
    const timePart = parts[1] ? parts[1].trim() : '12:00 PM';
    const [month, day, shortYear] = datePart.split('/').map(Number);
    const year = 2000 + shortYear;
    const timeMatch = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let hours = 0, minutes = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    }
    const d = new Date(year, month - 1, day, hours, minutes);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch { return null; }
}

/**
 * Parse event string like:
 *   "Event 1 (18 Holes)" -> { num: 1, isMajor: false, holes: 18 }
 *   "Event 4 (18 Holes - Major)" -> { num: 4, isMajor: true, holes: 18 }
 *   "zEvent 12 (Championship - 36 Holes)" -> { num: 12, isMajor: true, holes: 18 }
 *   "zEvent 10 (Major - 18 Holes)" -> { num: 10, isMajor: true, holes: 18 }
 */
function parseEventString(evStr) {
  if (!evStr) return null;
  const s = evStr.toString().trim();
  // Extract event number
  const numMatch = s.match(/Event\s*(\d+)/i);
  if (!numMatch) return null;
  const num = parseInt(numMatch[1]);

  const lower = s.toLowerCase();
  const isMajor = lower.includes('major') || lower.includes('championship');
  const isPlayoff = lower.includes('playoff');

  // Determine holes from the string or from the event type column
  let holes = 18;
  const holeMatch = s.match(/(\d+)\s*Holes?/i);
  if (holeMatch) holes = parseInt(holeMatch[1]);
  if (holes === 36) holes = 18; // 36-hole championship treated as 18

  return { num, isMajor, isPlayoff, holes };
}

function parseCourseString(courseStr) {
  if (!courseStr) return null;
  const holeMatch = courseStr.match(/\((\d+)\s*Holes?\)\s*$/i);
  let holeType = '18_holes';
  let rest = courseStr;
  if (holeMatch) {
    holeType = parseInt(holeMatch[1]) === 9 ? '9_holes' : '18_holes';
    rest = courseStr.slice(0, holeMatch.index).trim();
  }
  const dashParts = rest.split(' - ');
  if (dashParts.length >= 2) {
    const teeName = dashParts[dashParts.length - 1].trim();
    const courseName = dashParts.slice(0, -1).join(' - ').trim();
    return { courseName, teeName, holeType };
  }
  return { courseName: rest.trim(), teeName: 'Default', holeType };
}

function calculateCourseHandicap(handicapIndex, slope) {
  return Math.round((handicapIndex * slope) / 113);
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE IMPORT ===');
  console.log(`Importing ${SEASON_YEAR} season data\n`);

  const buf = await readFile(XLSX_PATH);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets['Round History'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const roundData = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const player = r[1];
    if (!player || !player.toString().trim()) continue;

    const dateStr = r[3];
    const parsedDate = parseDateStr(dateStr);
    if (!parsedDate) {
      console.warn(`  Skipping row ${i}: unparseable date "${dateStr}" for ${player}`);
      continue;
    }

    const eventStr = r[4] ? r[4].toString().trim() : '';
    const parsedEvent = parseEventString(eventStr);
    if (!parsedEvent) {
      console.warn(`  Skipping row ${i}: unparseable event "${eventStr}" for ${player}`);
      continue;
    }

    const courseStr = r[5] ? r[5].toString().trim() : '';
    const parsed = parseCourseString(courseStr);
    if (!parsed) {
      console.warn(`  Skipping row ${i}: unparseable course "${courseStr}"`);
      continue;
    }

    roundData.push({
      player: player.toString().trim(),
      handicap: typeof r[2] === 'number' ? r[2] : parseFloat(r[2]) || 0,
      date: parsedDate,
      eventNum: parsedEvent.num,
      eventIsMajor: parsedEvent.isMajor,
      eventIsPlayoff: parsedEvent.isPlayoff,
      eventHoles: parsedEvent.holes,
      courseStr,
      courseName: parsed.courseName,
      teeName: parsed.teeName,
      holeType: parsed.holeType,
      rating: typeof r[6] === 'number' ? r[6] : parseFloat(r[6]) || 0,
      slope: typeof r[7] === 'number' ? r[7] : parseInt(r[7]) || 113,
      grossScore: typeof r[8] === 'number' ? r[8] : parseInt(r[8]) || null,
      holesPlayed: typeof r[9] === 'number' ? r[9] : parseInt(r[9]) || null,
      par: typeof r[10] === 'number' ? r[10] : parseInt(r[10]) || null,
      eventType: r[13] ? r[13].toString().trim() : 'R18',
      finalNetPoints: typeof r[19] === 'number' ? r[19] : parseFloat(r[19]) || null,
    });
  }

  console.log(`Parsed ${roundData.length} rounds from xlsx\n`);

  const { data: seasonRows } = await supabase.from('seasons').select('*').eq('year', SEASON_YEAR);
  if (!seasonRows || seasonRows.length === 0) { console.error(`No ${SEASON_YEAR} season found.`); process.exit(1); }
  const season = seasonRows[0];
  console.log(`Season: ${season.year} (${season.id})`);

  const { data: users } = await supabase.from('users').select('id, full_name').in('role', ['admin', 'member']);
  const nameMap = {};
  for (const u of users) { if (u.full_name) nameMap[u.full_name.toLowerCase().trim()] = u.id; }

  const unmatchedPlayers = new Set();
  for (const rd of roundData) { if (!nameMap[rd.player.toLowerCase()]) unmatchedPlayers.add(rd.player); }
  if (unmatchedPlayers.size > 0) console.warn(`\nUnmatched players: ${[...unmatchedPlayers].join(', ')}\n`);

  // Build events from parsed event data
  const eventMap = new Map();
  for (const rd of roundData) {
    if (rd.eventNum == null) continue;
    if (!eventMap.has(rd.eventNum)) {
      eventMap.set(rd.eventNum, {
        dates: [], isMajor: rd.eventIsMajor, isPlayoff: rd.eventIsPlayoff,
        holes: rd.eventHoles, eventType: rd.eventType,
      });
    }
    eventMap.get(rd.eventNum).dates.push(rd.date);
  }

  const { data: existingEvents } = await supabase.from('events').select('*').eq('season_id', season.id);
  const existingEventMap = new Map();
  if (existingEvents) for (const e of existingEvents) existingEventMap.set(e.event_number, e);

  console.log(`\n--- Events ---`);
  console.log(`Found ${eventMap.size} events in xlsx, ${existingEventMap.size} already in DB`);

  const eventIdMap = new Map();
  for (const [eventNum, info] of [...eventMap.entries()].sort((a, b) => a[0] - b[0])) {
    const sortedDates = info.dates.sort((a, b) => a - b);
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    const isMajor = info.isMajor || info.eventType === 'M';
    const holes = info.holes === 9 ? 9 : 18;

    if (existingEventMap.has(eventNum)) {
      eventIdMap.set(eventNum, existingEventMap.get(eventNum).id);
      console.log(`  Event ${eventNum}: already exists`);
      continue;
    }

    console.log(`  Event ${eventNum}: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} | ${holes}h | ${isMajor ? 'MAJOR' : 'regular'}${info.isPlayoff ? ' (playoff)' : ''}`);

    if (!DRY_RUN) {
      const { data: inserted, error } = await supabase.from('events').insert({
        season_id: season.id, event_number: eventNum,
        name: `Event ${eventNum}${isMajor ? ' (Major)' : ''}`,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        holes, is_major: isMajor, is_playoff: info.isPlayoff || false,
      }).select().single();
      if (error) console.error(`    FAILED: ${error.message}`);
      else eventIdMap.set(eventNum, inserted.id);
    }
  }

  if (!DRY_RUN) {
    const { data: allEvents } = await supabase.from('events').select('*').eq('season_id', season.id);
    if (allEvents) for (const e of allEvents) eventIdMap.set(e.event_number, e.id);
  }

  const { data: allCourses } = await supabase.from('courses').select('id, course_name, tee_name, rating, slope, par, type');
  const courseIndex = new Map();
  for (const c of allCourses) courseIndex.set(`${c.course_name.toLowerCase()}|${c.tee_name.toLowerCase()}`, c);

  console.log(`\n--- Courses ---`);
  console.log(`${allCourses.length} courses in DB`);

  const courseIdCache = new Map();
  let coursesCreated = 0, coursesMatched = 0;

  for (const rd of roundData) {
    if (courseIdCache.has(rd.courseStr)) continue;
    const key = `${rd.courseName.toLowerCase()}|${rd.teeName.toLowerCase()}`;
    const existing = courseIndex.get(key);
    if (existing) { courseIdCache.set(rd.courseStr, existing.id); coursesMatched++; continue; }
    let fuzzy = null;
    for (const [k, v] of courseIndex) { if (k.startsWith(rd.courseName.toLowerCase() + '|')) { fuzzy = v; break; } }
    if (fuzzy) console.log(`  Creating tee variant: ${rd.courseName} - ${rd.teeName}`);
    else console.log(`  Creating new course: ${rd.courseName} - ${rd.teeName} | R:${rd.rating} S:${rd.slope} P:${rd.par}`);
    if (!DRY_RUN) {
      const { data: newCourse, error } = await supabase.from('courses').insert({
        course_name: rd.courseName, tee_name: rd.teeName, type: rd.holeType,
        rating: rd.rating, slope: rd.slope, par: rd.par || (rd.holeType === '9_holes' ? 36 : 72),
      }).select().single();
      if (error) console.error(`    FAILED: ${error.message}`);
      else { courseIdCache.set(rd.courseStr, newCourse.id); courseIndex.set(key, newCourse); coursesCreated++; }
    } else coursesCreated++;
  }
  console.log(`  Matched: ${coursesMatched}, Created: ${coursesCreated}`);

  const { data: existingScores } = await supabase.from('scores').select('id, user_id, event_id, gross_score').in('event_id', [...eventIdMap.values()].filter(Boolean));
  const existingScoreSet = new Set();
  if (existingScores) for (const s of existingScores) existingScoreSet.add(`${s.user_id}|${s.event_id}|${s.gross_score}`);

  console.log(`\n--- Scores ---`);
  const scoreInserts = [];
  let skippedNoUser = 0, skippedNoEvent = 0, skippedNoCourse = 0, skippedDuplicate = 0;

  for (const rd of roundData) {
    const userId = nameMap[rd.player.toLowerCase()];
    if (!userId) { skippedNoUser++; continue; }
    const eventId = rd.eventNum != null ? eventIdMap.get(rd.eventNum) : null;
    if (!eventId) { skippedNoEvent++; continue; }
    const courseId = courseIdCache.get(rd.courseStr);
    if (!courseId) { skippedNoCourse++; continue; }
    const dupeKey = `${userId}|${eventId}|${rd.grossScore}`;
    if (existingScoreSet.has(dupeKey)) { skippedDuplicate++; continue; }

    const maxHoles = rd.holeType === '9_holes' ? 9 : 18;
    const holesPlayed = rd.holesPlayed || maxHoles;
    let courseHandicap = null, netScore = null, netStrokesOverPar = null;
    if (rd.grossScore != null && rd.handicap != null) {
      const fullCH = calculateCourseHandicap(rd.handicap, rd.slope);
      if (holesPlayed < maxHoles) {
        courseHandicap = Math.round(fullCH * (holesPlayed / maxHoles));
        const partialPar = Math.round((rd.par || maxHoles * 4) * (holesPlayed / maxHoles));
        netScore = rd.grossScore - courseHandicap;
        netStrokesOverPar = Math.round(netScore - partialPar);
      } else {
        courseHandicap = fullCH;
        netScore = rd.grossScore - courseHandicap;
        netStrokesOverPar = Math.round(rd.grossScore - courseHandicap - rd.rating);
      }
    }
    scoreInserts.push({
      user_id: userId, event_id: eventId, course_id: courseId,
      tee_time: rd.date.toISOString(), gross_score: rd.grossScore,
      holes_played: holesPlayed, is_complete: rd.grossScore != null,
      course_handicap: courseHandicap, net_score: netScore,
      net_strokes_over_par: netStrokesOverPar, points_awarded: rd.finalNetPoints,
      is_retroactive: true,
    });
  }

  console.log(`Prepared ${scoreInserts.length} scores to insert`);
  console.log(`  Skipped - no user: ${skippedNoUser}, no event: ${skippedNoEvent}, no course: ${skippedNoCourse}, duplicate: ${skippedDuplicate}`);

  if (!DRY_RUN && scoreInserts.length > 0) {
    console.log('\nInserting scores...');
    const batchSize = 50;
    let inserted = 0, failed = 0;
    for (let i = 0; i < scoreInserts.length; i += batchSize) {
      const batch = scoreInserts.slice(i, i + batchSize);
      const { error } = await supabase.from('scores').insert(batch);
      if (error) { console.error(`  Batch failed: ${error.message}`); failed += batch.length; }
      else inserted += batch.length;
    }
    console.log(`  Inserted: ${inserted}, Failed: ${failed}`);
  }

  if (!DRY_RUN) {
    const eventIds = [...eventIdMap.values()].filter(Boolean);
    const { data: ev } = await supabase.from('events').select('id').eq('season_id', season.id);
    const { data: sc } = await supabase.from('scores').select('id').in('event_id', eventIds);
    console.log(`\n--- Verification ---`);
    console.log(`${SEASON_YEAR} events: ${(ev||[]).length}, scores: ${(sc||[]).length}`);
  }
  console.log('\nDone!');
}

run().catch(console.error);
