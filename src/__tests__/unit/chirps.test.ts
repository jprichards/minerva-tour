import { describe, it, expect, vi } from 'vitest';
import {
  getChirpBucket,
  getChirp,
  getChirpFromTemplates,
  CHIRP_TEMPLATES,
  BUCKET_LABELS,
  ALL_BUCKETS,
  CHIRP_WILDCARDS,
  type ChirpBucket,
  type ChirpContext,
} from '@/lib/chirps';

// Helper to build a minimal context
function ctx(firstName: string, overrides: Partial<ChirpContext> = {}): ChirpContext {
  return { firstName, ...overrides };
}

// ============================================
// CHIRP_TEMPLATES — structure validation
// ============================================
describe('CHIRP_TEMPLATES', () => {
  it('has all 7 performance buckets defined', () => {
    const expectedBuckets: ChirpBucket[] = [
      'legendary', 'excellent', 'solid', 'mediocre', 'rough', 'bad', 'terrible',
    ];
    for (const bucket of expectedBuckets) {
      expect(CHIRP_TEMPLATES[bucket]).toBeDefined();
      expect(CHIRP_TEMPLATES[bucket].length).toBeGreaterThan(0);
    }
  });

  it('all templates are non-empty strings', () => {
    for (const [, templates] of Object.entries(CHIRP_TEMPLATES)) {
      for (const template of templates) {
        expect(typeof template).toBe('string');
        expect(template.length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================
// BUCKET_LABELS — exported labels
// ============================================
describe('BUCKET_LABELS', () => {
  it('has a label for every bucket', () => {
    for (const bucket of ALL_BUCKETS) {
      expect(BUCKET_LABELS[bucket]).toBeDefined();
      expect(typeof BUCKET_LABELS[bucket]).toBe('string');
    }
  });
});

// ============================================
// ALL_BUCKETS — ordered list
// ============================================
describe('ALL_BUCKETS', () => {
  it('contains exactly 7 buckets', () => {
    expect(ALL_BUCKETS.length).toBe(7);
  });

  it('is ordered from best to worst', () => {
    expect(ALL_BUCKETS[0]).toBe('legendary');
    expect(ALL_BUCKETS[6]).toBe('terrible');
  });
});

// ============================================
// CHIRP_WILDCARDS — exported wildcard list
// ============================================
describe('CHIRP_WILDCARDS', () => {
  it('has 6 supported wildcards', () => {
    expect(CHIRP_WILDCARDS.length).toBe(6);
  });

  it('includes $first_name, $course, $gross, $net, $holes, $handicap', () => {
    const tokens = CHIRP_WILDCARDS.map((w) => w.token);
    expect(tokens).toContain('$first_name');
    expect(tokens).toContain('$course');
    expect(tokens).toContain('$gross');
    expect(tokens).toContain('$net');
    expect(tokens).toContain('$holes');
    expect(tokens).toContain('$handicap');
  });

  it('each wildcard has a description', () => {
    for (const w of CHIRP_WILDCARDS) {
      expect(w.description.length).toBeGreaterThan(0);
    }
  });
});

// ============================================
// getChirpBucket — maps net score to bucket
// ============================================
describe('getChirpBucket', () => {
  it('returns "legendary" for -10 or better', () => {
    expect(getChirpBucket(-10)).toBe('legendary');
    expect(getChirpBucket(-15)).toBe('legendary');
    expect(getChirpBucket(-20)).toBe('legendary');
  });

  it('returns "excellent" for -9 to -5', () => {
    expect(getChirpBucket(-9)).toBe('excellent');
    expect(getChirpBucket(-7)).toBe('excellent');
    expect(getChirpBucket(-5)).toBe('excellent');
  });

  it('returns "solid" for -4 to +1', () => {
    expect(getChirpBucket(-4)).toBe('solid');
    expect(getChirpBucket(-2)).toBe('solid');
    expect(getChirpBucket(0)).toBe('solid');
    expect(getChirpBucket(1)).toBe('solid');
  });

  it('returns "mediocre" for +2 to +4', () => {
    expect(getChirpBucket(2)).toBe('mediocre');
    expect(getChirpBucket(3)).toBe('mediocre');
    expect(getChirpBucket(4)).toBe('mediocre');
  });

  it('returns "rough" for +5 to +9', () => {
    expect(getChirpBucket(5)).toBe('rough');
    expect(getChirpBucket(7)).toBe('rough');
    expect(getChirpBucket(9)).toBe('rough');
  });

  it('returns "bad" for +10 to +19', () => {
    expect(getChirpBucket(10)).toBe('bad');
    expect(getChirpBucket(14)).toBe('bad');
    expect(getChirpBucket(19)).toBe('bad');
  });

  it('returns "terrible" for +20 or worse', () => {
    expect(getChirpBucket(20)).toBe('terrible');
    expect(getChirpBucket(30)).toBe('terrible');
    expect(getChirpBucket(50)).toBe('terrible');
  });
});

// ============================================
// getChirp — hardcoded fallback with context
// ============================================
describe('getChirp', () => {
  it('returns a string for any valid net score', () => {
    const chirp = getChirp(-5, ctx('John'));
    expect(typeof chirp).toBe('string');
    expect(chirp.length).toBeGreaterThan(0);
  });

  it('substitutes $first_name with the player name', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const chirp = getChirp(-10, ctx('Ashby'));
    expect(chirp).not.toContain('$first_name');
    spy.mockRestore();
  });

  it('returns different chirps for different buckets', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const legendary = getChirp(-15, ctx('John'));
    const terrible = getChirp(25, ctx('John'));
    expect(legendary).not.toBe(terrible);
    spy.mockRestore();
  });

  it('handles edge case at bucket boundaries', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const at10 = getChirp(-10, ctx('Test'));
    const at9 = getChirp(-9, ctx('Test'));
    expect(typeof at10).toBe('string');
    expect(typeof at9).toBe('string');
    spy.mockRestore();
  });

  it('works with empty first name', () => {
    const chirp = getChirp(0, ctx(''));
    expect(typeof chirp).toBe('string');
  });

  it('is deterministic with fixed random seed', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const chirp1 = getChirp(3, ctx('George'));
    spy.mockReturnValue(0.5);
    const chirp2 = getChirp(3, ctx('George'));
    expect(chirp1).toBe(chirp2);
    spy.mockRestore();
  });
});

// ============================================
// getChirpFromTemplates — DB-backed with fallback
// ============================================
describe('getChirpFromTemplates', () => {
  it('uses DB templates when bucket has entries', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { solid: ['DB chirp for $first_name'] };
    const chirp = getChirpFromTemplates(dbTemplates, 0, ctx('Bob'));
    expect(chirp).toBe('DB chirp for Bob');
    spy.mockRestore();
  });

  it('falls back to hardcoded when bucket is empty in DB', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { solid: [] };
    const chirp = getChirpFromTemplates(dbTemplates, 0, ctx('Alice'));
    expect(chirp).not.toContain('$first_name');
    expect(chirp.length).toBeGreaterThan(0);
    expect(CHIRP_TEMPLATES.solid[0].replace(/\$first_name/g, 'Alice')).toBe(chirp);
    spy.mockRestore();
  });

  it('falls back to hardcoded when bucket is missing from DB', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const chirp = getChirpFromTemplates({}, -15, ctx('Charlie'));
    expect(chirp).toBe(CHIRP_TEMPLATES.legendary[0].replace(/\$first_name/g, 'Charlie'));
    spy.mockRestore();
  });

  it('substitutes $first_name in DB templates', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { terrible: ['$first_name should go home'] };
    const chirp = getChirpFromTemplates(dbTemplates, 25, ctx('Dave'));
    expect(chirp).toBe('Dave should go home');
    expect(chirp).not.toContain('$first_name');
    spy.mockRestore();
  });

  it('picks random template from DB bucket', () => {
    const dbTemplates = {
      mediocre: ['Template A for $first_name', 'Template B for $first_name', 'Template C for $first_name'],
    };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const chirpA = getChirpFromTemplates(dbTemplates, 3, ctx('Eve'));
    expect(chirpA).toBe('Template A for Eve');

    spy.mockReturnValue(0.99);
    const chirpC = getChirpFromTemplates(dbTemplates, 3, ctx('Eve'));
    expect(chirpC).toBe('Template C for Eve');
    spy.mockRestore();
  });
});

// ============================================
// Wildcard substitution — $course, $gross, $net, $holes, $handicap
// ============================================
describe('wildcard substitution', () => {
  it('substitutes $course with the course name', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { solid: ['$first_name crushed $course'] };
    const chirp = getChirpFromTemplates(dbTemplates, 0, ctx('John', { course: 'Aiken Golf Club' }));
    expect(chirp).toBe('John crushed Aiken Golf Club');
    spy.mockRestore();
  });

  it('substitutes $gross with the gross score', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { mediocre: ['$first_name shot a $gross'] };
    const chirp = getChirpFromTemplates(dbTemplates, 3, ctx('Bob', { gross: 82 }));
    expect(chirp).toBe('Bob shot a 82');
    spy.mockRestore();
  });

  it('substitutes $net with signed net strokes over par', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { rough: ['$first_name posted $net'] };

    const positive = getChirpFromTemplates(dbTemplates, 7, ctx('Eve', { net: 7 }));
    expect(positive).toBe('Eve posted +7');

    const negative = getChirpFromTemplates(dbTemplates, 7, ctx('Eve', { net: -3 }));
    expect(negative).toBe('Eve posted -3');

    const even = getChirpFromTemplates(dbTemplates, 7, ctx('Eve', { net: 0 }));
    expect(even).toBe('Eve posted E');

    spy.mockRestore();
  });

  it('substitutes $holes with holes played', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { bad: ['$first_name only through $holes holes'] };
    const chirp = getChirpFromTemplates(dbTemplates, 12, ctx('Tim', { holes: 14 }));
    expect(chirp).toBe('Tim only through 14 holes');
    spy.mockRestore();
  });

  it('substitutes $handicap with handicap index', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { terrible: ['With a $handicap index, $first_name has no excuse'] };
    const chirp = getChirpFromTemplates(dbTemplates, 25, ctx('Sam', { handicap: 24.2 }));
    expect(chirp).toBe('With a 24.2 index, Sam has no excuse');
    spy.mockRestore();
  });

  it('substitutes all wildcards at once', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = {
      mediocre: ['$first_name ($handicap) shot $gross ($net) through $holes at $course'],
    };
    const chirp = getChirpFromTemplates(dbTemplates, 3, ctx('John', {
      course: 'Pine Valley',
      gross: 85,
      net: 3,
      holes: 18,
      handicap: 12.5,
    }));
    expect(chirp).toBe('John (12.5) shot 85 (+3) through 18 at Pine Valley');
    spy.mockRestore();
  });

  it('leaves wildcard tokens in place when context value is null', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const dbTemplates = { solid: ['$first_name at $course scored $gross'] };
    const chirp = getChirpFromTemplates(dbTemplates, 0, ctx('Alice'));
    expect(chirp).toBe('Alice at $course scored $gross');
    spy.mockRestore();
  });

  it('works with getChirp (hardcoded fallback) using full context', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const chirp = getChirp(-10, ctx('Ashby', { course: 'Augusta', gross: 62, net: -10, holes: 18, handicap: 2.1 }));
    expect(chirp).toContain('Ashby');
    expect(chirp).not.toContain('$first_name');
    spy.mockRestore();
  });
});
