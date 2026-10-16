import { describe, expect, it } from 'vitest';
import { countWorkingDays, formatDateOnly, parseDateOnly } from '../src/utils/dates.js';

describe('date-only helpers', () => {
  it('parses YYYY-MM-DD to UTC midnight without timezone shift', () => {
    const d = parseDateOnly('2026-03-01');
    expect(d.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(formatDateOnly(d)).toBe('2026-03-01');
  });

  it.each(['2026-02-30', '2026-13-01', '26-01-01', '2026/01/01', '', 'tomorrow', null])('rejects invalid date %s', (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });

  it('counts Monday to Friday only, inclusive', () => {
    // 2026-10-19 is a Monday.
    expect(countWorkingDays(parseDateOnly('2026-10-19'), parseDateOnly('2026-10-19'))).toBe(1);
    expect(countWorkingDays(parseDateOnly('2026-10-19'), parseDateOnly('2026-10-23'))).toBe(5);
    expect(countWorkingDays(parseDateOnly('2026-10-19'), parseDateOnly('2026-10-25'))).toBe(5);
    expect(countWorkingDays(parseDateOnly('2026-10-23'), parseDateOnly('2026-10-26'))).toBe(2);
    expect(countWorkingDays(parseDateOnly('2026-10-24'), parseDateOnly('2026-10-25'))).toBe(0);
    expect(countWorkingDays(parseDateOnly('2026-10-19'), parseDateOnly('2026-11-01'))).toBe(10);
  });
});
