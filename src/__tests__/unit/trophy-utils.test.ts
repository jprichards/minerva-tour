import { describe, it, expect } from 'vitest';
import {
  parseChampYear,
  parseSeasonFinish,
  getUniqueAwardEmojis,
  extractBjcEmojis,
  AWARD_EMOJI,
  AWARD_DISPLAY_NAMES,
  type ParsedAward,
} from '@/lib/trophy-utils';

describe('extractBjcEmojis', () => {
  it('extracts 🌳 and 🌺 emojis', () => {
    expect(extractBjcEmojis('🌳🌳🌺')).toEqual(['🌳', '🌳', '🌺']);
  });

  it('extracts 🇺🇸 flag emoji', () => {
    expect(extractBjcEmojis('🇺🇸🌳🌳')).toEqual(['🇺🇸', '🌳', '🌳']);
  });

  it('ignores non-BJC emojis', () => {
    expect(extractBjcEmojis('🏆\n📉\n🇺🇸🌳🌳\n📀')).toEqual(['🇺🇸', '🌳', '🌳']);
  });

  it('handles empty string', () => {
    expect(extractBjcEmojis('')).toEqual([]);
  });

  it('handles string with no BJC emojis', () => {
    expect(extractBjcEmojis('🏆🦄🍻')).toEqual([]);
  });

  it('handles mixed BJC emojis with newlines', () => {
    expect(extractBjcEmojis('🌳🌳🌺\n🦄🦄')).toEqual(['🌳', '🌳', '🌺']);
  });
});

describe('parseChampYear', () => {
  it('parses a single Minerva Tour Champion entry', () => {
    const result = parseChampYear('2022 Minerva Tour Champion');
    expect(result).toEqual([
      {
        year: 2022,
        award_type: 'minerva_tour_champion',
        award_name: 'Minerva Tour Champion',
        description: null,
        emoji: '🏆',
      },
    ]);
  });

  it('parses multiple newline-separated entries', () => {
    const input = '2018 Most Improved Golfer\n2022 Minerva Tour Champion';
    const result = parseChampYear(input);
    expect(result).toHaveLength(2);
    expect(result[0].award_type).toBe('most_improved');
    expect(result[0].year).toBe(2018);
    expect(result[0].emoji).toBe('📉');
    expect(result[1].award_type).toBe('minerva_tour_champion');
    expect(result[1].year).toBe(2022);
  });

  it('assigns BJC emoji from trophies string - Team Magnolia (🌳)', () => {
    const result = parseChampYear(
      '2019 Bobby Jones Cup (Wisconsin)',
      '🌳'
    );
    expect(result[0].emoji).toBe('🌳');
    expect(result[0].description).toBe('Wisconsin');
  });

  it('assigns BJC emoji from trophies string - Team Azalea (🌺)', () => {
    const result = parseChampYear(
      '2023 Bobby Jones Cup (Washington)',
      '🌺'
    );
    expect(result[0].emoji).toBe('🌺');
    expect(result[0].description).toBe('Washington');
  });

  it('assigns BJC Hilton Head as 🇺🇸 from trophies string', () => {
    const result = parseChampYear(
      '2018 Bobby Jones Cup (Hilton Head)',
      '🇺🇸'
    );
    expect(result[0].emoji).toBe('🇺🇸');
    expect(result[0].description).toBe('Hilton Head');
  });

  it('assigns multiple BJC emojis in order from trophies string', () => {
    const champYear = '2018 Bobby Jones Cup (Hilton Head)\n2019 Bobby Jones Cup (Wisconsin)\n2021 Bobby Jones Cup (Michigan)';
    const trophies = '🏆\n📉\n🇺🇸🌳🌳\n📀';
    const result = parseChampYear(champYear, trophies);
    const bjc = result.filter(r => r.award_type === 'bobby_jones_cup');
    expect(bjc).toHaveLength(3);
    expect(bjc[0].emoji).toBe('🇺🇸'); // Hilton Head - from trophies
    expect(bjc[1].emoji).toBe('🌳');   // Wisconsin - Team Magnolia
    expect(bjc[2].emoji).toBe('🌳');   // Michigan - Team Magnolia
  });

  it('handles mixed Magnolia and Azalea BJC wins', () => {
    const champYear = '2019 Bobby Jones Cup (Wisconsin)\n2020 Bobby Jones Cup (Atlanta)\n2023 Bobby Jones Cup (Washington)';
    const trophies = '1️⃣🌳🌳🌺';
    const result = parseChampYear(champYear, trophies);
    const bjc = result.filter(r => r.award_type === 'bobby_jones_cup');
    expect(bjc).toHaveLength(3);
    expect(bjc[0].emoji).toBe('🌳');   // Wisconsin - Team Magnolia
    expect(bjc[1].emoji).toBe('🌳');   // Atlanta - Team Magnolia
    expect(bjc[2].emoji).toBe('🌺');   // Washington - Team Azalea
  });

  it('falls back to 🌳 when trophies string has no BJC emojis', () => {
    const result = parseChampYear('2019 Bobby Jones Cup (Wisconsin)', '🏆');
    expect(result[0].emoji).toBe('🌳');
  });

  it('falls back to 🇺🇸 for Hilton Head when no trophies string provided', () => {
    const result = parseChampYear('2018 Bobby Jones Cup (Hilton Head)');
    expect(result[0].emoji).toBe('🇺🇸');
  });

  it('falls back to 🌳 for non-Hilton Head when no trophies string provided', () => {
    const result = parseChampYear('2019 Bobby Jones Cup (Wisconsin)');
    expect(result[0].emoji).toBe('🌳');
  });

  it('parses Member-Guest with location', () => {
    const result = parseChampYear('2019 Member-Guest (Chattanooga)');
    expect(result[0]).toMatchObject({
      award_type: 'member_guest',
      description: 'Chattanooga',
      emoji: '🍻',
    });
  });

  it('parses Unicorn entries', () => {
    const result = parseChampYear('2017 Unicorn\n2021 Unicorn');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ year: 2017, award_type: 'unicorn', emoji: '🦄' });
    expect(result[1]).toMatchObject({ year: 2021, award_type: 'unicorn', emoji: '🦄' });
  });

  it('parses Minerva Tour Playoffs winner', () => {
    const result = parseChampYear('2020 Minerva Tour Playoffs');
    expect(result[0]).toMatchObject({
      award_type: 'playoffs_winner',
      emoji: '🎖',
    });
  });

  it('parses Consolation Winner', () => {
    const result = parseChampYear('2021 Consolation Winner');
    expect(result[0]).toMatchObject({
      award_type: 'consolation_winner',
      emoji: '🥈',
    });
  });

  it('parses Edge Solutions Cup Playoffs', () => {
    const result = parseChampYear('2018 Edge Solutions Cup Playoffs');
    expect(result[0]).toMatchObject({
      award_type: 'edge_solutions_cup',
      emoji: '📀',
    });
  });

  it('parses Hole in One Club', () => {
    const result = parseChampYear('2021 Hole in One Club');
    expect(result[0]).toMatchObject({
      award_type: 'hole_in_one',
      emoji: '1️⃣',
    });
  });

  it('parses Scratch Champion', () => {
    const result = parseChampYear('2020 Scratch Champion');
    expect(result[0]).toMatchObject({
      award_type: 'scratch_champion',
      emoji: '🥇',
    });
  });

  it('handles concatenated entries without newlines', () => {
    const input = '2022 Bobby Jones Cup (Pinehurst) 2025 Member-Guest';
    const result = parseChampYear(input, '🌺');
    expect(result).toHaveLength(2);
    expect(result[0].award_type).toBe('bobby_jones_cup');
    expect(result[0].emoji).toBe('🌺'); // Team Azalea from trophies
    expect(result[1].award_type).toBe('member_guest');
  });

  it('handles complex multi-line trophy data (Robby Dewling)', () => {
    const champYear =
      '2017 Minerva Tour Champion\n2018 Bobby Jones Cup (Hilton Head)\n2019 Member-Guest (Chattanooga)\n2021 Minerva Tour Champion\n2021 Most Improved Golfer\n2021 Bobby Jones Cup (Michigan)\n2022 Member-Guest (Chattanooga)\n2022 Bobby Jones Cup (Pinehurst)\n2024 Minerva Tour Champion\n2024 Most Improved Golfer\n2024 Bobby Jones Cup (Streamsong)';
    const trophies = '🏆🏆🏆\n🍻🍻\n🇺🇸🌳🌳🌺\n📉📉';
    const result = parseChampYear(champYear, trophies);
    expect(result).toHaveLength(11);

    const champions = result.filter(r => r.award_type === 'minerva_tour_champion');
    expect(champions).toHaveLength(3);
    expect(champions.map(c => c.year)).toEqual([2017, 2021, 2024]);

    const bjc = result.filter(r => r.award_type === 'bobby_jones_cup');
    expect(bjc).toHaveLength(4);
    expect(bjc[0].emoji).toBe('🇺🇸'); // Hilton Head
    expect(bjc[1].emoji).toBe('🌳');   // Michigan - Team Magnolia
    expect(bjc[2].emoji).toBe('🌳');   // Pinehurst - Team Magnolia (from trophies order)
    expect(bjc[3].emoji).toBe('🌺');   // Streamsong - Team Azalea
  });

  it('handles Ashby Foltz complex data', () => {
    const champYear = '2018 Hole in One Club\n2019 Minerva Tour Champion\n2020 Minerva Tour Champion\n2020 Bobby Jones Cup (Atlanta)\n2022 Bobby Jones Cup (Pinehurst)\n2023 Minerva Tour Champion\n2023 Bobby Jones Cup (Washington)\n2024 Bobby Jones Cup (Streamsong)';
    const trophies = '🏆🏆🏆\n🌳🌳🌺🌺\n1️⃣';
    const result = parseChampYear(champYear, trophies);

    const bjc = result.filter(r => r.award_type === 'bobby_jones_cup');
    expect(bjc).toHaveLength(4);
    expect(bjc[0].emoji).toBe('🌳');   // Atlanta - Team Magnolia
    expect(bjc[1].emoji).toBe('🌳');   // Pinehurst - Team Magnolia
    expect(bjc[2].emoji).toBe('🌺');   // Washington - Team Azalea
    expect(bjc[3].emoji).toBe('🌺');   // Streamsong - Team Azalea
  });

  it('returns empty array for empty/null input', () => {
    expect(parseChampYear('')).toEqual([]);
    expect(parseChampYear(null as unknown as string)).toEqual([]);
    expect(parseChampYear(undefined as unknown as string)).toEqual([]);
  });

  it('returns empty array for non-parseable input', () => {
    expect(parseChampYear('no valid entries here')).toEqual([]);
  });
});

describe('parseSeasonFinish', () => {
  it('returns trimmed position string', () => {
    expect(parseSeasonFinish('1st')).toBe('1st');
    expect(parseSeasonFinish(' 6th ')).toBe('6th');
    expect(parseSeasonFinish('13th')).toBe('13th');
  });

  it('returns null for empty/falsy input', () => {
    expect(parseSeasonFinish('')).toBeNull();
    expect(parseSeasonFinish(null as unknown as string)).toBeNull();
    expect(parseSeasonFinish(undefined as unknown as string)).toBeNull();
  });
});

describe('getUniqueAwardEmojis', () => {
  it('returns unique emojis in order', () => {
    const awards: ParsedAward[] = [
      { year: 2021, award_type: 'minerva_tour_champion', award_name: 'Minerva Tour Champion', description: null, emoji: '🏆' },
      { year: 2022, award_type: 'minerva_tour_champion', award_name: 'Minerva Tour Champion', description: null, emoji: '🏆' },
      { year: 2019, award_type: 'most_improved', award_name: 'Most Improved Golfer', description: null, emoji: '📉' },
    ];
    expect(getUniqueAwardEmojis(awards)).toEqual(['🏆', '📉']);
  });

  it('returns empty array for no awards', () => {
    expect(getUniqueAwardEmojis([])).toEqual([]);
  });
});

describe('AWARD_EMOJI', () => {
  it('has all award types mapped', () => {
    const types = [
      'minerva_tour_champion', 'scratch_champion', 'most_improved',
      'bobby_jones_cup', 'member_guest', 'unicorn',
      'playoffs_winner', 'consolation_winner', 'edge_solutions_cup', 'hole_in_one',
    ];
    for (const t of types) {
      expect(AWARD_EMOJI[t as keyof typeof AWARD_EMOJI]).toBeDefined();
    }
  });
});

describe('AWARD_DISPLAY_NAMES', () => {
  it('has all award types with display names', () => {
    expect(Object.keys(AWARD_DISPLAY_NAMES)).toHaveLength(Object.keys(AWARD_EMOJI).length);
    for (const name of Object.values(AWARD_DISPLAY_NAMES)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
