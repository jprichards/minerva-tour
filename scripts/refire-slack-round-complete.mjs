/**
 * One-off script: re-fire a round_complete Slack notification for a specific score.
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

// Fetch score with course, user, and event data
const { data: score, error: scoreErr } = await supabase
  .from('scores')
  .select('*, course:courses(*), user:users!user_id(full_name, email, handicap_index), event:events(*)')
  .eq('id', scoreId)
  .single();

if (scoreErr || !score) {
  console.error('Score not found:', scoreErr?.message || 'no data');
  process.exit(1);
}

console.log(`Score: ${score.id}`);
console.log(`Player: ${score.user?.full_name}`);
console.log(`Course: ${score.course?.course_name} - ${score.course?.tee_name}`);
console.log(`Gross: ${score.gross_score}, Net over par: ${score.net_strokes_over_par}, Holes: ${score.holes_played}`);
console.log(`Complete: ${score.is_complete}`);

// Fetch Slack config
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

// Determine max holes from course type
function getMaxHoles(type) {
  if (type === '9_holes' || type === 'front_9' || type === 'back_9') return 9;
  return 18;
}

function formatCourseType(type) {
  switch (type) {
    case '18_holes': return '18 Holes';
    case '9_holes': return '9 Holes';
    case 'front_9': return 'Front 9';
    case 'back_9': return 'Back 9';
    default: return '';
  }
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

const course = score.course;
const user = score.user;
const event = score.event;
const maxHoles = getMaxHoles(course.type);
const holesLabel = formatCourseType(course.type);
const holesStr = holesLabel ? ` (${holesLabel})` : '';

const hcp = user.handicap_index != null ? ` (${user.handicap_index})` : '';
const playerLine = `*${user.full_name}*${hcp}`;
const courseLine = `${course.course_name} - ${course.tee_name}${holesStr}`;

// Build score line
const scoreParts = [];
if (score.gross_score != null) {
  scoreParts.push(`*Gross:* ${formatGrossScore(score.gross_score, course.par)}`);
}
if (score.net_strokes_over_par != null) {
  scoreParts.push(`*Net:* ${formatNetScore(score.net_strokes_over_par)}`);
}
if (score.holes_played != null) {
  scoreParts.push(`*Holes:* ${score.holes_played}`);
}

// Calculate projected points (net + scratch)
let projNetPoints = null;
let projScratchPoints = null;

function roundHalfAwayFromZero(n) {
  return Math.sign(n) * Math.round(Math.abs(n));
}

function calcScratchOverRating(grossScore, rating, par, holesPlayed, maxH) {
  const fullScratchCH = roundHalfAwayFromZero(rating - par);
  if (holesPlayed < maxH) {
    const partialCH = roundHalfAwayFromZero(fullScratchCH * holesPlayed / maxH);
    const partialPar = Math.round(par * holesPlayed / maxH);
    return grossScore - partialCH - partialPar;
  }
  return grossScore - fullScratchCH - par;
}

function calcRegularPoints(numParticipants, place) {
  if (numParticipants <= 1) return 1;
  return Math.max(1, Math.round(5 * (1 - (place - 1) / (numParticipants - 1))));
}

function calcMajorPoints(numParticipants, place) {
  if (numParticipants <= 1) return 10;
  return Math.max(1, Math.round(10 * (1 - (place - 1) / (numParticipants - 1))));
}

function calcPoints(playerScore, allScores, isMajor) {
  if (playerScore == null || allScores.length === 0) return null;
  const sorted = [...allScores].sort((a, b) => a - b);
  const numP = sorted.length;
  let rankStart = 0;
  while (rankStart < sorted.length && sorted[rankStart] < playerScore) rankStart++;
  let rankEnd = rankStart;
  while (rankEnd < sorted.length && sorted[rankEnd] === playerScore) rankEnd++;
  const numTied = rankEnd - rankStart;
  if (numTied <= 0) {
    return isMajor ? calcMajorPoints(numP, numP) : calcRegularPoints(numP, numP);
  }
  if (numTied > 1) {
    let sum = 0;
    for (let k = rankStart; k < rankEnd; k++) {
      sum += isMajor ? calcMajorPoints(numP, k + 1) : calcRegularPoints(numP, k + 1);
    }
    return Math.round(sum / numTied);
  }
  const place = rankStart + 1;
  return isMajor ? calcMajorPoints(numP, place) : calcRegularPoints(numP, place);
}

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
    projNetPoints = calcPoints(playerNet, allNets, isMajor);
    projScratchPoints = calcPoints(playerScratch, allScratches, isMajor);

    console.log(`Player scratch over rating: ${playerScratch}`);
    console.log(`All scratch scores: ${allScratches.sort((a,b) => a-b).join(', ')}`);
  }
}

const pointsParts = [];
if (projNetPoints != null) pointsParts.push(`Net ${projNetPoints}`);
if (projScratchPoints != null) pointsParts.push(`Scratch ${projScratchPoints}`);
const pointsStr = pointsParts.length > 0 ? `Points: ${pointsParts.join(' | ')}` : 'Points: -';

const lines = [playerLine];
if (score.tee_time) {
  const d = new Date(score.tee_time);
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
  lines.push(`Tee Time: ${d.toLocaleDateString('en-US', options)} at ${d.toLocaleTimeString('en-US', timeOpts)}`);
}
lines.push(courseLine);
if (scoreParts.length) lines.push(scoreParts.join('  |  '));
lines.push(pointsStr);

const blocks = [
  { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
];

// Fetch chirp templates for a quip
const { data: chirpData } = await supabase
  .from('chirp_templates')
  .select('bucket, template');

if (chirpData?.length && score.net_strokes_over_par != null) {
  const net = score.net_strokes_over_par;
  const bucketRanges = [
    { bucket: 'legendary', maxNet: -6 },
    { bucket: 'excellent', maxNet: -3 },
    { bucket: 'solid', maxNet: -1 },
    { bucket: 'neutral', maxNet: 1 },
    { bucket: 'mediocre', maxNet: 4 },
    { bucket: 'rough', maxNet: 8 },
    { bucket: 'bad', maxNet: 14 },
    { bucket: 'terrible', maxNet: null },
  ];
  let bucket = 'terrible';
  for (const { bucket: b, maxNet } of bucketRanges) {
    if (maxNet === null || net <= maxNet) { bucket = b; break; }
  }

  const templates = chirpData.filter(c => c.bucket === bucket).map(c => c.template);
  if (templates.length) {
    let chirp = templates[Math.floor(Math.random() * templates.length)];
    const firstName = (user.full_name || '').split(' ')[0] || 'Player';
    const lastName = (user.full_name || '').split(' ').slice(1).join(' ') || '';
    chirp = chirp.replace(/\$first_name/g, firstName).replace(/\$last_name/g, lastName).replace(/\$full_name/g, user.full_name || 'Player');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `_${chirp}_` } });
  }
}

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
