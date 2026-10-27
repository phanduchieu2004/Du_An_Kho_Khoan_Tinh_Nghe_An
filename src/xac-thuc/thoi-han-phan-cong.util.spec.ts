import {
  isValidAssignmentDate,
  isWithinAssignmentPeriod,
} from './thoi-han-phan-cong.util.js';

describe('assignment period utilities', () => {
  it('validates calendar dates', () => {
    expect(isValidAssignmentDate('2024-02-29')).toBe(true);
    expect(isValidAssignmentDate('2025-02-29')).toBe(false);
    expect(isValidAssignmentDate('2025-2-03')).toBe(false);
  });

  it('keeps the whole end date active in Vietnam time', () => {
    const endOfVietnamDate = new Date('2026-03-01T16:59:59.000Z');
    const nextVietnamDate = new Date('2026-03-01T17:00:00.000Z');

    expect(
      isWithinAssignmentPeriod('2026-03-01', '2026-03-01', endOfVietnamDate),
    ).toBe(true);
    expect(
      isWithinAssignmentPeriod('2026-03-01', '2026-03-01', nextVietnamDate),
    ).toBe(false);
  });

  it('preserves assignments without date limits and rejects malformed ranges', () => {
    expect(isWithinAssignmentPeriod(null, null)).toBe(true);
    expect(isWithinAssignmentPeriod('2026-03-02', '2026-03-01')).toBe(false);
    expect(isWithinAssignmentPeriod('2026-03-01', null)).toBe(false);
  });
});
