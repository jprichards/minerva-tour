#!/usr/bin/env node

/**
 * Reimport historical score data (2018-2025) from Glide Excel sheets.
 *
 * Fields imported from Glide (source of truth for historical data):
 *  - Gross Score
 *  - Net Over Par (net_strokes_over_par)
 *  - Scratch Over Rating (scratch_strokes_over_rating)
 *  - Net Event Points (points_awarded)
 *  - Scratch Event Points (scratch_points_awarded)
 *  - Handicap Index Used (handicap_index_used)
 *  - course_handicap: Back-calculated as gross - NOP - par
 *  - net_score: gross - course_handicap
 *
 * Data sources per commissioner's guidance:
 *  - Net Score (net over par):  Round History "Net Score" (source of truth)
 *  - Gross Score:               Score Archive "Gross Score (optional)" → fallback "Over Par" + "Par"
 *                               Round Data "Gross Score" (2018-2019)
 *  - Scratch Score:             Round History "Scratch Score" (2020-2025)
 *                               Calculated: Gross - ROUND(Rating - Par) - Par (2018-2019)
 *  - Net Points:                Round History "Final Net Points" (2020-2025)
 *                               Round Data "Points" (2018-2019)
 *  - Scratch Points:            "Scores + Points" tab (2020-2025 only)
 *
 * Usage:
 *   node scripts/reimport-glide-scores.mjs --dry-run     Preview changes
 *   node scripts/reimport-glide-scores.mjs               Apply changes
 *   node scripts/reimport-glide-scores.mjs --verify      Post-import verification
 *   node scripts/reimport-glide-scores.mjs --year 2024   Single year only
 */

import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_MODE = process.argv.includes('--verify');
const YEAR_FILTER = (() => {
  const idx = process.argv.indexOf('--year');
  return idx >= 0 ? Number(process.argv[idx + 1]) : null;
})();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/;

// ─── Year configurations ──────────────────────────────────────────────────────

const YEAR_CONFIGS = [
  { year: 2025, file: 'docs/glide-app/(2025) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'ID' },
  { year: 2024, file: 'docs/glide-app/(2024) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'ID' },
  { year: 2023, file: 'docs/glide-app/(2023) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'Last Updated By' },
  { year: 2022, file: 'docs/glide-app/(2022) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'Last Updated By' },
  { year: 2021, file: 'docs/glide-app/(2021) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'Last Updated By' },
  { year: 2020, file: 'docs/glide-app/(2020) Minerva Tour App.xlsx', type: 'sa_rh', saIdCol: 'ID' },
  { year: 2019, file: 'docs/glide-app/(2019) Minerva Tour Stats and Scores.xlsx', type: 'round_data' },
  { year: 2018, file: 'docs/glide-app/(2018) Minerva Tour Stats and Scores.xlsx', type: 'round_data' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEventNumber(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const m = val.match(/Event\s+(\d+)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function getGrossFromSa(sa) {
  const optionalGross = sa['Gross Score (optional)'];
  if (typeof optionalGross === 'number' && optionalGross > 0) return optionalGross;

  const overPar = sa['Over Par'];
  const par = sa['Par'];
  const thru = sa['Thru'];
  const holes = sa['# of Holes'];
  if (typeof overPar === 'number' && typeof par === 'number' && thru === holes) {
    return par + overPar;
  }

  const actualGross = sa['Actual Gross'];
  if (typeof actualGross === 'number' && actualGross > 0) return actualGross;

  return null;
}

function normalizeCourseName(name) {
  return (name || '').toLowerCase()
    .replace(/\s*\(\d+\s*holes?\)\s*/gi, '')
    .replace(/\s*\(front\s*9\)\s*/gi, '')
    .replace(/\s*\(back\s*9\)\s*/gi, '')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function courseTypeFromGlideName(name) {
  const lower = (name || '').toLowerCase();
  if (/front\s*9/i.test(lower)) return 'front_9';
  if (/back\s*9/i.test(lower)) return 'back_9';
  return null;
}

function roundHalfAwayFromZero(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

function calculateScratchFromGross(gross, rating, par) {
  if (gross == null || rating == null || par == null) return null;
  return gross - roundHalfAwayFromZero(rating - par) - par;
}

// ─── Load DB reference data ───────────────────────────────────────────────────

async function loadDbData() {
  const { data: users } = await supabase.from('users').select('id, full_name');
  const { data: seasons } = await supabase.from('seasons').select('id, year');
  const { data: events } = await supabase.from('events').select('id, event_number, season_id');

  let allCourses = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('courses').select('id, course_name, tee_name, type, par, slope, rating').range(from, from + 999);
    allCourses.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  let allScores = [];
  from = 0;
  while (true) {
    const { data } = await supabase
      .from('scores')
      .select('id, user_id, event_id, course_id, gross_score, net_score, net_strokes_over_par, course_handicap, holes_played, handicap_index_used, combined_with_score_id, points_awarded, scratch_strokes_over_rating, scratch_points_awarded')
      .range(from, from + 999);
    allScores.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const seasonMap = Object.fromEntries(seasons.map(s => [s.id, s.year]));
  const userNameById = Object.fromEntries(users.map(u => [u.id, u.full_name]));
  const userIdByName = Object.fromEntries(users.map(u => [u.full_name.toLowerCase(), u.id]));
  const courseById = Object.fromEntries(allCourses.map(c => [c.id, c]));

  const eventInfo = {};
  for (const e of events) {
    eventInfo[e.id] = { event_number: e.event_number, year: seasonMap[e.season_id] };
  }

  const eventIdByYearNum = {};
  for (const e of events) {
    const year = seasonMap[e.season_id];
    eventIdByYearNum[`${year}|${e.event_number}`] = e.id;
  }

  return { users, userNameById, userIdByName, courseById, allCourses, allScores, eventInfo, eventIdByYearNum };
}

// ─── Load Scores + Points tab ─────────────────────────────────────────────────

function loadScoresPointsData(wb) {
  const spSheet = wb.Sheets['Scores + Points'];
  if (!spSheet) return new Map();

  const spRows = XLSX.utils.sheet_to_json(spSheet, { defval: null });
  if (spRows.length === 0) return new Map();

  const colNames = Object.keys(spRows[0]);

  // Find ID column: first column whose sample values look like UUIDs
  let idCol = null;
  for (const name of colNames) {
    const sampleVals = spRows.slice(0, 10).map(r => String(r[name] || ''));
    if (sampleVals.some(v => UUID_RE.test(v))) {
      idCol = name;
      break;
    }
  }
  if (!idCol) {
    console.log('    Scores+Points: could not find ID column');
    return new Map();
  }

  // Find scratch points column (contains "scratch" and "point" in name)
  const scratchPtsCol = colNames.find(name =>
    /scratch/i.test(name) && /point/i.test(name)
  );

  // Find net points column (contains "net" and "point" but not "scratch")
  const netPtsCol = colNames.find(name =>
    /net/i.test(name) && /point/i.test(name) && !/scratch/i.test(name)
  );

  console.log(`    Scores+Points: ID="${idCol}", scratchPts="${scratchPtsCol || 'NOT FOUND'}", netPts="${netPtsCol || 'NOT FOUND'}"`);

  const byId = new Map();
  for (const sp of spRows) {
    const id = sp[idCol];
    if (!id || !UUID_RE.test(String(id))) continue;
    byId.set(String(id), {
      scratchPoints: scratchPtsCol && typeof sp[scratchPtsCol] === 'number' ? sp[scratchPtsCol] : null,
      netPoints: netPtsCol && typeof sp[netPtsCol] === 'number' ? sp[netPtsCol] : null,
    });
  }

  console.log(`    Scores+Points: ${byId.size} rows indexed`);
  return byId;
}

// ─── Load Glide data ─────────────────────────────────────────────────────────

function loadSaRhData(filePath, saIdCol) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf);

  const saRows = XLSX.utils.sheet_to_json(wb.Sheets['Score Archive'], { defval: null });
  const rhRaw = XLSX.utils.sheet_to_json(wb.Sheets['Round History'], { defval: null });
  const rhRows = rhRaw.filter(r =>
    r['Player'] && r['Player'] !== 'For Stats' &&
    typeof r['Gross Score'] === 'number' &&
    UUID_RE.test(String(r['ID'] || '')),
  );

  const saByUuid = new Map();
  for (const sa of saRows) {
    const uuid = sa[saIdCol];
    if (uuid && UUID_RE.test(String(uuid))) {
      saByUuid.set(uuid, sa);
    }
  }

  // Log available RH columns for first row (diagnostic)
  if (rhRows.length > 0) {
    const rhCols = Object.keys(rhRows[0]);
    const hasScratch = rhCols.some(c => /scratch/i.test(c));
    const hasNetPts = rhCols.some(c => /final.*net.*point/i.test(c));
    const hasHandicap = rhCols.includes('Handicap');
    const hasRating = rhCols.includes('Rating');
    console.log(`    RH columns: scratch=${hasScratch}, netPoints=${hasNetPts}, handicap=${hasHandicap}, rating=${hasRating}`);
  }

  const joined = [];
  for (const rh of rhRows) {
    const sa = saByUuid.get(rh['ID']);
    if (!sa) continue;

    const grossFromSa = getGrossFromSa(sa);
    const netOverPar = rh['Net Score'];
    if (typeof netOverPar !== 'number') continue;

    const eventNum = parseEventNumber(rh['Event']);
    const playerName = rh['Player'];
    const holesConfig = rh['# of Holes'] || 18;
    const thru = rh['Thru'];
    const par = rh['Par'] || (holesConfig === 9 ? 36 : 72);
    const courseName = rh['Course'] || sa['Course (optional)'] || '';

    // Scratch score from RH
    const scratchScore = typeof rh['Scratch Score'] === 'number' ? rh['Scratch Score'] : null;

    // Net points from RH "Final Net Points"
    const netPoints = typeof rh['Final Net Points'] === 'number' ? rh['Final Net Points'] : null;

    // Scratch points from RH "Final Scratch Points"
    const scratchPoints = typeof rh['Final Scratch Points'] === 'number' ? rh['Final Scratch Points'] : null;

    // Handicap index from RH
    const handicapIndex = typeof rh['Handicap'] === 'number' ? rh['Handicap'] : null;

    // Rating from RH (for aggregate summary)
    const rating = typeof rh['Rating'] === 'number' ? rh['Rating'] : null;

    joined.push({
      uuid: rh['ID'],
      playerName,
      eventNum,
      grossScore: grossFromSa,
      netOverPar,
      scratchScore,
      netPoints,
      scratchPoints,
      handicapIndex,
      rating,
      holesConfig,
      holesPlayed: typeof thru === 'number' ? thru : holesConfig,
      par,
      courseName,
      saProjectedNet: typeof sa['Projected Net'] === 'number' ? sa['Projected Net'] : null,
      saOverPar: typeof sa['Over Par'] === 'number' ? sa['Over Par'] : null,
      saPar: typeof sa['Par'] === 'number' ? sa['Par'] : null,
      saHoles: sa['# of Holes'],
      saCourseName: sa['Course (optional)'] || '',
    });
  }

  return joined;
}

function loadRoundData(filePath) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf);
  const rdRows = XLSX.utils.sheet_to_json(wb.Sheets['Round Data'], { defval: null });

  // Log available columns (diagnostic)
  if (rdRows.length > 0) {
    const cols = Object.keys(rdRows[0]);
    console.log(`    Round Data columns: ${cols.join(', ')}`);
  }

  const results = [];
  for (const rd of rdRows) {
    if (typeof rd['Gross Score'] !== 'number') continue;
    if (rd['Score Type'] === 'for stats') continue;

    const eventNum = parseEventNumber(rd['Event']);
    const playerName = rd['Player'];
    const holesConfig = rd['# of Holes'] || 18;
    const par = rd['Par'] || (holesConfig === 9 ? 36 : 72);
    const netOverPar = typeof rd['Net Score'] === 'number' ? rd['Net Score'] : null;

    // Rating from Round Data
    const rating = typeof rd['Rating'] === 'number' ? rd['Rating'] : null;

    // Deterministic scratch calculation for 2018-2019
    const scratchScore = calculateScratchFromGross(rd['Gross Score'], rating, par);

    // Net points from Round Data "Points" column
    const netPoints = typeof rd['Points'] === 'number' ? rd['Points'] : null;

    // Handicap index from Round Data
    const handicapIndex = typeof rd['Handicap'] === 'number' ? rd['Handicap']
      : (typeof rd['Handicap'] === 'string' ? parseFloat(rd['Handicap']) || null : null);

    results.push({
      uuid: null,
      playerName,
      eventNum,
      grossScore: rd['Gross Score'],
      netOverPar,
      scratchScore,
      netPoints,
      scratchPoints: null,
      handicapIndex,
      rating,
      holesConfig,
      holesPlayed: holesConfig,
      par,
      courseName: rd['Course'] || '',
      saProjectedNet: null,
      saOverPar: null,
      saPar: null,
      saHoles: null,
      saCourseName: '',
    });
  }
  return results;
}

// ─── DB Score Indexing ────────────────────────────────────────────────────────

function buildDbScoreIndex(scores, eventInfo, userNameById, courseById) {
  const byUuid = new Map();
  const byUserEvent = new Map();

  for (const s of scores) {
    if (s.gross_score == null) continue;
    const ei = eventInfo[s.event_id];
    if (!ei) continue;

    byUuid.set(s.id, s);

    const userEventKey = `${(userNameById[s.user_id] || '').toLowerCase()}|${ei.year}|${ei.event_number}`;
    if (!byUserEvent.has(userEventKey)) byUserEvent.set(userEventKey, []);
    byUserEvent.get(userEventKey).push(s);
  }

  return { byUuid, byUserEvent };
}

// ─── Matching & Processing ───────────────────────────────────────────────────

function processYear(year, glideRows, index, db, uuidMatchYear) {
  const stats = { matched: 0, unmatched: 0, changed: 0, unchanged: 0, skippedMulti: 0, changes: [], unmatchedRows: [] };

  const glideByPlayerEvent = new Map();
  for (const g of glideRows) {
    if (g.eventNum == null) continue;
    const key = `${g.playerName.toLowerCase()}|${year}|${g.eventNum}`;
    if (!glideByPlayerEvent.has(key)) glideByPlayerEvent.set(key, []);
    glideByPlayerEvent.get(key).push(g);
  }

  const processedScoreIds = new Set();

  for (const [key, glideEntries] of glideByPlayerEvent) {
    const dbEntries = index.byUserEvent.get(key) || [];
    if (dbEntries.length === 0) {
      stats.unmatched += glideEntries.length;
      stats.unmatchedRows.push(...glideEntries);
      continue;
    }

    if (glideEntries.length === 1 && dbEntries.length === 1) {
      const g = glideEntries[0];
      const s = dbEntries[0];

      if (year === uuidMatchYear && g.uuid && index.byUuid.has(g.uuid)) {
        const uuidMatch = index.byUuid.get(g.uuid);
        processScoreUpdate(g, uuidMatch, g.par, g.netOverPar, stats, db, year);
        processedScoreIds.add(uuidMatch.id);
      } else {
        processScoreUpdate(g, s, g.par, g.netOverPar, stats, db, year);
        processedScoreIds.add(s.id);
      }
      continue;
    }

    if (glideEntries.length === 1 && dbEntries.length > 1) {
      stats.skippedMulti += dbEntries.length;
      continue;
    }

    if (glideEntries.length > 1 && dbEntries.length > 1) {
      matchMultiRounds(glideEntries, dbEntries, stats, db, year, index);
      continue;
    }

    if (glideEntries.length > 1 && dbEntries.length === 1) {
      stats.unmatched += glideEntries.length;
      stats.unmatchedRows.push(...glideEntries);
      continue;
    }
  }

  for (const g of glideRows) {
    if (g.eventNum != null) continue;
    matchNonEventScore(g, year, index, db, stats, processedScoreIds);
  }

  return stats;
}

function matchMultiRounds(glideEntries, dbEntries, stats, db, year, index) {
  const usedDbIds = new Set();

  for (const g of glideEntries) {
    const gNorm = normalizeCourseName(g.saCourseName || g.courseName);
    const gType = courseTypeFromGlideName(g.saCourseName || g.courseName);

    let bestMatch = null;
    let bestScore = -1;

    for (const s of dbEntries) {
      if (usedDbIds.has(s.id)) continue;
      if (s.gross_score !== g.grossScore) continue;

      const course = db.courseById[s.course_id];
      const dbCourseStr = course ? `${course.course_name} ${course.tee_name}`.toLowerCase() : '';
      const dbType = course?.type || '';

      let score = 1;
      if (gType && dbType === gType) score += 10;
      if (gNorm && dbCourseStr.includes(gNorm.split(' ')[0])) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = s;
      }
    }

    if (bestMatch) {
      usedDbIds.add(bestMatch.id);
      const nop = g.saProjectedNet != null ? g.saProjectedNet : g.netOverPar;
      const par = g.saPar || g.par;
      processScoreUpdate(g, bestMatch, par, nop, stats, db, year);
    } else {
      stats.unmatched++;
      stats.unmatchedRows.push(g);
    }
  }
}

function matchNonEventScore(g, year, index, db, stats, processedScoreIds) {
  const nameKey = g.playerName.toLowerCase();
  const userId = db.userIdByName[nameKey];
  if (!userId) { stats.unmatched++; stats.unmatchedRows.push(g); return; }

  for (const s of db.allScores) {
    if (processedScoreIds.has(s.id)) continue;
    if (s.user_id !== userId) continue;
    if (s.gross_score !== g.grossScore) continue;

    const ei = db.eventInfo[s.event_id];
    if (!ei || ei.year !== year) continue;

    const course = db.courseById[s.course_id];
    const dbCourseStr = course ? `${course.course_name}`.toLowerCase() : '';
    const gNorm = normalizeCourseName(g.courseName);

    if (gNorm && dbCourseStr.includes(gNorm.split(' ')[0])) {
      processedScoreIds.add(s.id);
      processScoreUpdate(g, s, g.par, g.netOverPar, stats, db, year);
      return;
    }
  }

  stats.unmatched++;
  stats.unmatchedRows.push(g);
}

const HIGH_CH_BYPASS = new Set([
  'michael stratton', 'jay kornder', 'marc mastrangelo',
]);

const CORE_FIELDS = ['gross_score', 'net_strokes_over_par', 'course_handicap', 'net_score'];
const NEW_FIELDS = ['scratch_strokes_over_rating', 'scratch_points_awarded', 'points_awarded', 'handicap_index_used'];

function processScoreUpdate(glideRow, dbScore, glidePar, glideNop, stats, db, year) {
  if (glideRow.grossScore == null || glideNop == null) {
    stats.unmatched++;
    stats.unmatchedRows.push(glideRow);
    return;
  }

  const grossScore = glideRow.grossScore;
  const courseHandicap = grossScore - glideNop - glidePar;
  const netScore = grossScore - courseHandicap;

  const playerName = (db.userNameById[dbScore.user_id] || '').toLowerCase();
  const isBypassPlayer = HIGH_CH_BYPASS.has(playerName);

  if ((!isBypassPlayer && (courseHandicap < -5 || courseHandicap > 45)) ||
      (isBypassPlayer && (courseHandicap < -5 || courseHandicap > 65))) {
    stats.skippedSanity = (stats.skippedSanity || 0) + 1;
    if (!stats.sanitySkips) stats.sanitySkips = [];
    stats.sanitySkips.push({
      player: db.userNameById[dbScore.user_id],
      event: db.eventInfo[dbScore.event_id]?.event_number,
      course: db.courseById[dbScore.course_id]
        ? `${db.courseById[dbScore.course_id].course_name} ${db.courseById[dbScore.course_id].tee_name}`
        : 'unknown',
      glideGross: grossScore, dbGross: dbScore.gross_score, glidePar, glideNop,
      calcCH: courseHandicap,
    });
    return;
  }

  stats.matched++;

  // Build update payload — core fields always set, new fields only if Glide has a value
  const updated = {
    gross_score: grossScore,
    net_strokes_over_par: glideNop,
    course_handicap: courseHandicap,
    net_score: netScore,
  };

  if (glideRow.scratchScore != null) {
    updated.scratch_strokes_over_rating = glideRow.scratchScore;
  }
  if (glideRow.scratchPoints != null) {
    updated.scratch_points_awarded = glideRow.scratchPoints;
  }
  if (glideRow.netPoints != null) {
    updated.points_awarded = glideRow.netPoints;
  }
  if (glideRow.handicapIndex != null) {
    updated.handicap_index_used = glideRow.handicapIndex;
  }

  // Diff against current DB values
  const diffs = {};
  let hasChange = false;

  for (const field of CORE_FIELDS) {
    if (dbScore[field] !== updated[field]) {
      diffs[field] = { old: dbScore[field], new: updated[field] };
      hasChange = true;
    }
  }

  for (const field of NEW_FIELDS) {
    if (!(field in updated)) continue;
    if (dbScore[field] !== updated[field]) {
      diffs[field] = { old: dbScore[field], new: updated[field] };
      hasChange = true;
    }
  }

  if (hasChange) {
    stats.changed++;
    stats.changes.push({
      scoreId: dbScore.id,
      player: db.userNameById[dbScore.user_id],
      event: db.eventInfo[dbScore.event_id]?.event_number,
      course: db.courseById[dbScore.course_id]
        ? `${db.courseById[dbScore.course_id].course_name} ${db.courseById[dbScore.course_id].tee_name}`
        : 'unknown',
      diffs,
      updated,
    });
  } else {
    stats.unchanged++;
  }
}

// ─── Aggregate Summary ────────────────────────────────────────────────────────

function printAggregateSummary(year, glideRowCount, stats, db) {
  console.log(`\n  ── Aggregate Summary (${year}) ──`);
  console.log(`  Glide rows:   ${glideRowCount}`);
  console.log(`  DB matched:   ${stats.matched}`);
  console.log(`  Unmatched:    ${stats.unmatched}`);

  // Count nulls among matched scores (after any updates would be applied)
  let nullNop = 0, nullScratch = 0, nullNetPts = 0, nullScratchPts = 0, nullHcpIdx = 0;
  let sumNetPtsDb = 0, sumScratchPtsDb = 0;
  let sumNetPtsGlide = 0, sumScratchPtsGlide = 0;

  for (const c of stats.changes) {
    const u = c.updated;
    if (u.net_strokes_over_par == null) nullNop++;
    if (!('scratch_strokes_over_rating' in u) || u.scratch_strokes_over_rating == null) nullScratch++;
    if (!('points_awarded' in u) || u.points_awarded == null) nullNetPts++;
    if (!('scratch_points_awarded' in u) || u.scratch_points_awarded == null) nullScratchPts++;
    if (!('handicap_index_used' in u) || u.handicap_index_used == null) nullHcpIdx++;
    if ('points_awarded' in u && u.points_awarded != null) sumNetPtsGlide += u.points_awarded;
    if ('scratch_points_awarded' in u && u.scratch_points_awarded != null) sumScratchPtsGlide += u.scratch_points_awarded;
  }

  // For unchanged scores, the DB already matches — count from matched scores not in changes
  const unchangedCount = stats.unchanged;

  console.log(`  Null counts (among ${stats.changed} changed scores):`);
  console.log(`    net_strokes_over_par:        ${nullNop}`);
  console.log(`    scratch_strokes_over_rating: ${nullScratch}`);
  console.log(`    points_awarded:              ${nullNetPts}`);
  console.log(`    scratch_points_awarded:      ${nullScratchPts}`);
  console.log(`    handicap_index_used:         ${nullHcpIdx}`);

  if (sumNetPtsGlide > 0) {
    console.log(`  Glide net points sum (changed):     ${sumNetPtsGlide.toFixed(1)}`);
  }
  if (sumScratchPtsGlide > 0) {
    console.log(`  Glide scratch points sum (changed): ${sumScratchPtsGlide.toFixed(1)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = VERIFY_MODE ? 'VERIFY' : (DRY_RUN ? 'DRY RUN' : 'LIVE');
  console.log(`Mode: ${mode}`);
  if (YEAR_FILTER) console.log(`Year filter: ${YEAR_FILTER}`);
  console.log('Loading DB data...');

  const db = await loadDbData();
  const index = buildDbScoreIndex(db.allScores, db.eventInfo, db.userNameById, db.courseById);
  console.log(`  ${db.allScores.length} DB scores indexed\n`);

  const UUID_MATCH_YEAR = 2025;

  const totalStats = { matched: 0, unmatched: 0, changed: 0, unchanged: 0, skippedMulti: 0, skippedSanity: 0, updates: [] };

  for (const cfg of YEAR_CONFIGS) {
    if (YEAR_FILTER && cfg.year !== YEAR_FILTER) continue;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Processing ${cfg.year} from ${cfg.file}`);
    console.log('═'.repeat(60));

    let glideRows;
    if (cfg.type === 'sa_rh') {
      glideRows = loadSaRhData(cfg.file, cfg.saIdCol);
    } else {
      glideRows = loadRoundData(cfg.file);
    }
    console.log(`  Loaded ${glideRows.length} Glide rows`);

    const stats = processYear(cfg.year, glideRows, index, db, UUID_MATCH_YEAR);

    console.log(`\n  Results: ${stats.matched} matched, ${stats.unmatched} unmatched, ${stats.skippedMulti} skipped (multi-round), ${stats.skippedSanity || 0} skipped (sanity)`);
    console.log(`  Of matched: ${stats.changed} changed, ${stats.unchanged} unchanged`);

    if (stats.sanitySkips?.length > 0) {
      console.log(`\n  Sanity-check skips (course_handicap out of range):`);
      for (const s of stats.sanitySkips) {
        console.log(`    ${s.player} | Event ${s.event} | ${s.course.substring(0, 30)} | glideGross=${s.glideGross} dbGross=${s.dbGross} glidePar=${s.glidePar} NOP=${s.glideNop} → CH=${s.calcCH}`);
      }
    }

    if (stats.unmatchedRows.length > 0) {
      const shown = stats.unmatchedRows.slice(0, 15);
      console.log(`\n  Unmatched Glide rows (showing ${shown.length} of ${stats.unmatchedRows.length}):`);
      for (const r of shown) {
        console.log(`    ${r.playerName} | Event ${r.eventNum} | Gross ${r.grossScore} | ${(r.courseName || '').substring(0, 40)}`);
      }
    }

    if (stats.changes.length > 0) {
      const fieldCounts = {};
      for (const c of stats.changes) {
        for (const field of Object.keys(c.diffs)) {
          fieldCounts[field] = (fieldCounts[field] || 0) + 1;
        }
      }

      console.log(`\n  Changes by field:`);
      for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${field}: ${count}`);
      }

      if (VERIFY_MODE) {
        console.log(`\n  ⚠ VERIFY: ${stats.changes.length} scores have mismatches with Glide data`);
      }

      console.log(`\n  Sample ${VERIFY_MODE ? 'mismatches' : 'changes'} (up to 10):`);
      for (const c of stats.changes.slice(0, 10)) {
        const parts = Object.entries(c.diffs).map(([k, v]) => `${k}: ${v.old} → ${v.new}`);
        console.log(`    ${c.player} | Event ${c.event} | ${c.course.substring(0, 30)} | ${parts.join(', ')}`);
      }

      if (stats.changes.some(c => Math.abs(c.updated.course_handicap) > 40)) {
        console.log(`\n  ⚠ WARNING: ${stats.changes.filter(c => Math.abs(c.updated.course_handicap) > 40).length} scores with course_handicap > 40 (suspicious)`);
      }

      // Apply changes (only in LIVE mode)
      if (!DRY_RUN && !VERIFY_MODE) {
        console.log(`\n  Applying ${stats.changes.length} updates...`);
        let applied = 0, errors = 0;
        for (const c of stats.changes) {
          const { error } = await supabase.from('scores').update(c.updated).eq('id', c.scoreId);
          if (error) {
            console.error(`    Error updating ${c.scoreId}: ${error.message}`);
            errors++;
          } else {
            applied++;
          }
        }
        console.log(`  Applied: ${applied}, Errors: ${errors}`);
      }
    }

    // Aggregate summary for every year
    printAggregateSummary(cfg.year, glideRows.length, stats, db);

    totalStats.matched += stats.matched;
    totalStats.unmatched += stats.unmatched;
    totalStats.changed += stats.changed;
    totalStats.unchanged += stats.unchanged;
    totalStats.skippedMulti += stats.skippedMulti;
    totalStats.skippedSanity += (stats.skippedSanity || 0);
    totalStats.updates.push(...stats.changes);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`TOTAL SUMMARY (${mode})`);
  console.log('═'.repeat(60));
  console.log(`  Matched:        ${totalStats.matched}`);
  console.log(`  Unmatched:      ${totalStats.unmatched}`);
  console.log(`  Skipped multi:  ${totalStats.skippedMulti}`);
  console.log(`  Skipped sanity: ${totalStats.skippedSanity}`);
  console.log(`  Changed:        ${totalStats.changed}`);
  console.log(`  Unchanged:      ${totalStats.unchanged}`);

  if (totalStats.updates.length > 0) {
    const fieldCounts = {};
    for (const u of totalStats.updates) {
      for (const field of Object.keys(u.diffs)) {
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
    }
    console.log('\n  Changes by field:');
    for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${field}: ${count}`);
    }

    const nopShifts = totalStats.updates
      .filter(u => u.diffs.net_strokes_over_par)
      .map(u => u.diffs.net_strokes_over_par.new - u.diffs.net_strokes_over_par.old);
    if (nopShifts.length > 0) {
      const avg = nopShifts.reduce((a, b) => a + b, 0) / nopShifts.length;
      console.log(`\n  NOP shift stats: avg=${avg.toFixed(2)}, min=${Math.min(...nopShifts)}, max=${Math.max(...nopShifts)}`);
    }

    const suspiciousCH = totalStats.updates.filter(c => Math.abs(c.updated.course_handicap) > 40);
    if (suspiciousCH.length > 0) {
      console.log(`\n  ⚠ ${suspiciousCH.length} suspicious course_handicap values (>40):`);
      for (const c of suspiciousCH.slice(0, 10)) {
        const parts = Object.entries(c.diffs).map(([k, v]) => `${k}: ${v.old} → ${v.new}`);
        console.log(`    ${c.player} | Event ${c.event} | ${c.course.substring(0, 30)} | ${parts.join(', ')}`);
      }
    }
  }

  if (VERIFY_MODE) {
    if (totalStats.changed === 0) {
      console.log('\n  ✓ VERIFICATION PASSED: All matched scores agree with Glide data');
    } else {
      console.log(`\n  ✗ VERIFICATION FAILED: ${totalStats.changed} scores have mismatches with Glide`);
    }
  }
}

main().catch(console.error);
