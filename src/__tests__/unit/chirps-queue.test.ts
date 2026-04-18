import { describe, it, expect } from 'vitest';
import { ALL_BUCKETS, NO_CHIRP_BUCKETS, getChirpBucket, DEFAULT_BUCKET_RANGES, type ChirpBucket } from '@/lib/chirps';

describe('chirps queue logic', () => {
  describe('ALL_BUCKETS', () => {
    it('has exactly 6 entries', () => {
      expect(ALL_BUCKETS).toHaveLength(6);
    });

    it('contains all expected bucket names', () => {
      const expected: ChirpBucket[] = [
        'legendary', 'excellent', 'neutral',
        'mediocre', 'rough', 'bad',
      ];
      expect(ALL_BUCKETS).toEqual(expected);
    });
  });

  describe('NO_CHIRP_BUCKETS', () => {
    it('contains mediocre', () => {
      expect(NO_CHIRP_BUCKETS.has('mediocre')).toBe(true);
    });

    it('does not contain active buckets', () => {
      expect(NO_CHIRP_BUCKETS.has('legendary')).toBe(false);
      expect(NO_CHIRP_BUCKETS.has('excellent')).toBe(false);
      expect(NO_CHIRP_BUCKETS.has('bad')).toBe(false);
    });
  });

  describe('getChirpBucket', () => {
    it('returns legendary for -5', () => {
      expect(getChirpBucket(-5)).toBe('legendary');
    });

    it('returns legendary for -10 (deep under par)', () => {
      expect(getChirpBucket(-10)).toBe('legendary');
    });

    it('returns excellent for -4', () => {
      expect(getChirpBucket(-4)).toBe('excellent');
    });

    it('returns excellent for -1', () => {
      expect(getChirpBucket(-1)).toBe('excellent');
    });

    it('returns neutral for 0 (even par)', () => {
      expect(getChirpBucket(0)).toBe('neutral');
    });

    it('returns neutral for +1', () => {
      expect(getChirpBucket(1)).toBe('neutral');
    });

    it('returns mediocre for +2', () => {
      expect(getChirpBucket(2)).toBe('mediocre');
    });

    it('returns mediocre for +4', () => {
      expect(getChirpBucket(4)).toBe('mediocre');
    });

    it('returns rough for +5', () => {
      expect(getChirpBucket(5)).toBe('rough');
    });

    it('returns rough for +8', () => {
      expect(getChirpBucket(8)).toBe('rough');
    });

    it('returns bad for +9', () => {
      expect(getChirpBucket(9)).toBe('bad');
    });

    it('returns bad for +30 (extremely over par)', () => {
      expect(getChirpBucket(30)).toBe('bad');
    });

    it('respects custom ranges', () => {
      const customRanges = [
        { bucket: 'legendary' as ChirpBucket, maxNet: -10 },
        { bucket: 'excellent' as ChirpBucket, maxNet: -5 },
        { bucket: 'neutral' as ChirpBucket, maxNet: 0 },
        { bucket: 'mediocre' as ChirpBucket, maxNet: 3 },
        { bucket: 'rough' as ChirpBucket, maxNet: 6 },
        { bucket: 'bad' as ChirpBucket, maxNet: null },
      ];
      expect(getChirpBucket(-6, customRanges)).toBe('excellent');
      expect(getChirpBucket(-11, customRanges)).toBe('legendary');
      expect(getChirpBucket(7, customRanges)).toBe('bad');
    });

    it('DEFAULT_BUCKET_RANGES has 6 entries', () => {
      expect(DEFAULT_BUCKET_RANGES).toHaveLength(6);
    });

    it('DEFAULT_BUCKET_RANGES last entry has null maxNet', () => {
      const last = DEFAULT_BUCKET_RANGES[DEFAULT_BUCKET_RANGES.length - 1];
      expect(last.maxNet).toBeNull();
      expect(last.bucket).toBe('bad');
    });
  });
});
