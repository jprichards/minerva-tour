import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check if 2026 season exists
  let { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', 2026)
    .single();

  if (!season) {
    console.log('Creating 2026 season...');
    const { data, error } = await supabase
      .from('seasons')
      .insert({ year: 2026, mode: 'regular_season' })
      .select()
      .single();
    if (error) {
      console.error('Error creating season:', error);
      return;
    }
    season = data;
    console.log('Created season:', season.id);
  } else {
    console.log('Found existing 2026 season:', season.id);
  }

  const seasonId = season.id;

  // Clear existing events for this season (fresh import)
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('season_id', seasonId);

  if (existing && existing.length > 0) {
    console.log(`Clearing ${existing.length} existing events for 2026 season...`);
    await supabase.from('events').delete().eq('season_id', seasonId);
  }

  const events = [
    {
      event_number: 1,
      name: 'Event 1',
      start_date: '2026-03-02',
      end_date: '2026-03-15',
      holes: 18,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 2,
      name: 'Event 2',
      start_date: '2026-03-16',
      end_date: '2026-03-29',
      holes: 9,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 3,
      name: 'Event 3',
      start_date: '2026-03-30',
      end_date: '2026-04-12',
      holes: 18,
      is_major: true,
      is_playoff: false,
    },
    {
      event_number: 4,
      name: 'Event 4',
      start_date: '2026-04-13',
      end_date: '2026-04-26',
      holes: 9,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 5,
      name: 'Event 5',
      start_date: '2026-04-27',
      end_date: '2026-05-10',
      holes: 18,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 6,
      name: 'Event 6',
      start_date: '2026-05-11',
      end_date: '2026-05-24',
      holes: 18,
      is_major: true,
      is_playoff: false,
    },
    {
      event_number: 7,
      name: 'Event 7',
      start_date: '2026-05-25',
      end_date: '2026-06-07',
      holes: 9,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 8,
      name: 'Event 8',
      start_date: '2026-06-08',
      end_date: '2026-06-21',
      holes: 18,
      is_major: false,
      is_playoff: false,
    },
    {
      event_number: 9,
      name: 'Event 9',
      start_date: '2026-06-22',
      end_date: '2026-07-05',
      holes: 18,
      is_major: true,
      is_playoff: false,
    },
    {
      event_number: 10,
      name: 'Playoffs Round 1',
      start_date: '2026-07-06',
      end_date: '2026-07-19',
      holes: 18,
      is_major: false,
      is_playoff: true,
    },
    {
      event_number: 11,
      name: 'Playoffs Round 2',
      start_date: '2026-07-20',
      end_date: '2026-08-02',
      holes: 18,
      is_major: false,
      is_playoff: true,
    },
    {
      event_number: 12,
      name: 'Championship Match',
      start_date: '2026-08-03',
      end_date: '2026-08-16',
      holes: 18,
      is_major: false,
      is_playoff: true,
    },
  ];

  console.log(`Inserting ${events.length} events...`);

  for (const event of events) {
    const { error } = await supabase.from('events').insert({
      season_id: seasonId,
      ...event,
    });
    if (error) {
      console.error(`Error inserting ${event.name}:`, error.message);
    } else {
      console.log(`  ✓ ${event.name}: ${event.start_date} - ${event.end_date} (${event.holes}H${event.is_major ? ', Major' : ''}${event.is_playoff ? ', Playoff' : ''})`);
    }
  }

  // Also note the Member-Guest Tournament (May 1-2) - this is separate from the tour events
  console.log('\nNote: MGC Member-Guest Tournament (May 1-2) is on the calendar but is not a tour event.');
  console.log('\nDone! 2026 season schedule imported.');
}

main().catch(console.error);
