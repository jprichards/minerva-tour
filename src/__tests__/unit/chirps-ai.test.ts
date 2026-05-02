import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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
      expect(prompt).toContain('already in the queue or recently used');
      expect(prompt).toContain('do NOT repeat');
      expect(prompt).toContain('$first_name is crushing it!');
      expect(prompt).toContain('$first_name is on fire!');
    });

    it('includes recently used chirps when provided', () => {
      const existing = ['$first_name is crushing it!'];
      const recentlyUsed = ['$first_name went low!'];
      const prompt = buildGenerationPrompt('excellent', 3, existing, recentlyUsed);
      expect(prompt).toContain('$first_name is crushing it!');
      expect(prompt).toContain('$first_name went low!');
      expect(prompt).toContain('already in the queue or recently used');
    });

    it('omits do-not-repeat section when both lists are empty', () => {
      const prompt = buildGenerationPrompt('rough', 4, []);
      expect(prompt).not.toContain('already in the queue or recently used');
    });

    it('requests JSON array output format', () => {
      const prompt = buildGenerationPrompt('bad', 2, []);
      expect(prompt).toContain('Respond with ONLY a JSON array');
      expect(prompt).toContain('no markdown');
    });
  });

  describe('generateChirps deduplication', () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn();

    function mockChain(finalValue: unknown) {
      const chain: Record<string, any> = {};
      const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.single = vi.fn().mockResolvedValue(finalValue);
      chain.maybeSingle = vi.fn().mockResolvedValue(finalValue);
      chain.then = (resolve: (v: unknown) => void) => Promise.resolve(finalValue).then(resolve);
      return chain;
    }

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = mockFetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('filters out AI-generated chirps that already exist in the DB', async () => {
      const { generateChirps } = await import('@/lib/chirps-ai');

      const insertFn = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase: any = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return mockChain({
              data: {
                value: {
                  api_endpoint: 'https://ai.test/v1/chat/completions',
                  api_key: 'test-key',
                  model: 'gpt-4',
                },
              },
              error: null,
            });
          }
          if (table === 'chirp_templates') {
            const chain: Record<string, any> = {};
            const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update'];
            for (const m of methods) {
              chain[m] = vi.fn().mockReturnValue(chain);
            }
            chain.insert = insertFn;
            chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
            chain.maybeSingle = vi.fn().mockResolvedValue({ data: { queue_position: 5 }, error: null });
            chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
              return Promise.resolve({
                count: 9,
                data: [
                  { template: '$first_name is already in DB!' },
                  { template: '$first_name duplicate from archive' },
                ],
                error: null,
              }).then(resolve);
            });
            return chain;
          }
          return mockChain({ data: null, error: null });
        }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify([
                '$first_name is already in DB!',
                '$first_name brand new chirp!',
                '$first_name duplicate from archive',
              ]),
            },
          }],
        }),
      });

      const results = await generateChirps(mockSupabase, 'excellent');

      expect(results).toHaveLength(1);
      expect(results[0].bucket).toBe('excellent');

      if (insertFn.mock.calls.length > 0) {
        const insertedRows = insertFn.mock.calls[0][0];
        const insertedTemplates = insertedRows.map((r: any) => r.template);
        expect(insertedTemplates).not.toContain('$first_name is already in DB!');
        expect(insertedTemplates).not.toContain('$first_name duplicate from archive');
        expect(insertedTemplates).toContain('$first_name brand new chirp!');
      }
    });

    it('deduplicates within the same AI response batch', async () => {
      const { generateChirps } = await import('@/lib/chirps-ai');

      const insertFn = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase: any = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return mockChain({
              data: {
                value: {
                  api_endpoint: 'https://ai.test/v1/chat/completions',
                  api_key: 'test-key',
                  model: 'gpt-4',
                },
              },
              error: null,
            });
          }
          if (table === 'chirp_templates') {
            const chain: Record<string, any> = {};
            const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update'];
            for (const m of methods) {
              chain[m] = vi.fn().mockReturnValue(chain);
            }
            chain.insert = insertFn;
            chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
            chain.maybeSingle = vi.fn().mockResolvedValue({ data: { queue_position: 5 }, error: null });
            chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
              return Promise.resolve({
                count: 9,
                data: [],
                error: null,
              }).then(resolve);
            });
            return chain;
          }
          return mockChain({ data: null, error: null });
        }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify([
                '$first_name is on fire!',
                '$first_name is on fire!',
              ]),
            },
          }],
        }),
      });

      const results = await generateChirps(mockSupabase, 'excellent');

      if (insertFn.mock.calls.length > 0) {
        const insertedRows = insertFn.mock.calls[0][0];
        expect(insertedRows).toHaveLength(1);
        expect(insertedRows[0].template).toBe('$first_name is on fire!');
      }
    });
  });
});
