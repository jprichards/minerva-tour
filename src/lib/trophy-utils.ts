/**
 * Trophy parsing and emoji mapping utilities.
 *
 * Parses the "Champ Year" column from the Glide Profile sheet
 * and maps award types to their canonical emoji representations.
 *
 * Bobby Jones Cup (BJC) emoji logic:
 *   - 🇺🇸 = BJC played at Hilton Head (pre-team era)
 *   - 🌳 = BJC winner was on Team Magnolia
 *   - 🌺 = BJC winner was on Team Azalea
 *   Because the Champ Year column only lists the location, not the team,
 *   we determine the correct emoji from the "Trophies" column which has
 *   the actual emojis assigned to each player.
 */

export type AwardType =
  | 'minerva_tour_champion'
  | 'scratch_champion'
  | 'most_improved'
  | 'bobby_jones_cup'
  | 'member_guest'
  | 'unicorn'
  | 'playoffs_winner'
  | 'consolation_winner'
  | 'edge_solutions_cup'
  | 'hole_in_one';

export interface ParsedAward {
  year: number;
  award_type: AwardType;
  award_name: string;
  description: string | null;
  emoji: string;
}

/** Map of award type to its default emoji */
export const AWARD_EMOJI: Record<AwardType, string> = {
  minerva_tour_champion: '🏆',
  scratch_champion: '🥇',
  most_improved: '📉',
  bobby_jones_cup: '🌳',
  member_guest: '🍻',
  unicorn: '🦄',
  playoffs_winner: '🎖',
  consolation_winner: '🥈',
  edge_solutions_cup: '📀',
  hole_in_one: '1️⃣',
};

/** Map of award type to display name */
export const AWARD_DISPLAY_NAMES: Record<AwardType, string> = {
  minerva_tour_champion: 'Minerva Tour Champion',
  scratch_champion: 'Scratch Champion',
  most_improved: 'Most Improved Golfer',
  bobby_jones_cup: 'Bobby Jones Cup',
  member_guest: 'Member-Guest',
  unicorn: 'Unicorn',
  playoffs_winner: 'Minerva Tour Playoffs',
  consolation_winner: 'Consolation Winner',
  edge_solutions_cup: 'Edge Solutions Cup',
  hole_in_one: 'Hole in One Club',
};

/** The set of emojis that represent BJC wins */
const BJC_EMOJIS = new Set(['🌳', '🌺', '🇺🇸']);

/**
 * Extract BJC-related emojis from the Trophies column string.
 * Returns an array like ['🇺🇸', '🌳', '🌳'] preserving order and count.
 */
export function extractBjcEmojis(trophiesStr: string): string[] {
  if (!trophiesStr || typeof trophiesStr !== 'string') return [];

  const result: string[] = [];
  // We need to iterate over the string looking for our known BJC emojis.
  // Some emojis are multi-codepoint (🇺🇸 is flag sequence U+1F1FA U+1F1F8).
  const segments = [...trophiesStr];
  let i = 0;
  while (i < segments.length) {
    // Check for flag emoji (two regional indicator chars)
    if (i + 1 < segments.length) {
      const pair = segments[i] + segments[i + 1];
      if (BJC_EMOJIS.has(pair)) {
        result.push(pair);
        i += 2;
        continue;
      }
    }
    // Check single char emojis
    if (BJC_EMOJIS.has(segments[i])) {
      result.push(segments[i]);
    }
    i++;
  }
  return result;
}

/**
 * Determine award type from the award name string.
 */
function classifyAward(name: string): { type: AwardType; description: string | null } | null {
  const lower = name.toLowerCase().trim();

  if (lower.includes('minerva tour champion')) {
    return { type: 'minerva_tour_champion', description: null };
  }
  if (lower.includes('scratch champion')) {
    return { type: 'scratch_champion', description: null };
  }
  if (lower.includes('most improved')) {
    return { type: 'most_improved', description: null };
  }
  if (lower.includes('bobby jones cup')) {
    const locMatch = name.match(/\(([^)]+)\)/);
    return { type: 'bobby_jones_cup', description: locMatch ? locMatch[1].trim() : null };
  }
  if (lower.includes('member-guest') || lower.includes('member guest')) {
    const locMatch = name.match(/\(([^)]+)\)/);
    return { type: 'member_guest', description: locMatch ? locMatch[1].trim() : null };
  }
  if (lower.includes('unicorn')) {
    return { type: 'unicorn', description: null };
  }
  if (lower.includes('minerva tour playoff')) {
    return { type: 'playoffs_winner', description: null };
  }
  if (lower.includes('consolation')) {
    return { type: 'consolation_winner', description: null };
  }
  if (lower.includes('edge solutions')) {
    return { type: 'edge_solutions_cup', description: null };
  }
  if (lower.includes('hole in one')) {
    return { type: 'hole_in_one', description: null };
  }

  return null;
}

/**
 * Parse a "Champ Year" string into structured award entries.
 *
 * Input format: newline-separated entries like:
 *   "2021 Minerva Tour Champion"
 *   "2019 Bobby Jones Cup (Wisconsin)"
 *   "2024 Member-Guest (Aiken)"
 *
 * Some entries may be concatenated without newlines (e.g. "2022 Bobby Jones Cup (Pinehurst) 2025 Member-Guest").
 * We handle this by splitting on year boundaries.
 *
 * @param champYear - The "Champ Year" column value
 * @param trophiesStr - Optional "Trophies" column value used to determine the
 *   correct BJC emoji (Team Magnolia 🌳 vs Team Azalea 🌺 vs Hilton Head 🇺🇸).
 *   If not provided, Hilton Head entries get 🇺🇸 and others default to 🌳.
 */
export function parseChampYear(champYear: string, trophiesStr?: string): ParsedAward[] {
  if (!champYear || typeof champYear !== 'string') return [];

  const awards: ParsedAward[] = [];

  // Extract BJC emojis from the Trophies column for correct team assignment
  const bjcEmojis = trophiesStr ? extractBjcEmojis(trophiesStr) : [];
  let bjcEmojiIdx = 0;

  // Split by newlines first
  const lines = champYear.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Handle concatenated entries: split when a 4-digit year appears mid-line
    const entries = line.split(/(?<=\))\s+(?=\d{4}\s)/).flatMap(part => {
      return part.split(/\s+(?=\d{4}\s+[A-Z])/).filter(Boolean);
    });

    for (const entry of entries) {
      const yearMatch = entry.match(/^(\d{4})\s+(.+)$/);
      if (!yearMatch) continue;

      const year = parseInt(yearMatch[1]);
      const awardName = yearMatch[2].trim();

      const classified = classifyAward(awardName);
      if (!classified) continue;

      let emoji = AWARD_EMOJI[classified.type];

      // Assign Bobby Jones Cup emoji from the Trophies column
      if (classified.type === 'bobby_jones_cup') {
        if (bjcEmojiIdx < bjcEmojis.length) {
          // Consume the next BJC emoji from the Trophies column
          emoji = bjcEmojis[bjcEmojiIdx];
          bjcEmojiIdx++;
        } else {
          // Fallback: Hilton Head gets 🇺🇸, others get 🌳
          const loc = classified.description?.toLowerCase() || '';
          emoji = loc.includes('hilton head') ? '🇺🇸' : '🌳';
        }
      }

      awards.push({
        year,
        award_type: classified.type,
        award_name: AWARD_DISPLAY_NAMES[classified.type],
        description: classified.description,
        emoji,
      });
    }
  }

  return awards;
}

/**
 * Parse season finish columns from the Profile sheet.
 * Returns structured finish data.
 */
export function parseSeasonFinish(position: string): string | null {
  if (!position || typeof position !== 'string') return null;
  const trimmed = position.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Get all unique emojis for a list of awards (for compact badge display).
 */
export function getUniqueAwardEmojis(awards: ParsedAward[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of awards) {
    if (!seen.has(a.emoji)) {
      seen.add(a.emoji);
      result.push(a.emoji);
    }
  }
  return result;
}
