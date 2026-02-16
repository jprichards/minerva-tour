/**
 * Backfill round dates from the Glide "Round History" sheet.
 *
 * Reads actual round dates from the xlsx and updates the tee_time field
 * on matching scores in the database.
 *
 * Matching strategy: player name + event number + gross score + course name substring
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const XLSX_PATH = resolve('docs/glide-app/Minerva Tour App.xlsx');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // 1. Read the xlsx Round History tab
  console.log('Reading xlsx...');
  const buf = await readFile(XLSX_PATH);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets['Round History'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 2. Parse real data rows (skip "For Stats" placeholder rows)
  const roundHistory = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const player = r[1];
    const dateStr = r[3];
    const eventNum = r[4];
    const course = r[5];
    const gross = r[8];

    if (!player || player === 'For Stats' || !dateStr) continue;

    // Parse date: format is "M/D/YY - H:MM AM/PM"
    let parsedDate = null;
    try {
      // Split "3/3/25 - 2:58 PM" into date and time parts
      const parts = dateStr.toString().split(' - ');
      const datePart = parts[0].trim(); // "3/3/25"
      const timePart = parts[1] ? parts[1].trim() : '12:00 PM';

      // Parse date part
      const [month, day, shortYear] = datePart.split('/').map(Number);
      const year = 2000 + shortYear;

      // Parse time part
      const timeMatch = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
      let hours = 0, minutes = 0;
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        const ampm = timeMatch[3].toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
      }

      parsedDate = new Date(year, month - 1, day, hours, minutes);
    } catch {
      console.warn(`  Could not parse date: "${dateStr}" for ${player}`);
      continue;
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) {
      console.warn(`  Invalid date: "${dateStr}" for ${player}`);
      continue;
    }

    roundHistory.push({
      player: player.trim(),
      date: parsedDate,
      eventNum: typeof eventNum === 'number' ? eventNum : parseInt(eventNum) || null,
      course: course.toString().trim(),
      gross: typeof gross === 'number' ? gross : parseInt(gross) || null,
    });
  }

  console.log(`Parsed ${roundHistory.length} rounds from xlsx`);

  // 3. Fetch all scores from database with user and event info
  const { data: scores, error } = await supabase
    .from('scores')
    .select('id, gross_score, user_id, event_id, tee_time, user:users!user_id(full_name), event:events(event_number), course:courses(course_name)');

  if (error) {
    console.error('Error fetching scores:', error);
    process.exit(1);
  }

  console.log(`Found ${scores.length} scores in database`);

  // 4. Match and update (track consumed scores to avoid double-matching)
  let matched = 0;
  let alreadySet = 0;
  let unmatched = 0;
  const updates = [];
  const consumedIds = new Set();

  for (const round of roundHistory) {
    // Find matching score by: player name + event number + gross score (excluding already consumed)
    const candidates = scores.filter(s => {
      if (consumedIds.has(s.id)) return false;
      const nameMatch = s.user?.full_name?.toLowerCase() === round.player.toLowerCase();
      const eventMatch = s.event?.event_number === round.eventNum;
      const grossMatch = s.gross_score === round.gross;
      return nameMatch && eventMatch && grossMatch;
    });

    if (candidates.length === 0) {
      console.warn(`  No match: ${round.player} | Event ${round.eventNum} | Gross ${round.gross} | ${round.course}`);
      unmatched++;
      continue;
    }

    // If multiple candidates, try to narrow by course name
    let best = candidates[0];
    if (candidates.length > 1) {
      // Extract the course name before the tee name in the xlsx format
      // e.g., "Walnut Creek Golf Preserve - 3 (18 Holes)" -> "Walnut Creek Golf Preserve"
      const xlsxCourseName = round.course.split(' - ')[0].toLowerCase().trim();
      const courseMatch = candidates.find(s =>
        s.course?.course_name?.toLowerCase().includes(xlsxCourseName) ||
        xlsxCourseName.includes(s.course?.course_name?.toLowerCase() || '')
      );
      if (courseMatch) {
        best = courseMatch;
      } else {
        console.warn(`  Multiple matches for ${round.player} Event ${round.eventNum} Gross ${round.gross}, using first`);
      }
    }

    // Mark as consumed so it can't be matched again
    consumedIds.add(best.id);

    if (best.tee_time) {
      alreadySet++;
      continue;
    }

    updates.push({
      id: best.id,
      tee_time: round.date.toISOString(),
      player: round.player,
      eventNum: round.eventNum,
      gross: round.gross,
    });
    matched++;
  }

  console.log(`\nMatched: ${matched}`);
  console.log(`Already had tee_time: ${alreadySet}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Updates to apply: ${updates.length}`);

  // 5. Apply updates
  if (updates.length > 0) {
    console.log('\nApplying updates...');
    let success = 0;
    let failed = 0;

    for (const u of updates) {
      const { error: updateError } = await supabase
        .from('scores')
        .update({ tee_time: u.tee_time })
        .eq('id', u.id);

      if (updateError) {
        console.error(`  Failed: ${u.player} Event ${u.eventNum} Gross ${u.gross}: ${updateError.message}`);
        failed++;
      } else {
        success++;
      }
    }

    console.log(`\nDone! Updated ${success} scores, ${failed} failures.`);
  }

  // 6. Verify: count scores still missing tee_time
  const { count } = await supabase
    .from('scores')
    .select('*', { count: 'exact', head: true })
    .is('tee_time', null);

  console.log(`\nScores still missing tee_time: ${count}`);
}

run().catch(console.error);
