// Checks reminder times: turning a clock time in someone's time zone into a real moment,
// including daylight saving, and saying a moment back in plain words.

import { test } from "node:test";
import assert from "node:assert/strict";
import { clockTime, describeWhen, isTimeZone, localToUtc } from "../shared/time.js";

const iso = (ms) => new Date(ms).toISOString();

test("a clock time in New York becomes the right moment, in summer and in winter", () => {
  // October 13 is daylight time (UTC-4); December 1 is standard time (UTC-5).
  assert.equal(iso(localToUtc("2026-10-13 15:30", "America/New_York")), "2026-10-13T19:30:00.000Z");
  assert.equal(iso(localToUtc("2026-12-01 15:30", "America/New_York")), "2026-12-01T20:30:00.000Z");
});

test("other zones, including a half-hour offset and one with no daylight saving", () => {
  assert.equal(iso(localToUtc("2026-10-13 09:00", "Asia/Kolkata")), "2026-10-13T03:30:00.000Z");
  assert.equal(iso(localToUtc("2026-10-13 09:00", "Asia/Tokyo")), "2026-10-13T00:00:00.000Z");
  assert.equal(iso(localToUtc("2026-10-13 09:00", "UTC")), "2026-10-13T09:00:00.000Z");
  assert.equal(iso(localToUtc("2026-10-13T09:05", "Europe/Paris")), "2026-10-13T07:05:00.000Z", "a T instead of a space is fine");
  assert.equal(iso(localToUtc("2026-10-13 9:05", "Europe/Paris")), "2026-10-13T07:05:00.000Z", "so is a one-digit hour");
});

test("daylight saving: the day clocks go back and the day they go forward", () => {
  // In New York clocks go back on 2026-11-01 (2:00 becomes 1:00) and forward on 2026-03-08.
  assert.equal(iso(localToUtc("2026-11-01 09:00", "America/New_York")), "2026-11-01T14:00:00.000Z", "after the change: UTC-5");
  assert.equal(iso(localToUtc("2026-10-31 09:00", "America/New_York")), "2026-10-31T13:00:00.000Z", "the day before: UTC-4");
  assert.equal(localToUtc("2026-03-08 02:30", "America/New_York"), null, "that time does not exist");
  assert.equal(iso(localToUtc("2026-03-08 03:30", "America/New_York")), "2026-03-08T07:30:00.000Z");
});

test("times that are not times are refused", () => {
  for (const bad of ["", "tomorrow", "2026-13-01 10:00", "2026-02-30 10:00", "2026-10-13 25:00", "2026-10-13 10:61", "10:00", null, undefined, 12]) {
    assert.equal(localToUtc(bad, "UTC"), null, String(bad));
  }
  assert.equal(localToUtc("2026-10-13 10:00", "Not/AZone"), null);
  assert.equal(isTimeZone("America/New_York"), true);
  assert.equal(isTimeZone("Not/AZone"), false);
  assert.equal(isTimeZone(undefined), false);
});

test("a moment is described in plain words from the point of view of now", () => {
  const zone = "America/New_York";
  const now = localToUtc("2026-10-13 14:00", zone);
  const at = (text) => localToUtc(text, zone);
  assert.equal(describeWhen(now, now, zone), "right now");
  assert.equal(describeWhen(now + 20_000, now, zone), "right now", "under half a minute");
  assert.equal(describeWhen(now + 30_000, now, zone), "in 1 minute", "rounded to the nearest minute");
  assert.equal(describeWhen(now + 60_000, now, zone), "in 1 minute");
  assert.equal(describeWhen(now + 20 * 60_000, now, zone), "in 20 minutes");
  assert.equal(describeWhen(at("2026-10-13 15:30"), now, zone), "today at 3:30 PM");
  assert.equal(describeWhen(at("2026-10-14 09:00"), now, zone), "tomorrow at 9:00 AM");
  assert.equal(describeWhen(at("2026-10-16 09:00"), now, zone), "Friday at 9:00 AM");
  assert.equal(describeWhen(at("2026-10-30 09:00"), now, zone), "October 30 at 9:00 AM");
});

test("'today' and 'tomorrow' follow the person's clock, not UTC", () => {
  const zone = "Asia/Tokyo";
  const now = localToUtc("2026-10-13 23:30", zone); // 14:30 UTC, still the 13th in Tokyo
  assert.equal(describeWhen(localToUtc("2026-10-13 23:55", zone), now, zone), "in 25 minutes");
  assert.equal(describeWhen(localToUtc("2026-10-14 00:30", zone), now, zone), "tomorrow at 12:30 AM");
  // The same two moments, described for someone in New York, are on a different calendar day there:
  // 00:30 on the 14th in Tokyo is 11:30 in the morning of the 13th in New York.
  assert.equal(describeWhen(now + 60 * 60_000, now, "America/New_York"), "today at 11:30 AM");
});

test("a bad time zone falls back to UTC instead of failing", () => {
  const now = localToUtc("2026-10-13 14:00", "UTC");
  assert.equal(describeWhen(now + 3 * 3600_000, now, "nonsense"), "today at 5:00 PM");
  assert.equal(clockTime(localToUtc("2026-10-13 00:05", "UTC"), "UTC"), "12:05 AM");
  assert.doesNotMatch(clockTime(localToUtc("2026-10-13 15:30", "UTC"), "UTC"), /[  ]/, "plain spaces only, so it is spoken cleanly");
});
