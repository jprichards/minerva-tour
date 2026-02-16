/**
 * Seed script: imports existing hardcoded chirp templates into the
 * chirp_templates Supabase table.
 *
 * Run: node scripts/seed-chirps.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * environment variables (or .env.local).
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

const supabase = createClient(supabaseUrl, serviceKey);

const CHIRP_TEMPLATES = {
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
    "Pure shame for $first_name today, nae denyin'.",
    "$first_name took more steps on the green than a tourist lookin' for the toilets.",
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
    "Out of respect for $first_name's family and privacy, we will no longer cover this round.",
    'The intervention has been scheduled for $first_name.',
    '$first_name ate shit for breakfast apparently.',
    'Oh, even stink would say THAT stinks. Sorry, $first_name.',
  ],
};

async function main() {
  // Check if templates already exist
  const { count } = await supabase
    .from('chirp_templates')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`chirp_templates already has ${count} rows. Skipping seed.`);
    return;
  }

  const rows = [];
  for (const [bucket, templates] of Object.entries(CHIRP_TEMPLATES)) {
    for (const template of templates) {
      rows.push({ bucket, template });
    }
  }

  const { error } = await supabase.from('chirp_templates').insert(rows);
  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} chirp templates across ${Object.keys(CHIRP_TEMPLATES).length} buckets.`);
}

main();
