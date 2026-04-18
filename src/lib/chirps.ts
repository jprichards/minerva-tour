/**
 * Minerva Tour Chirps — Automated Score Commentary
 *
 * Based on a player's net strokes over par, a random humorous chirp is
 * selected from the matching performance bucket and personalized with
 * the player's first name.
 *
 * Templates are stored in the `chirp_templates` Supabase table and can
 * be managed by any member. The hardcoded CHIRP_TEMPLATES constant serves
 * as the fallback when the DB is unavailable.
 */

export type ChirpBucket =
  | 'legendary'   // -5 or better
  | 'excellent'   // -4 to -1
  | 'neutral'     // E to +1
  | 'mediocre'    // +2 to +4 (no chirp fired)
  | 'rough'       // +5 to +8
  | 'bad';        // +9 or worse

export interface BucketRange {
  bucket: ChirpBucket;
  maxNet: number | null;
}

export const DEFAULT_BUCKET_RANGES: BucketRange[] = [
  { bucket: 'legendary', maxNet: -5 },
  { bucket: 'excellent', maxNet: -1 },
  { bucket: 'neutral', maxNet: 1 },
  { bucket: 'mediocre', maxNet: 4 },
  { bucket: 'rough', maxNet: 8 },
  { bucket: 'bad', maxNet: null },
];

export const BUCKET_LABELS: Record<ChirpBucket, string> = {
  legendary: 'Legendary (-5 or better)',
  excellent: 'Excellent (-4 to -1)',
  neutral: 'Neutral (E to +1)',
  mediocre: 'Mediocre (+2 to +4)',
  rough: 'Rough (+5 to +8)',
  bad: 'Bad (+9 or worse)',
};

export const ALL_BUCKETS: ChirpBucket[] = [
  'legendary', 'excellent', 'neutral', 'mediocre', 'rough', 'bad',
];

/** Buckets where no chirp is generated or consumed. */
export const NO_CHIRP_BUCKETS: ReadonlySet<ChirpBucket> = new Set(['mediocre']);

function formatRangeLabel(bucket: ChirpBucket, ranges: BucketRange[]): string {
  const names: Record<ChirpBucket, string> = {
    legendary: 'Legendary', excellent: 'Excellent', neutral: 'Neutral',
    mediocre: 'Mediocre', rough: 'Rough', bad: 'Bad',
  };
  const idx = ranges.findIndex((r) => r.bucket === bucket);
  if (idx === -1) return names[bucket];
  const range = ranges[idx];
  const prevMax = idx > 0 ? ranges[idx - 1].maxNet! : null;
  const min = prevMax !== null ? prevMax + 1 : null;
  const max = range.maxNet;

  if (min === null && max !== null) return `${names[bucket]} (${max} or better)`;
  if (min !== null && max === null) return `${names[bucket]} (+${min} or worse)`;
  if (min !== null && max !== null) {
    const fmtMin = min === 0 ? 'E' : min > 0 ? `+${min}` : `${min}`;
    const fmtMax = max === 0 ? 'E' : max > 0 ? `+${max}` : `${max}`;
    return `${names[bucket]} (${fmtMin} to ${fmtMax})`;
  }
  return names[bucket];
}

export function buildBucketLabels(ranges: BucketRange[]): Record<ChirpBucket, string> {
  const labels = {} as Record<ChirpBucket, string>;
  for (const { bucket } of ranges) {
    labels[bucket] = formatRangeLabel(bucket, ranges);
  }
  return labels;
}

/**
 * Hardcoded chirp templates — used as fallback when DB is unavailable
 * and as the initial seed data source.
 */
export const CHIRP_TEMPLATES: Record<ChirpBucket, string[]> = {
  legendary: [
    'Wow, folks. Nuclear Class Submarine. $first_name is DEEP under par.',
    'Mask up, fellas: $first_name is SICK.',
    'Can $first_name be humble is the real question?',
    '$first_name had their wheaties this morning.',
    'Excuse me, where does one sign up for the PGA tour? Asking for $first_name.',
    'Looks like $first_name may have an extra jacket next winter.',
    "The cart girl would like your digits, $first_name. Or at least your Venmo for the drinks you're buying",
    'There must be a glitch in the Matrix. $first_name is unreal.',
    "Just a comfortable 9-iron for $first_name. They're gonna go crazy when he hits this...",
    '$first_name just lapped the field so hard the cart path is calling for child support.',
    '$first_name just posted a number so low the handicap committee is filing a fraud report.',
    "Cinderella? Nah, $first_name's the whole damn fairy tale today... while the rest of us are stuck in the pumpkin carriage.",
    'Alert the wives: $first_name remembered how to golf. The divorce rate just dropped 0.1%.',
  ],
  excellent: [
    '$first_name came to play today. Impressive stuff.',
    "Tha's a bonnie score, $first_name. The links gods smile upon ye.",
    "That's the kind of round that gets talked about at the 19th hole.",
    "Someone check $first_name's bag for illegal clubs.",
    "Dialed in like $first_name's got the course cheat codes.",
    "$first_name's playing like he actually practiced. Disgusting.",
    "That's not golf, $first_name — that's a mid-life crisis in reverse.",
    "That'll do, $first_name. That'll do.",
    "Respectable golf from $first_name. We won't tell anyone you tried.",
    '$first_name snuck under par like he snuck an extra drink past the wife on date night.',
    "$first_name posted a minus… congrats on not completely wasting a Saturday morning.",
    "$first_name finished under par. Someone buy this man a beer before the mortgage payment hits.",
    '$first_name went -something… must\'ve bribed the golf gods with black coffee and ibuprofen.',
    'Not bad, $first_name — you almost looked like you belong with the big boys today.',
  ],
  neutral: [
    'Steady as she goes for $first_name. Nothing fancy, nothing embarrassing.',
    '$first_name put up a respectable number today. The golf gods were... neutral.',
    "A gentleman's round from $first_name. No highlights, no lowlights.",
    "$first_name's round was like vanilla ice cream — reliable, but nobody's first choice.",
    'The word of the day for $first_name: par-ish.',
    "Not great, not terrible. $first_name is the Goldilocks of golf today.",
    '$first_name survived the round with dignity intact.',
    '$first_name posted a card so neutral it could host peace talks.',
    "$first_name's round: not a disaster, not a masterpiece — just aggressively average.",
    '$first_name survived without calling a search party. Progress.',
    "$first_name is the human equivalent of par — predictable, dependable, and nobody's writing home about it.",
    'Goldilocks called — $first_name stole his "just right" vibe, then gave it back untouched.',
    '$first_name played exactly to his handicap. Thrilling as watching the lawn guy mow in straight lines.',
    "Not great, not terrible — $first_name just turned 18 holes into background noise for the podcast in his head.",
    "$first_name's scorecard: $net. The most exciting part was debating whether to get the cart or walk off the calories.",
    "A gentleman's round? More like $first_name's \"I showed up and didn't injure myself\" certificate.",
  ],
  mediocre: [],
  rough: [
    '$first_name lost more balls than a stag party in Amsterdam.',
    "D'ye know what $first_name's favorite movie is? Just tryin' tae change the subject.",
    "$first_name's putting was like a seal with a rake... on ice.",
    "Pure shame for $first_name today, nae denyin'.",
    "$first_name took more steps on the green than a tourist lookin' for the toilets.",
    'Aye, rough day for $first_name. Very rough.',
    "$first_name's putting stroke looks like he's swatting bees.",
    'Nice round, $first_name — if the goal was cardio and ball retrieval.',
    "$first_name's approach shots had more airtime than Spirit Airlines.",
    "Your handicap's working harder than you today, $first_name — give it a raise.",
    '$first_name played like every club was sponsored by "chunk and run."',
    "$first_name's swing path? More like a drunk Uber driver rerouting mid-ride.",
    "Rough day, $first_name — your scorecard's starting to look like a cry for help.",
  ],
  bad: [
    'An Englishman has more straight teeth than $first_name has good shots.',
    "$first_name's play was like a dropped meat pie — messy and disappointing.",
    "$first_name looked fine 'til pressure poked 'im — then he fell to bits.",
    'The burden of playing that badly is near as heavy as a range finder.',
    '$first_name could not get up and down if ye gave him a ladder.',
    "$first_name's head was all tied up like a celtic knot.",
    "$first_name's round was a burden, heavy as a winter's gale.",
    "$first_name's game is so cooked even his mom is pretending she doesn't know him on the back nine.",
    'Congrats $first_name, you just set the course record… for most times a grown man cried in a sand trap.',
    'Your scorecard looks like a ransom note written by a blind toddler, $first_name.',
    "$first_name played so bad the cart girl asked if she should call your therapist or just the suicide hotline.",
    "$first_name's swing is so ugly his clubs are filing a restraining order.",
    '$first_name hit more hosel rockets than a Fourth of July finale gone wrong.',
    "Even the squirrels are judging $first_name's chip-ins today.",
    '$first_name played like he bet the house on every hole... and lost the house.',
    'Your ball retriever deserves player of the match, $first_name — MVP status.',
    'Congrats $first_name — your round just qualified for disaster relief funds.',
    "We're not roasting $first_name today… we're holding a funeral for whatever dignity he had left.",
    "$first_name's reanimated corpse has been dropped from coverage.",
    '$first_name ate shit for breakfast apparently.',
    "$first_name just posted a $net… we're burning the group chat and starting a new league without him.",
    "$first_name's round was so bad his handicap just filed for emancipation.",
    '$first_name played like his balls and his brain both went missing in the same water hazard.',
    '$first_name just shot so high, the app is asking if we want to switch to bowling stats instead.',
    "Your swing is so fucked $first_name even the geese on the course flew away in embarrassment.",
    "$first_name's game is so trash his own shadow left him mid-round.",
    "Bro dropped a $net… at this point we're just watching a man get hate-fucked by 18 holes in real time.",
    "We're putting $first_name on suicide watch… for his golf career. And maybe his personality.",
    "You didn't play golf today $first_name, you just paid $200 to publicly get pegged by the course.",
    "$first_name couldn't hit a fairway with a GPS, a map, and his dad holding his dick for him.",
    "$first_name's round was sponsored by \"what the actual fuck\" and \"why me.\"",
    "$first_name's scorecard needs its own zip code — that's how far over par we are.",
    '$first_name turned the front nine into a crime scene and the back nine into a cover-up.',
    "$first_name's swing looked like a mid-life crisis having a mid-life crisis.",
  ],
};

/**
 * Determine the chirp bucket based on net strokes over par.
 * Accepts optional custom ranges (loaded from app_settings).
 */
export function getChirpBucket(
  netStrokesOverPar: number,
  ranges: BucketRange[] = DEFAULT_BUCKET_RANGES
): ChirpBucket {
  for (const { bucket, maxNet } of ranges) {
    if (maxNet === null || netStrokesOverPar <= maxNet) return bucket;
  }
  return 'bad';
}

/**
 * Context passed to chirp template substitution.
 * All fields beyond firstName are optional — if absent the
 * placeholder is left as-is (harmless in output).
 */
export interface ChirpContext {
  firstName: string;
  course?: string | null;
  gross?: number | null;
  net?: number | null;       // net strokes over par with sign, e.g. "+7" or "-2"
  holes?: number | null;
  handicap?: number | null;
}

/** All supported wildcards for reference in the UI. */
export const CHIRP_WILDCARDS: { token: string; description: string }[] = [
  { token: '$first_name', description: "Player's first name" },
  { token: '$course', description: 'Course name' },
  { token: '$gross', description: 'Gross score (e.g. 82)' },
  { token: '$net', description: 'Net strokes over par (e.g. +7, -2)' },
  { token: '$holes', description: 'Holes played (e.g. 14)' },
  { token: '$handicap', description: 'Handicap index (e.g. 24.2)' },
];

function formatNetSign(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Pick a random template and substitute all wildcards from context.
 */
function applyTemplate(templates: string[], ctx: ChirpContext): string {
  if (templates.length === 0) return '';
  const idx = Math.floor(Math.random() * templates.length);
  let result = templates[idx];
  result = result.replace(/\$first_name/g, ctx.firstName);
  if (ctx.course != null) result = result.replace(/\$course/g, ctx.course);
  if (ctx.gross != null) result = result.replace(/\$gross/g, String(ctx.gross));
  if (ctx.net != null) result = result.replace(/\$net/g, formatNetSign(ctx.net));
  if (ctx.holes != null) result = result.replace(/\$holes/g, String(ctx.holes));
  if (ctx.handicap != null) result = result.replace(/\$handicap/g, String(ctx.handicap));
  return result;
}

/**
 * Get a personalized chirp using hardcoded fallback templates.
 * Used when DB templates are not available.
 */
export function getChirp(
  netStrokesOverPar: number,
  ctx: ChirpContext,
  ranges?: BucketRange[]
): string {
  const bucket = getChirpBucket(netStrokesOverPar, ranges);
  return applyTemplate(CHIRP_TEMPLATES[bucket], ctx);
}

/**
 * Get a personalized chirp from a pre-fetched set of DB templates.
 * Falls back to hardcoded templates if the bucket has no DB entries.
 */
export function getChirpFromTemplates(
  dbTemplates: Record<string, string[]>,
  netStrokesOverPar: number,
  ctx: ChirpContext,
  ranges?: BucketRange[]
): string {
  const bucket = getChirpBucket(netStrokesOverPar, ranges);
  const templates = dbTemplates[bucket]?.length
    ? dbTemplates[bucket]
    : CHIRP_TEMPLATES[bucket];
  return applyTemplate(templates, ctx);
}
