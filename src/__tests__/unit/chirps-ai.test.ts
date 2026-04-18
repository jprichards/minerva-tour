import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildGenerationPrompt, CHIRPS_QUEUE_TARGET } from '@/lib/chirps-ai';
import { BUCKET_LABELS, CHIRP_WILDCARDS } from '@/lib/chirps';

describe('chirps-ai', () => {
  describe('CHIRPS_QUEUE_TARGET', () => {
    it('is 10', () => {
      expect(CHIRPS_QUEUE_TARGET).toBe(10);
    });
  });

  describe('buildGenerationPrompt', () => {
    it('includes the bucket label', () => {
      const prompt = buildGenerationPrompt('legendary', 5, []);
      expect(prompt).toContain(BUCKET_LABELS.legendary);
    });

    it('includes the requested count', () => {
      const prompt = buildGenerationPrompt('bad', 3, []);
      expect(prompt).toContain('exactly 3');
    });

    it('uses singular when count is 1', () => {
      const prompt = buildGenerationPrompt('excellent', 1, []);
      expect(prompt).toContain('exactly 1 unique golf chirp template for');
      expect(prompt).toContain('a JSON array of 1 string,');
    });

    it('uses plural when count > 1', () => {
      const prompt = buildGenerationPrompt('excellent', 5, []);
      expect(prompt).toContain('exactly 5 unique golf chirp templates for');
      expect(prompt).toContain('a JSON array of 5 strings,');
    });

    it('includes all wildcard tokens and descriptions', () => {
      const prompt = buildGenerationPrompt('neutral', 2, []);
      for (const w of CHIRP_WILDCARDS) {
        expect(prompt).toContain(w.token);
        expect(prompt).toContain(w.description);
      }
    });

    it('requires $first_name usage', () => {
      const prompt = buildGenerationPrompt('mediocre', 3, []);
      expect(prompt).toContain('You MUST use $first_name in every chirp');
    });

    it('includes example chirps from the bucket', () => {
      const prompt = buildGenerationPrompt('legendary', 5, []);
      expect(prompt).toContain('Example chirps for this bucket:');
      const exampleLines = prompt.split('\n').filter((l) => /^\d+\.\s/.test(l));
      expect(exampleLines.length).toBeGreaterThanOrEqual(1);
      expect(exampleLines.length).toBeLessThanOrEqual(3);
    });

    it('includes existing queue items when provided', () => {
      const existing = ['$first_name is crushing it!', '$first_name is on fire!'];
      const prompt = buildGenerationPrompt('excellent', 3, existing);
      expect(prompt).toContain('Chirps already in the queue');
      expect(prompt).toContain('do NOT repeat');
      expect(prompt).toContain('$first_name is crushing it!');
      expect(prompt).toContain('$first_name is on fire!');
    });

    it('omits existing-queue section when list is empty', () => {
      const prompt = buildGenerationPrompt('rough', 4, []);
      expect(prompt).not.toContain('Chirps already in the queue');
    });

    it('requests JSON array output format', () => {
      const prompt = buildGenerationPrompt('bad', 2, []);
      expect(prompt).toContain('Respond with ONLY a JSON array');
      expect(prompt).toContain('no markdown');
    });
  });
});
