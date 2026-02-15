import { describe, it, expect, vi } from 'vitest';
import {
  getChirpBucket,
  getChirp,
  CHIRP_TEMPLATES,
  type ChirpBucket,
} from '@/lib/chirps';

// ============================================
// CHIRP_TEMPLATES — structure validation
// ============================================
describe('CHIRP_TEMPLATES', () => {
  it('has all 7 performance buckets defined', () => {
    const expectedBuckets: ChirpBucket[] = [
      'legendary',    // -10 or better
      'excellent',    // -9 to -5
      'solid',        // -4 to +1
      'mediocre',     // +2 to +4
      'rough',        // +5 to +9
      'bad',          // +10 to +19
      'terrible',     // +20 or worse
    ];
    for (const bucket of expectedBuckets) {
      expect(CHIRP_TEMPLATES[bucket]).toBeDefined();
      expect(CHIRP_TEMPLATES[bucket].length).toBeGreaterThan(0);
    }
  });

  it('all templates are non-empty strings', () => {
    for (const [bucket, templates] of Object.entries(CHIRP_TEMPLATES)) {
      for (const template of templates) {
        expect(typeof template).toBe('string');
        expect(template.length).toBeGreaterThan(0);
      }
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
// getChirp — generates personalized chirps
// ============================================
describe('getChirp', () => {
  it('returns a string for any valid net score', () => {
    const chirp = getChirp(-5, 'John');
    expect(typeof chirp).toBe('string');
    expect(chirp.length).toBeGreaterThan(0);
  });

  it('substitutes $first_name with the player name', () => {
    // Mock Math.random to always return 0 (first template)
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    
    const chirp = getChirp(-10, 'Ashby');
    // Templates with $first_name should have it replaced
    // Even if the first template doesn't have $first_name, the function should work
    expect(chirp).not.toContain('$first_name');
    
    spy.mockRestore();
  });

  it('returns different chirps for different buckets', () => {
    // Use deterministic random (first template each time)
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    
    const legendary = getChirp(-15, 'John');
    const terrible = getChirp(25, 'John');
    
    // Different buckets should have different first templates
    expect(legendary).not.toBe(terrible);
    
    spy.mockRestore();
  });

  it('handles edge case at bucket boundaries', () => {
    // -10 is legendary, -9 is excellent
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    
    const at10 = getChirp(-10, 'Test');
    const at9 = getChirp(-9, 'Test');
    
    // These are from different buckets, so first template should differ
    // (unless by coincidence they're the same, but they shouldn't be)
    expect(typeof at10).toBe('string');
    expect(typeof at9).toBe('string');
    
    spy.mockRestore();
  });

  it('works with empty first name', () => {
    const chirp = getChirp(0, '');
    expect(typeof chirp).toBe('string');
  });

  it('is deterministic with fixed random seed', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const chirp1 = getChirp(3, 'George');
    spy.mockReturnValue(0.5);
    const chirp2 = getChirp(3, 'George');
    expect(chirp1).toBe(chirp2);
    spy.mockRestore();
  });
});
