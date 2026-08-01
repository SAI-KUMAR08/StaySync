/**
 * Date helpers shared across services.
 *
 * `paymentMonth` is stored as a fixed English month name (e.g. "July") and is
 * compared against everywhere — so the name must always be generated the same
 * way. Using an explicit "en-US" locale (instead of the server's default)
 * keeps month names consistent on any host.
 */
export function getEnglishMonthName(date = new Date()) {
  return date.toLocaleString("en-US", { month: "long" });
}

export function getEnglishMonthShort(date = new Date()) {
  return date.toLocaleString("en-US", { month: "short" });
}

/**
 * Whole days between two dates, measured from start-of-day so a partial day
 * doesn't round up. Used for the vacate minimum-notice check: a request made at
 * 23:59 for a date 14 days + 1 minute away must NOT count as 15 days.
 */
export function daysBetweenStartOfDay(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}
