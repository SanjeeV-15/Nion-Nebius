// Protects the public demo's credit without locking out the people it is for.
//
// Judges must be able to use the demo freely, but anyone with the link could also
// run up the bill. So there are three layers, from gentle to firm:
//   1. each visitor (a random id their browser makes up) gets a generous hourly
//      allowance, so one person can't use it all up;
//   2. each network address gets a bigger one, a backstop against scripts, large
//      enough that many judges on one office network don't affect each other;
//   3. a daily cap for the whole demo, the real protection for the credit. It can be
//      raised at any time in the host's settings.
//
// Judges are the exception to the first three layers: the rules say the demo must be free and
// "without any restriction" for them. A judge's link carries a pass (set in the host's
// settings, and given in the submission's testing notes). A request with the right pass skips
// the visitor and network limits and the public daily cap. It still counts against a separate,
// larger judge cap, so a pass that leaks cannot run up the bill without end; change the pass
// in the host's settings to cancel it.
//
// Counts are kept in memory and start again when the server restarts, which is fine
// for a demo. Setting a limit to 0 turns that layer off.

import { timingSafeEqual } from "node:crypto";

const HOUR_MS = 60 * 60 * 1000;
const MAX_TRACKED = 20_000; // keeps memory small even if someone invents endless visitor ids

// "2026-10-13": the day the daily cap counts, in UTC.
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createLimiter({ perVisitor = 200, perIp = 1000, dailyCap = 3000, judgeDailyCap = 5000, now = () => Date.now() } = {}) {
  const visitors = new Map(); // id -> { start, count }
  const ips = new Map();
  let day = dayOf(now());
  let today = 0;
  let judgeToday = 0;

  // The count in this key's current hour (starting a fresh hour if the last one is over).
  function current(map, key) {
    const t = now();
    let entry = map.get(key);
    if (!entry || t - entry.start >= HOUR_MS) {
      entry = { start: t, count: 0 };
      if (map.size >= MAX_TRACKED) {
        for (const [k, v] of map) if (t - v.start >= HOUR_MS) map.delete(k);
        if (map.size >= MAX_TRACKED) map.delete(map.keys().next().value); // still full: drop the oldest
      }
      map.set(key, entry);
    }
    return entry;
  }

  const retryAfter = (entry) => Math.max(1, Math.ceil((entry.start + HOUR_MS - now()) / 1000));

  return {
    /**
     * Can this request go ahead? Returns { ok: true } and counts it, or
     * { ok: false, reason: "daily" | "ip" | "visitor", retryAfterSeconds }.
     * `judge` is true when the request carried the right judge pass.
     * A request that is turned away does not use up anyone's allowance.
     */
    check({ visitorId, ip, judge = false } = {}) {
      if (dayOf(now()) !== day) {
        day = dayOf(now());
        today = 0;
        judgeToday = 0;
      }
      if (judge) {
        if (judgeDailyCap > 0 && judgeToday >= judgeDailyCap) return { ok: false, reason: "daily", retryAfterSeconds: secondsToMidnight(now()) };
        judgeToday += 1;
        return { ok: true };
      }
      if (dailyCap > 0 && today >= dailyCap) {
        return { ok: false, reason: "daily", retryAfterSeconds: secondsToMidnight(now()) };
      }
      const ipEntry = perIp > 0 && ip ? current(ips, ip) : null;
      if (ipEntry && ipEntry.count >= perIp) return { ok: false, reason: "ip", retryAfterSeconds: retryAfter(ipEntry) };
      const visitorEntry = perVisitor > 0 && visitorId ? current(visitors, visitorId) : null;
      if (visitorEntry && visitorEntry.count >= perVisitor) return { ok: false, reason: "visitor", retryAfterSeconds: retryAfter(visitorEntry) };

      today += 1;
      if (ipEntry) ipEntry.count += 1;
      if (visitorEntry) visitorEntry.count += 1;
      return { ok: true };
    },
    /** For the server log: how much of today's cap is used. */
    stats() {
      return { today, dailyCap, judgeToday, judgeDailyCap };
    },
  };
}

function secondsToMidnight(ms) {
  const t = new Date(ms);
  return Math.ceil((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1) - t.getTime()) / 1000);
}

/** Is this the judge pass? Compared in constant time, and only if a pass is configured. */
export function isJudgePass(given, configured) {
  if (typeof given !== "string" || typeof configured !== "string" || configured.length < 8) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A browser-made visitor id, or undefined if it isn't the expected shape. */
export function cleanVisitorId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : undefined;
}

/** A whole number from a setting, or the default if it isn't one. */
export function numberSetting(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
