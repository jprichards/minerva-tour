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
  ],
  solid: [
    "That'll do, $first_name. That'll do.",
    "Respectable golf from $first_name. We won't tell anyone you tried.",
    '$first_name snuck under par like he snuck an extra drink past the wife on date night.',
    "$first_name posted a minus… congrats on not completely wasting a Saturday morning.",
    "$first_name finished under par. Someone buy this man a beer before the mortgage payment hits.",
    "$first_name went -something… must've bribed the golf gods with black coffee and ibuprofen.",
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
  mediocre: [
    "We've seen better from $first_name. We've also seen worse.",
    '$first_name is building character out there... or just collecting excuses.',
    "It's a game of inches, and $first_name lost a few today.",
    '$first_name should maybe hit the range before next event.',
    "Some days you eat the bear. Today the bear ate $first_name.",
    "The only thing $first_name is breaking today is even. Barely.",
    "Par is just a number. A number $first_name can't quite reach.",
    '$first_name played like someone who read about golf once.',
    "$first_name's game is in beta testing. Still buggy as hell.",
    'The range called — they want their bucket back, $first_name.',
    'Another day, another $first_name scorecard that screams "mid." Congrats on consistency.',
  ],
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
  ],
  terrible: [
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

async function main() {
  // Clear existing templates
  const { count } = await supabase
    .from('chirp_templates')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`Deleting ${count} existing chirp templates...`);
    const { error: deleteError } = await supabase
      .from('chirp_templates')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('Delete failed:', deleteError.message);
      process.exit(1);
    }
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
