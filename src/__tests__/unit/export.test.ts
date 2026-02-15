import { describe, it, expect } from 'vitest';
import { generateCSV, generateLeaderboardHTML } from '@/lib/export';

describe('CSV Generation', () => {
  it('generates CSV from simple data', () => {
    const data = [
      { name: 'Alice', score: 85 },
      { name: 'Bob', score: 90 },
    ];
    const csv = generateCSV(data);
    expect(csv).toBe('name,score\nAlice,85\nBob,90');
  });

  it('handles empty data', () => {
    const csv = generateCSV([]);
    expect(csv).toBe('');
  });

  it('escapes commas in values', () => {
    const data = [{ name: 'Smith, John', score: 80 }];
    const csv = generateCSV(data);
    expect(csv).toContain('"Smith, John"');
  });

  it('escapes quotes in values', () => {
    const data = [{ name: 'The "Big" Player', score: 75 }];
    const csv = generateCSV(data);
    expect(csv).toContain('"The ""Big"" Player"');
  });

  it('uses custom columns when provided', () => {
    const data = [
      { name: 'Alice', score: 85, hidden: 'private' },
    ];
    const csv = generateCSV(data, ['name', 'score']);
    expect(csv).toBe('name,score\nAlice,85');
    expect(csv).not.toContain('hidden');
    expect(csv).not.toContain('private');
  });

  it('formats null/undefined as empty string', () => {
    const data = [{ name: null, score: undefined }];
    const csv = generateCSV(data as any);
    expect(csv).toBe('name,score\n,');
  });

  it('formats boolean values', () => {
    const data = [{ name: 'Alice', active: true }, { name: 'Bob', active: false }];
    const csv = generateCSV(data);
    expect(csv).toContain('Yes');
    expect(csv).toContain('No');
  });
});

describe('Leaderboard HTML Generation', () => {
  it('generates HTML table from entries', () => {
    const entries = [
      { rank: 1, name: 'Alice', score: '-2', points: '10' },
      { rank: 2, name: 'Bob', score: '+1', points: '7' },
    ];
    const html = generateLeaderboardHTML(entries);
    expect(html).toContain('<table>');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('-2');
    expect(html).toContain('+1');
  });

  it('includes course column when present', () => {
    const entries = [
      { rank: 1, name: 'Alice', score: '-2', points: '10', course: 'Pine Valley' },
    ];
    const html = generateLeaderboardHTML(entries);
    expect(html).toContain('Course');
    expect(html).toContain('Pine Valley');
  });

  it('escapes HTML in values', () => {
    const entries = [
      { rank: 1, name: '<script>alert("xss")</script>', score: '0', points: '5' },
    ];
    const html = generateLeaderboardHTML(entries);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
