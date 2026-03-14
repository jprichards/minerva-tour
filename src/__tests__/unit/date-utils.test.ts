import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatLocalDate } from '@/lib/date-utils';

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight, not UTC', () => {
    const d = parseLocalDate('2025-03-03');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2); // March = 2
    expect(d.getDate()).toBe(3);
  });

  it('does not shift date backward for US timezones', () => {
    const d = parseLocalDate('2025-01-01');
    expect(d.getDate()).toBe(1);
  });

  it('handles end-of-month dates', () => {
    const d = parseLocalDate('2025-03-31');
    expect(d.getDate()).toBe(31);
    expect(d.getMonth()).toBe(2);
  });

  it('handles leap year date', () => {
    const d = parseLocalDate('2024-02-29');
    expect(d.getDate()).toBe(29);
    expect(d.getMonth()).toBe(1);
  });
});

describe('formatLocalDate', () => {
  it('returns a formatted string with the correct date', () => {
    const formatted = formatLocalDate('2025-03-03');
    expect(formatted).toContain('3');
    expect(formatted).toContain('2025');
  });

  it('accepts Intl.DateTimeFormatOptions', () => {
    const formatted = formatLocalDate('2025-03-03', { month: 'short', day: 'numeric' });
    expect(formatted).toContain('3');
    expect(formatted.toLowerCase()).toContain('mar');
  });

  it('never returns the previous day', () => {
    const dates = ['2025-03-03', '2025-06-15', '2025-12-01', '2025-01-01'];
    for (const dateStr of dates) {
      const expectedDay = parseInt(dateStr.split('-')[2], 10);
      const parsed = parseLocalDate(dateStr);
      expect(parsed.getDate()).toBe(expectedDay);
    }
  });
});
