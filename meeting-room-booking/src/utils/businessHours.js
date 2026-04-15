'use strict';

const BUSINESS_START_HOUR = 8;   // 08:00
const BUSINESS_END_HOUR   = 20;  // 20:00
const BUSINESS_DAYS       = new Set([1, 2, 3, 4, 5]); // Mon–Fri (getDay: 0=Sun)

/**
 * Returns true if the given Date falls within business hours
 * Mon–Fri, 08:00–20:00 (UTC, as stored).
 */
function isBusinessHour(date) {
  const d = new Date(date);
  const day  = d.getUTCDay();
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  return BUSINESS_DAYS.has(day) && hour >= BUSINESS_START_HOUR && hour <= BUSINESS_END_HOUR;
}

/**
 * Validates that a booking window is entirely within business hours.
 * Returns an error string, or null if valid.
 */
function validateBusinessWindow(startTime, endTime) {
  const start = new Date(startTime);
  const end   = new Date(endTime);

  const startDay  = start.getUTCDay();
  const endDay    = end.getUTCDay();
  const startHour = start.getUTCHours() + start.getUTCMinutes() / 60;
  const endHour   = end.getUTCHours()   + end.getUTCMinutes()   / 60;

  if (!BUSINESS_DAYS.has(startDay)) {
    return 'Bookings are only allowed Monday–Friday.';
  }
  if (startDay !== endDay) {
    return 'Booking must start and end on the same day.';
  }
  if (startHour < BUSINESS_START_HOUR) {
    return `Bookings cannot start before 08:00.`;
  }
  if (endHour > BUSINESS_END_HOUR) {
    return `Bookings cannot end after 20:00.`;
  }
  return null;
}

/**
 * Calculates total business hours (Mon–Fri, 08:00–20:00) between two dates.
 * Used for utilization reports.
 */
function businessHoursBetween(fromDate, toDate) {
  const HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR; // 12

  let total = 0;
  const cursor = new Date(fromDate);
  // advance to start of business window
  cursor.setUTCHours(0, 0, 0, 0);

  const end = new Date(toDate);

  while (cursor < end) {
    const day = cursor.getUTCDay();
    if (BUSINESS_DAYS.has(day)) {
      const dayStart = new Date(cursor);
      dayStart.setUTCHours(BUSINESS_START_HOUR, 0, 0, 0);
      const dayEnd   = new Date(cursor);
      dayEnd.setUTCHours(BUSINESS_END_HOUR, 0, 0, 0);

      const windowStart = new Date(Math.max(fromDate.getTime(), dayStart.getTime()));
      const windowEnd   = new Date(Math.min(end.getTime(),      dayEnd.getTime()));

      if (windowEnd > windowStart) {
        total += (windowEnd - windowStart) / 3_600_000;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

module.exports = { validateBusinessWindow, businessHoursBetween, isBusinessHour };
