/**
 * One-off script: re-fire a round_complete Slack notification for a specific score.
 *
 * Reproduces the exact same Slack message format as the normal app flow
 * (src/lib/slack.ts formatRoundComplete + enrichWithProjectedPoints).
 *
 * Usage: node scripts/refire-slack-round-complete.mjs <score_id>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const scoreId = process.argv[2];
if (!scoreId) {
  console.error('Usage: node scripts/refire-slack-round-complete.mjs <score_id>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// ---------------------------------------------------------------------------
// Scoring helpers (matching src/lib/scoring.ts)
// ---------------------------------------------------------------------------

function getMaxHoles(type) {
  if (type === '9_holes' || type === 'front_9' || type === 'back_9') return 9;
  return 18;
}

function formatNetScore(net) {
  if (net === 0) return 'E';
  return net > 0 ? `+${net}` : `${net}`;
}

function formatGrossScore(gross, par) {
  if (par == null) return `${gross}`;
  const diff = gross - par;
  const diffStr = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  return `${gross} (${diffStr})`;
}

function calculatePartialPar(fullPar, holesPlayed, maxHoles) {
  return Math.round(fullPar * (holesPlayed / maxHoles));
}

function roundHalfAwayFromZero(n) {
  return Math.sign(n) * Math.round(Math.abs(n));
}

function calcScratchOverRating(grossScore, rating, par, holesPlayed, maxH) {
  const fullScratchCH = roundHalfAwayFromZero(rating - par);
  if (holesPlayed < maxH) {
    const partialCH = Math.round(fullScratchCH * holesPlayed / maxH);
    const partialPar = calculatePartialPar(par, holesPlayed, maxH);
    return grossScore - partialCH - partialPar;
  }
  return grossScore - fullScratchCH - par;
}

function calcRegularEventPoints(numParticipants, place) {
  if (numParticipants === 0 || place < 1 || place > numParticipants) return 0;
  return Math.max(numParticipants - place + 1, 0);
}

function calcMajorEventPoints(numParticipants, place) {
  if (numParticipants === 0 || place < 1 || place > numParticipants) return 0;
  const firstPlacePoints = Math.max(Math.round(numParticipants * 1.33 * 10) / 10, 10);
  if (place === 1) return firstPlacePoints;
  const points = [firstPlacePoints];
  points.push(points[0] - 3);
  points.push(points[1] - 2);
  points.push(points[2] - 1);
  points.push(points[3] - 1);
  points.push(points[4] - 1);
  for (let i = 6; i < numParticipants; i++) {
    points.push(Math.max(points[i - 1] - 1, 1));
  }
  return Math.max(points[place - 1] ?? 1, 1);
}

function splitTiedPoints(points, numTied) {
  const total = points.reduce((s, p) => s + p, 0);
  return Math.round((total / numTied) * 10) / 10;
}

function calcProjectedPoints(playerScore, allScores, isMajor) {
  if (playerScore == null || allScores.length === 0) return null;
  const sorted = [...allScores].sort((a, b) => a - b);
  const numP = sorted.length;
  let rankStart = 0;
  while (rankStart < sorted.length && sorted[rankStart] < playerScore) rankStart++;
  let rankEnd = rankStart;
  while (rankEnd < sorted.length && sorted[rankEnd] === playerScore) rankEnd++;
  const numTied = rankEnd - rankStart;
  if (numTied <= 0) {
    return isMajor ? calcMajorEventPoints(numP, numP) : calcRegularEventPoints(numP, numP);
  }
  if (numTied > 1) {
    const tiedPts = [];
    for (let k = rankStart; k < rankEnd; k++) {
      tiedPts.push(isMajor ? calcMajorEventPoints(numP, k + 1) : calcRegularEventPoints(numP, k + 1));
    }
    return splitTiedPoints(tiedPts, numTied);
  }
  const place = rankStart + 1;
  return isMajor ? calcMajorEventPoints(numP, place) : calcRegularEventPoints(numP, place);
}

// ---------------------------------------------------------------------------
// Format helpers (matching src/lib/slack.ts)
// ---------------------------------------------------------------------------

function formatCourseType(type) {
  switch (type) {
    case '18_holes': return '18 Holes';
    case '9_holes': return '9 Holes';
    case 'front_9': return 'Front 9';
    case 'back_9': return 'Back 9';
    default: return '';
  }
}

function playerLine(name, handicapIndex) {
  const hcp = handicapIndex != null ? ` *(${handicapIndex})*` : '';
  return `*${name}*${hcp}`;
}

function courseLine(courseName, teeName, courseType) {
  const holesLabel = formatCourseType(courseType);
  const holesStr = holesLabel ? ` (${holesLabel})` : '';
  return `${courseName} - ${teeName}${holesStr}`;
}

function scoreLineMarkdown(grossScore, netOverPar, holesPlayed, maxHoles, par) {
  const parts = [];
  if (grossScore != null) {
    const isPartial = holesPlayed != null && maxHoles != null && holesPlayed < maxHoles;
    const effectivePar = isPartial ? calculatePartialPar(par, holesPlayed, maxHoles) : par;
    parts.push(`*Gross:* ${formatGrossScore(grossScore, effectivePar)}`);
  }
  if (netOverPar != null) {
    parts.push(`*Net:* ${formatNetScore(netOverPar)}`);
  }
  if (holesPlayed != null && maxHoles) {
    const thruValue = holesPlayed >= maxHoles ? 'F' : `${holesPlayed} of ${maxHoles}`;
    parts.push(`*Thru:* ${thruValue}`);
  } else if (holesPlayed != null) {
    parts.push(`*Thru:* ${holesPlayed}`);
  }
  return parts.join('  |  ');
}

function pointsLine(projNet, projScratch) {
  const parts = [];
  if (projNet != null) parts.push(`Net ${projNet}`);
  if (projScratch != null) parts.push(`Scratch ${projScratch}`);
  return parts.length > 0 ? `Points: ${parts.join(' | ')}` : 'Points: -';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { data: score, error: scoreErr } = await supabase
  .from('scores')
  .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), event:events(*)')
  .eq('id', scoreId)
  .single();

if (scoreErr || !score) {
  console.error('Score not found:', scoreErr?.message || 'no data');
  process.exit(1);
}

const { data: setting } = await supabase
  .from('app_settings')
  .select('value')
  .eq('key', 'slack_config')
  .single();

if (!setting?.value) {
  console.error('No Slack config found in app_settings');
  process.exit(1);
}

const slackConfig = setting.value;
if (!slackConfig.bot_token || !slackConfig.channel_id) {
  console.error('Slack config missing bot_token or channel_id');
  process.exit(1);
}

const course = score.course;
const user = score.user;
const event = score.event;
const maxHoles = getMaxHoles(course.type);

console.log(`Score: ${score.id}`);
console.log(`Player: ${user.full_name}`);
console.log(`Course: ${course.course_name} - ${course.tee_name} (${formatCourseType(course.type)})`);
console.log(`Gross: ${score.gross_score}, Net over par: ${score.net_strokes_over_par}, Holes: ${score.holes_played}/${maxHoles}`);
console.log(`Complete: ${score.is_complete}`);

// Calculate projected points
let projNetPoints = null;
let projScratchPoints = null;

if (event) {
  const { data: eventScores } = await supabase
    .from('scores')
    .select('user_id, net_strokes_over_par, gross_score, holes_played, is_complete, course:courses(rating, par, type)')
    .eq('event_id', event.id)
    .eq('is_complete', true);

  if (eventScores?.length) {
    const bestNetByUser = {};
    const bestScratchByUser = {};

    for (const s of eventScores) {
      const c = s.course;
      if (!c) continue;
      if (s.net_strokes_over_par != null) {
        if (bestNetByUser[s.user_id] === undefined || s.net_strokes_over_par < bestNetByUser[s.user_id]) {
          bestNetByUser[s.user_id] = s.net_strokes_over_par;
        }
      }
      if (s.gross_score != null) {
        const mH = getMaxHoles(c.type || '18_holes');
        const hp = s.holes_played || mH;
        const scratch = calcScratchOverRating(s.gross_score, c.rating, c.par, hp, mH);
        if (bestScratchByUser[s.user_id] === undefined || scratch < bestScratchByUser[s.user_id]) {
          bestScratchByUser[s.user_id] = scratch;
        }
      }
    }

    const allNets = Object.values(bestNetByUser);
    const allScratches = Object.values(bestScratchByUser);
    const playerNet = score.net_strokes_over_par;
    const playerScratch = calcScratchOverRating(score.gross_score, course.rating, course.par, score.holes_played || maxHoles, maxHoles);
    const isMajor = event.is_major;

    projNetPoints = calcProjectedPoints(playerNet, allNets, isMajor);
    projScratchPoints = calcProjectedPoints(playerScratch, allScratches, isMajor);
  }
}

// Load chirp templates and bucket ranges
let chirpLine = null;
if (score.net_strokes_over_par != null) {
  const { data: chirpData } = await supabase.from('chirp_templates').select('bucket, template');
  const { data: bucketSetting } = await supabase.from('app_settings').select('value').eq('key', 'chirp_bucket_ranges').single();

  const defaultBuckets = [
    { bucket: 'legendary', maxNet: -6 },
    { bucket: 'excellent', maxNet: -3 },
    { bucket: 'solid', maxNet: -1 },
    { bucket: 'neutral', maxNet: 1 },
    { bucket: 'mediocre', maxNet: 4 },
    { bucket: 'rough', maxNet: 8 },
    { bucket: 'bad', maxNet: 14 },
    { bucket: 'terrible', maxNet: null },
  ];

  const bucketRanges = bucketSetting?.value?.ranges?.length === 8
    ? bucketSetting.value.ranges
    : defaultBuckets;

  const net = score.net_strokes_over_par;
  let bucket = bucketRanges[bucketRanges.length - 1].bucket;
  for (const { bucket: b, maxNet } of bucketRanges) {
    if (maxNet === null || net <= maxNet) { bucket = b; break; }
  }

  const templates = (chirpData || []).filter(c => c.bucket === bucket).map(c => c.template);
  if (templates.length) {
    let chirp = templates[Math.floor(Math.random() * templates.length)];
    const firstName = (user.full_name || '').split(' ')[0] || 'Player';
    const lastName = (user.full_name || '').split(' ').slice(1).join(' ') || '';
    chirp = chirp
      .replace(/\$first_name/g, firstName)
      .replace(/\$last_name/g, lastName)
      .replace(/\$full_name/g, user.full_name || 'Player');
    chirpLine = chirp;
  }
}

// Build message (matching formatRoundComplete in src/lib/slack.ts)
const lines = [];
if (chirpLine) lines.push(chirpLine);
lines.push(playerLine(user.full_name, user.handicap_index));
lines.push(courseLine(course.course_name, course.tee_name, course.type));
lines.push(scoreLineMarkdown(score.gross_score, score.net_strokes_over_par, score.holes_played, maxHoles, course.par));
lines.push(pointsLine(projNetPoints, projScratchPoints));

const blocks = [
  { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
];

console.log('\nMessage preview:');
console.log(lines.join('\n'));
console.log('\nPosting to Slack...');

const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${slackConfig.bot_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    channel: slackConfig.channel_id,
    text: `Round Complete — ${user.full_name} at ${course.course_name}`,
    blocks,
  }),
});

const slackData = await slackRes.json();
if (slackData.ok) {
  console.log('Posted successfully!');
} else {
  console.error('Slack error:', slackData.error);
}
