// Checks the fair-use limits for the public demo: the rules (with a pretend clock),
// and the real server turning requests away. Nothing here reaches a real AI service.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createLimiter, cleanVisitorId, numberSetting } from "../server/limits.js";

function clock(start = Date.UTC(2026, 9, 13, 10, 0, 0)) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}
const HOUR = 60 * 60 * 1000;

test("a visitor gets a fixed number of questions an hour, then a clear 'wait' with how long", () => {
  const c = clock();
  const limiter = createLimiter({ perVisitor: 3, perIp: 0, dailyCap: 0, now: c.now });
  for (let i = 0; i < 3; i++) assert.deepEqual(limiter.check({ visitorId: "visitor-aaa" }), { ok: true });
  const blocked = limiter.check({ visitorId: "visitor-aaa" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "visitor");
  assert.equal(blocked.retryAfterSeconds, 3600);

  c.advance(HOUR / 2);
  assert.equal(limiter.check({ visitorId: "visitor-aaa" }).retryAfterSeconds, 1800, "counts down");
  c.advance(HOUR / 2);
  assert.deepEqual(limiter.check({ visitorId: "visitor-aaa" }), { ok: true }, "a new hour starts fresh");
});

test("visitors on the same network don't use each other's allowance", () => {
  const limiter = createLimiter({ perVisitor: 1, perIp: 100, dailyCap: 0 });
  assert.equal(limiter.check({ visitorId: "judge-one-1", ip: "10.0.0.1" }).ok, true);
  assert.equal(limiter.check({ visitorId: "judge-one-1", ip: "10.0.0.1" }).ok, false);
  assert.equal(limiter.check({ visitorId: "judge-two-2", ip: "10.0.0.1" }).ok, true, "a different judge, same office");
});

test("the network backstop stops a script that invents a new visitor id every time", () => {
  const limiter = createLimiter({ perVisitor: 5, perIp: 4, dailyCap: 0 });
  for (let i = 0; i < 4; i++) assert.equal(limiter.check({ visitorId: `fake-id-${i}-xx`, ip: "6.6.6.6" }).ok, true);
  const blocked = limiter.check({ visitorId: "fake-id-new-xx", ip: "6.6.6.6" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "ip");
  assert.equal(limiter.check({ visitorId: "someone-else", ip: "7.7.7.7" }).ok, true);
});

test("the daily cap protects the credit, and starts again the next day", () => {
  const c = clock(Date.UTC(2026, 9, 13, 23, 0, 0));
  const limiter = createLimiter({ perVisitor: 0, perIp: 0, dailyCap: 2, now: c.now });
  assert.equal(limiter.check({}).ok, true);
  assert.equal(limiter.check({}).ok, true);
  const blocked = limiter.check({});
  assert.deepEqual([blocked.ok, blocked.reason, blocked.retryAfterSeconds], [false, "daily", 3600], "an hour to midnight UTC");
  assert.deepEqual(limiter.stats(), { today: 2, dailyCap: 2 });

  c.advance(HOUR + 1000);
  assert.equal(limiter.check({}).ok, true, "a new day");
  assert.equal(limiter.stats().today, 1);
});

test("a question that is turned away uses up nobody's allowance", () => {
  const limiter = createLimiter({ perVisitor: 1, perIp: 0, dailyCap: 5 });
  limiter.check({ visitorId: "visitor-bbb" });
  for (let i = 0; i < 10; i++) limiter.check({ visitorId: "visitor-bbb" });
  assert.equal(limiter.stats().today, 1, "only the one that went ahead counts towards the daily cap");
});

test("a limit set to 0 is off, and memory stays small even if someone invents endless ids", () => {
  const limiter = createLimiter({ perVisitor: 0, perIp: 0, dailyCap: 0 });
  for (let i = 0; i < 50; i++) assert.equal(limiter.check({ visitorId: "visitor-ccc", ip: "1.1.1.1" }).ok, true);

  const busy = createLimiter({ perVisitor: 1000, perIp: 0, dailyCap: 0 });
  for (let i = 0; i < 25_000; i++) busy.check({ visitorId: `bot-${i}-aaaa` });
  assert.equal(busy.check({ visitorId: "still-works-1" }).ok, true);
});

test("settings are read safely", () => {
  assert.equal(numberSetting("250", 200), 250);
  assert.equal(numberSetting("0", 200), 0);
  assert.equal(numberSetting(undefined, 200), 200);
  assert.equal(numberSetting("lots", 200), 200);
  assert.equal(numberSetting("-5", 200), 200);
  assert.equal(cleanVisitorId("0a1b2c3d-1111-2222-3333-444455556666"), "0a1b2c3d-1111-2222-3333-444455556666");
  for (const bad of [undefined, "", "short", "has spaces in it!", "x".repeat(65), 12345678, "<script>alert(1)</script>"]) {
    assert.equal(cleanVisitorId(bad), undefined, String(bad));
  }
});

// ---- the real server ----

const serverFile = new URL("../server/index.js", import.meta.url).pathname;

function startServer(env, port) {
  const child = spawn(process.execPath, [serverFile], {
    env: { PATH: process.env.PATH, NEBIUS_API_KEY: "not-a-real-key", NION_MODEL: "m", NEBIUS_BASE_URL: "http://127.0.0.1:1", ...env, PORT: String(port) },
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return { child, output: () => output };
}

async function waitFor(check, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting");
}

const chat = (port, visitor, body = { messages: [{ role: "user", content: "hello" }] }) =>
  fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(visitor ? { "X-Nion-Visitor": visitor } : {}) },
    body: JSON.stringify(body),
  });

test("the server turns away questions past the daily cap, and mistakes don't count", async () => {
  const port = 3951;
  const { child, output } = startServer({ NION_DAILY_CAP: "2" }, port);
  try {
    await waitFor(() => /Nion is running/.test(output()));
    assert.equal((await chat(port, "visitor-one-1", { messages: [] })).status, 400, "a malformed request");
    assert.equal((await chat(port, "visitor-one-1")).status, 502, "1st real question goes ahead (the pretend AI is unreachable)");
    assert.equal((await chat(port, "visitor-two-2")).status, 502, "2nd goes ahead");

    const blocked = await chat(port, "visitor-three-3");
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.reason, "daily");
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200, "the page and health check still work");
  } finally {
    child.kill();
  }
});

test("the server limits each visitor separately", async () => {
  const port = 3952;
  const { child, output } = startServer({ NION_RATE_PER_HOUR: "1", NION_DAILY_CAP: "0" }, port);
  try {
    await waitFor(() => /Nion is running/.test(output()));
    assert.equal((await chat(port, "visitor-one-1")).status, 502);
    const second = await chat(port, "visitor-one-1");
    assert.equal(second.status, 429);
    assert.equal((await second.json()).reason, "visitor");
    assert.equal((await chat(port, "visitor-two-2")).status, 502, "someone else is not affected");
  } finally {
    child.kill();
  }
});
