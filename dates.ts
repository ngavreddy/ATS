// Dates are 'YYYY-MM-DD' strings (calendar dates) or ISO timestamps.
// "Today" and display of timestamps use YOUR timezone, not UTC, so a 9pm Chicago
// evening doesn't roll over to tomorrow. Set APP_TIMEZONE in env to change it.
export const TZ = process.env.APP_TIMEZONE ?? 'America/Chicago'

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

// Calendar date in the agency's timezone ('en-CA' formats as YYYY-MM-DD)
export const today = (now: Date = new Date(), tz: string = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

// Date-only strings are shown as-is; timestamps are shown in the agency timezone
export const fmt = (iso: string, tz: string = TZ) =>
  iso.length === 10
    ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })
