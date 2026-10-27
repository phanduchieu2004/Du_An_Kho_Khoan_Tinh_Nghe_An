const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidAssignmentDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getVietnamDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isWithinAssignmentPeriod(
  startDate: string | null,
  endDate: string | null,
  now = new Date(),
): boolean {
  if (startDate === null && endDate === null) return true;
  if (
    startDate === null ||
    endDate === null ||
    !isValidAssignmentDate(startDate) ||
    !isValidAssignmentDate(endDate) ||
    startDate > endDate
  ) {
    return false;
  }
  const today = getVietnamDate(now);
  return today >= startDate && today <= endDate;
}
