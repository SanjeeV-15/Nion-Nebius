// Checks the fallback model: a slow or overloaded main model is retried on a smaller,
// faster one. Everything is pretend, so nothing is spent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { createWebSearchTool } from "../server/tools/web-search.js";

const messages = [{ role: "user", content: "hi" }];
const say = (content) => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
const timeoutError = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });

// A pretend Token Factory. `handler(body, call)` returns a reply object, or throws.
function service(handler) {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    const data = await handler(body, models.length, options);
    return { ok: true, status: 200, json: async () => data, text: async () => "" };
  };
  return { fetchImpl, models };
}

const make = (fetchImpl, extra = {}) =>
  createNebiusProvider({ apiKey: "k", model: "big", fallbackModel: "small", fetchImpl, ...extra });

// Silence the "using the fallback" warning in the test output.
async function quietly(run) {
  const warn = console.warn;
  const lines = [];
  console.warn = (line) => lines.push(line);
  try {
    return { result: await run(), lines };
  } finally {
    console.warn = warn;
  }
}

test("a timeout on the main model is retried on the fallback, and the answer says so", async () => {
  const { fetchImpl, models } = service((body) => {
    if (body.model === "big") throw timeoutError();
    return say("Quick answer.");
  });
  const { result, lines } = await quietly(() => make(fetchImpl).ask({ system: "S", messages }));
  assert.deepEqual(models, ["big", "small"]);
  assert.equal(result.text, "Quick answer.");
  assert.equal(result.fellBack, true);
  assert.match(lines[0], /big was slow or unavailable \(timeout\); using small/);
});

test("an overloaded main model (429 or a server error) is retried on the fallback", async () => {
  for (const status of [429, 503]) {
    const { fetchImpl, models } = service(async (body) => {
      if (body.model === "big") throw Object.assign(new Error("busy"), { status });
      return say("Fine.");
    });
    // The provider turns a non-OK reply into an error with a status, so pretend that here.
    const failing = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.model === "big") return { ok: false, status, text: async () => "busy", json: async () => ({}) };
      return fetchImpl(url, options);
    };
    const { result } = await quietly(() => make(failing).ask({ system: "S", messages }));
    assert.equal(result.text, "Fine.", `status ${status}`);
    assert.equal(result.fellBack, true);
    void models;
  }
});

test("a rejected key is not retried on another model: it would fail the same way", async () => {
  const failing = async () => ({ ok: false, status: 401, text: async () => "bad key", json: async () => ({}) });
  await assert.rejects(make(failing).ask({ system: "S", messages }), (error) => error.status === 401);
});

test("the main model gets a short time limit, then the fallback takes over", async () => {
  const { fetchImpl, models } = service((body, call, options) => {
    if (body.model !== "big") return say("From the fallback.");
    // The main model never answers; it only stops when the time limit cuts it off.
    return new Promise((resolve, reject) =>
      options.signal.addEventListener("abort", () => reject(options.signal.reason ?? timeoutError()))
    );
  });
  const started = Date.now();
  // A real network request keeps Node running while it waits; this pretend one doesn't,
  // so hold the process open until the time limit has fired.
  const keepAlive = setInterval(() => {}, 1000);
  const { result } = await quietly(() => make(fetchImpl, { primaryTimeoutMs: 40 }).ask({ system: "S", messages })).finally(() => clearInterval(keepAlive));
  assert.equal(result.text, "From the fallback.");
  assert.deepEqual(models, ["big", "small"]);
  assert.ok(Date.now() - started < 2000, "gave up on the main model quickly");
});

test("once on the fallback, the rest of the question stays on it", async () => {
  const toolCall = { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"x"}' } }] } }], usage: {} };
  const { fetchImpl, models } = service((body, call) => {
    if (call === 1) throw timeoutError(); // the main model is slow on the first request
    return call === 2 ? toolCall : say("Done.");
  });
  const tool = { ...createWebSearchTool({ apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }) }) };
  const { result } = await quietly(() => make(fetchImpl, { tools: [tool] }).ask({ system: "S", messages }));
  assert.deepEqual(models, ["big", "small", "small"], "no switching back to the slow model");
  assert.equal(result.fellBack, true);
});

test("with no fallback, or the fallback set to the same model, a failure is reported", async () => {
  for (const fallbackModel of ["none", "big", ""]) {
    const { fetchImpl, models } = service(() => {
      throw timeoutError();
    });
    await assert.rejects(
      quietly(() => createNebiusProvider({ apiKey: "k", model: "big", fallbackModel, fetchImpl }).ask({ system: "S", messages })),
      (error) => error.name === "TimeoutError"
    );
    assert.equal(models.length, 1, `fallback "${fallbackModel}": only the main model is tried`);
  }
});

test("a normal fast answer never touches the fallback", async () => {
  const { fetchImpl, models } = service(() => say("Hello."));
  const result = await make(fetchImpl).ask({ system: "S", messages });
  assert.deepEqual(models, ["big"]);
  assert.equal(result.fellBack, false);
});
