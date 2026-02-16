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
  | 'legendary'   // -10 or better
  | 'excellent'   // -9 to -5
  | 'solid'       // -4 to +1
  | 'mediocre'    // +2 to +4
  | 'rough'       // +5 to +9
  | 'bad'         // +10 to +19
  | 'terrible';   // +20 or worse

export const BUCKET_LABELS: Record<ChirpBucket, string> = {
  legendary: 'Legendary (-10 or better)',
  excellent: 'Excellent (-9 to -5)',
  solid: 'Solid (-4 to +1)',
  mediocre: 'Mediocre (+2 to +4)',
  rough: 'Rough (+5 to +9)',
  bad: 'Bad (+10 to +19)',
  terrible: 'Terrible (+20 or worse)',
};

export const ALL_BUCKETS: ChirpBucket[] = [
  'legendary', 'excellent', 'solid', 'mediocre', 'rough', 'bad', 'terrible',
];

/**
 * Hardcoded chirp templates — used as fallback when DB is unavailable
 * and as the initial seed data source.
 */
export const CHIRP_TEMPLATES: Record<ChirpBucket, string[]> = {
  legendary: [
    'Wow, folks. Nuclear Class Submarine. $first_name is DEEP under par.',
    "Cinderella story, out of nowhere, former greenskeeper... it's $first_name!",
    'Mask up, fellas: $first_name is SICK.',
    'Can $first_name be humble is the real question?',
    '$first_name had their wheaties this morning.',
    'Excuse me, where does one sign up for the PGA tour? Asking for $first_name.',
    'Looks like $first_name may have an extra jacket next winter.',
    'The cart girl would like your digits, $first_name.',
    "They're gonna go crazy when $first_name hits this...",
    'There must be a glitch in the Matrix. $first_name is unreal.',
    "Just a comfortable 9-iron for $first_name. They're gonna go crazy when he hits this...",
    'Move over, $first_name is HERE.',
  ],
  excellent: [
    '$first_name came to play today. Impressive stuff.',
    "Tha's a bonnie score, $first_name. The links gods smile upon ye.",
    '$first_name is dialed in. Watch out, everyone.',
    "The flagstick is $first_name's best friend today.",
    "If $first_name keeps this up, we'll need bigger trophies.",
    "That's the kind of round that gets talked about at the 19th hole.",
    '$first_name just gave a masterclass in course management.',
    "Someone check $first_name's bag for illegal clubs.",
  ],
  solid: [
    'Steady as she goes for $first_name. Nothing fancy, nothing embarrassing.',
    '$first_name put up a respectable number today. The golf gods were... neutral.',
    "A gentleman's round from $first_name. No highlights, no lowlights.",
    "$first_name's round was like vanilla ice cream — reliable, but nobody's first choice.",
    'The word of the day for $first_name: par-ish.',
    "Not great, not terrible. $first_name is the Goldilocks of golf today.",
    '$first_name survived the round with dignity intact.',
    "That'll do, $first_name. That'll do.",
  ],
  mediocre: [
    "We've seen better from $first_name. We've also seen worse.",
    '$first_name is building character out there.',
    "It's a game of inches, and $first_name lost a few today.",
    '$first_name should maybe hit the range before next event.',
    "Some days you eat the bear. Today the bear ate $first_name.",
    "The only thing $first_name is breaking today is even. Barely.",
    "Par is just a number. A number $first_name can't quite reach.",
    '$first_name played like someone who read about golf once.',
  ],
  rough: [
    "I've seen flagsticks get more birdies than $first_name today.",
    '$first_name lost more balls than a stag party in Amsterdam.',
    "D'ye know what $first_name's favorite movie is? Just tryin' tae change the subject.",
    '$first_name played like a dropped meat pie — messy and disappointing.',
    "$first_name's putting was like a seal with a rake.",
    'Pure shame for $first_name today, nae denyin\'.',
    '$first_name took more steps on the green than a tourist lookin\' for the toilets.',
    'Aye, rough day for $first_name. Very rough.',
  ],
  bad: [
    'An Englishman has more straight teeth than $first_name has good shots.',
    "$first_name's play was like a dropped meat pie — messy and disappointing.",
    "$first_name looked fine 'til pressure poked 'im — then he fell to bits.",
    'The burden of playing that badly is near as heavy as a range finder.',
    '$first_name could not get up and down if ye gave him a ladder.',
    "$first_name's head was all tied up like a celtic knot.",
    'Even stink would say $first_name stinks today.',
    "$first_name's round was a burden, heavy as a winter's gale.",
  ],
  terrible: [
    "$first_name's reanimated corpse has been dropped from coverage.",
    "We don't cover handicap manipulation on this network. $first_name is being dropped from coverage.",
    'Out of respect for $first_name\'s family and privacy, we will no longer cover this round.',
    'The intervention has been scheduled for $first_name.',
    '$first_name ate shit for breakfast apparently.',
    'Oh, even stink would say THAT stinks. Sorry, $first_name.',
  ],
};

/**
 * Determine the chirp bucket based on net strokes over par
 */
export function getChirpBucket(netStrokesOverPar: number): ChirpBucket {
  if (netStrokesOverPar <= -10) return 'legendary';
  if (netStrokesOverPar <= -5) return 'excellent';
  if (netStrokesOverPar <= 1) return 'solid';
  if (netStrokesOverPar <= 4) return 'mediocre';
  if (netStrokesOverPar <= 9) return 'rough';
  if (netStrokesOverPar <= 19) return 'bad';
  return 'terrible';
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
export function getChirp(netStrokesOverPar: number, ctx: ChirpContext): string {
  const bucket = getChirpBucket(netStrokesOverPar);
  return applyTemplate(CHIRP_TEMPLATES[bucket], ctx);
}

/**
 * Get a personalized chirp from a pre-fetched set of DB templates.
 * Falls back to hardcoded templates if the bucket has no DB entries.
 */
export function getChirpFromTemplates(
  dbTemplates: Record<string, string[]>,
  netStrokesOverPar: number,
  ctx: ChirpContext
): string {
  const bucket = getChirpBucket(netStrokesOverPar);
  const templates = dbTemplates[bucket]?.length
    ? dbTemplates[bucket]
    : CHIRP_TEMPLATES[bucket];
  return applyTemplate(templates, ctx);
}
