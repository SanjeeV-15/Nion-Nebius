// Times for reminders: turning "3:30 pm tomorrow" (in the person's own time zone) into a
// real moment, and saying a moment back in plain words ("in 20 minutes", "tomorrow at
// 9:00 AM"). Time zones and daylight saving make this easy to get subtly wrong, so it
// lives here, on its own, and is tested on its own.
//
// No requests and no secrets: only the browser's and Node's built-in Intl.

const formatters = new Map();

/** Is this a real time zone name, like "America/New_York"? */
export function isTimeZone(zone) {
  if (typeof zone !== "string" || zone.length > 60) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function partsFormatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  }
  return formatters.get(zone);
}

// The wall-clock date and time in a zone at a given moment (milliseconds).
function wallClock(ms, zone) {
  const found = {};
  for (const part of partsFormatter(zone).formatToParts(new Date(ms))) found[part.type] = part.value;
  return { year: +found.year, month: +found.month, day: +found.day, hour: +found.hour % 24, minute: +found.minute, second: +found.second };
}

const asIfUtc = (c) => Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);

/**
 * "2026-10-13 15:30" as seen on a clock in `zone` becomes the real moment (milliseconds), or
 * null if the text isn't a valid time, or the time doesn't exist (the hour skipped when clocks
 * go forward).
 */
export function localToUtc(text, zone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!match || !isTimeZone(zone)) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  // The zone's offset depends on the moment itself (daylight saving), so settle on it in two steps.
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let moment = wanted;
  for (let i = 0; i < 2; i++) moment = wanted - (asIfUtc(wallClock(moment, zone)) - moment);

  // Does that moment show the clock time that was asked for? (Not if the day or hour doesn't exist.)
  const back = wallClock(moment, zone);
  const same = back.year === year && back.month === month && back.day === day && back.hour === hour && back.minute === minute;
  return same ? moment : null;
}

/** "3:30 PM" for a moment, on a clock in `zone`. */
export function clockTime(ms, zone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" })
    .format(new Date(ms))
    .replace(/[  ]/g, " ");
}

const dayNumber = (c) => Math.round(Date.UTC(c.year, c.month - 1, c.day) / 86_400_000);

/**
 * A moment in plain words, from the point of view of `now`: "in 20 minutes", "today at 3:30 PM",
 * "tomorrow at 9:00 AM", "Friday at 9:00 AM", or "October 30 at 9:00 AM" when it is a week or more away.
 */
export function describeWhen(dueMs, nowMs, zone) {
  const tz = isTimeZone(zone) ? zone : "UTC";
  const minutes = Math.round((dueMs - nowMs) / 60_000);
  if (minutes < 1) return "right now";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const time = clockTime(dueMs, tz);
  const days = dayNumber(wallClock(dueMs, tz)) - dayNumber(wallClock(nowMs, tz));
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days > 1 && days < 7) return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(dueMs))} at ${time}`;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric" }).format(new Date(dueMs))} at ${time}`;
}
