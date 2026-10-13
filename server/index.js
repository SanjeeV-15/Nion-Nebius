// The small server. It does two jobs:
//   1. Serves the Nion page (everything in the public/ folder) to your browser.
//   2. Answers POST /api/chat: takes what the person said, asks the AI, and
//      returns Nion's reply. This is the only place your API key is used.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { configProblem } from "./config.js";
import { cleanData } from "../shared/store.js";
import { createLimiter, cleanVisitorId, numberSetting } from "./limits.js";

// Stop early with a clear message if a setting is missing (instead of failing later).
const problem = configProblem();
if (problem) {
  console.error(`\nNion can't start: ${problem}\n`);
  process.exit(1);
}

if (!process.env.TAVILY_API_KEY) {
  console.warn("Note: TAVILY_API_KEY is not set, so Nion can't search the web. Add it to .env to turn search on.");
}

// Loaded after the settings check so a missing key gives the message above.
const { askNion, completeShort } = await import("./brain.js");
const { resolvePlace, describePlace, cleanPlacePart } = await import("./place.js");
const { classifyFailure } = await import("./failure.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Hosts put a proxy in front of Nion, so the visitor's real address is in a header. One
// proxy is the usual case; set NION_TRUST_PROXY to change it (a number, or "false").
const trustProxy = process.env.NION_TRUST_PROXY ?? "1";
app.set("trust proxy", trustProxy === "false" ? false : Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy));

// Fair-use limits for the public demo (see limits.js). Raise or turn off in the host's settings.
const limiter = createLimiter({
  perVisitor: numberSetting(process.env.NION_RATE_PER_HOUR, 200),
  perIp: numberSetting(process.env.NION_IP_RATE_PER_HOUR, 1000),
  dailyCap: numberSetting(process.env.NION_DAILY_CAP, 3000),
});
// The request carries a copy of the person's notebook, so it can be bigger than a chat message.
app.use(express.json({ limit: "400kb" }));
app.use(express.static(path.join(here, "..", "public")));
// The notebook rules are shared with the browser, so the page loads them from here.
app.use("/shared", express.static(path.join(here, "..", "shared")));

// A quick "are you alive?" check, used by tests and later by the phone check.
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// The context comes from the browser, so treat it as untrusted: keep only the
// fields we expect, cap their length, and allow only letters in the name (so a
// made-up "name" can't smuggle instructions into Nion's prompt).
function cleanContext(raw = {}) {
  const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : undefined);
  // A name is at most three short words made of letters.
  const name = typeof raw.userName === "string"
    ? raw.userName
        .replace(/[^\p{L}\p{M}' -]/gu, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(" ")
        .slice(0, 30)
    : "";
  return {
    nowISO: text(raw.nowISO, 40),
    timeZone: text(raw.timeZone, 60),
    localDateTime: text(raw.localDateTime, 80),
    // The person's own calendar date, "YYYY-MM-DD": expenses are filed under it.
    today: /^\d{4}-\d{2}-\d{2}$/.test(raw.today) ? raw.today : undefined,
    userName: name || undefined,
    isNewConversation: raw.isNewConversation === true,
  };
}

// The person's location arrives either as GPS numbers ({ lat, lon }) or as a place
// they said out loud ({ text: "Brickell, Miami" }). Either way, work out a place
// to use, or return null if there isn't one.
async function resolveLocation(raw) {
  if (!raw || typeof raw !== "object") return null;

  if (Number.isFinite(raw.lat) && Number.isFinite(raw.lon)) {
    const place = await resolvePlace(completeShort, raw.lat, raw.lon);
    return place ? { ...place, text: describePlace(place), fromGps: true } : { failed: true };
  }

  if (typeof raw.text === "string") {
    // Something the person said, so keep only letters, numbers and a few marks.
    const text = raw.text.replace(/[^\p{L}\p{N}\p{M}\s,.'#&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
    return text ? { text } : null;
  }
  return null;
}

app.post("/api/chat", async (req, res) => {
  const { messages, context, location, data: rawData } = req.body ?? {};

  // Check the request looks right before spending money on it.
  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 40 &&
    messages.every(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 4000
    ) &&
    messages[messages.length - 1].role === "user";

  if (!valid) {
    return res.status(400).json({ error: "Bad request: send a list of messages ending with a user message." });
  }

  // Count the question against the fair-use limits (only valid ones, so mistakes are free).
  const allowed = limiter.check({ visitorId: cleanVisitorId(req.get("x-nion-visitor")), ip: req.ip });
  if (!allowed.ok) {
    res.set("Retry-After", String(allowed.retryAfterSeconds));
    return res.status(429).json({ error: "Nion is taking a break.", reason: allowed.reason === "daily" ? "daily" : "visitor", retryAfterSeconds: allowed.retryAfterSeconds });
  }

  try {
    const place = await resolveLocation(location);
    if (place?.failed) return res.json({ needsLocation: true, locationFailed: true });

    const { reply, sources, usage, needsLocation, ops } = await askNion({
      messages,
      context: { ...cleanContext(context), place: place?.text },
      data: cleanData(rawData),
      location: place && !place.failed ? { city: place.city, region: place.region, country: place.country } : undefined,
    });
    // A line per question, so you can see how much searching is going on (each
    // search costs about a cent).
    console.log(
      `Answered: ${usage.searches} search(es), ${usage.inputTokens} tokens in, ${usage.outputTokens} out` +
        (usage.searchErrors.length ? `, search errors: ${usage.searchErrors.join(", ")}` : "") +
        (usage.fellBack ? ", answered by the fallback model" : "") +
        ` (today: ${limiter.stats().today}${limiter.stats().dailyCap ? ` of ${limiter.stats().dailyCap}` : ""})`
    );
    if (needsLocation) return res.json({ needsLocation: true });
    // Tell the page which place was worked out from GPS, so it can say it and use it next time.
    // `changes` are notebook updates for the browser to apply (and keep on the device).
    res.json({ reply, sources, place: place?.fromGps ? place.text : undefined, changes: ops?.length ? ops : undefined });
  } catch (error) {
    console.error("AI request failed:", error?.status ?? "", error?.message ?? error);
    res.status(502).json({ error: "I'm having trouble reaching my sources.", reason: classifyFailure(error) });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Nion is running. Open http://localhost:${port} in Chrome.`);
});
