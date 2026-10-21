// Checks the fallback model: a slow or overloaded main model is retried on a smaller,
// faster one. Everything is pretend, so nothing is spent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { createWebSearchTool } from "../server/tools/web-search.js";
import { ESCALATION_MODEL } from "../server/config.js";

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
  assert.match(lines[0], /big was too slow; also asking small/);
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

// A pretend answer that arrives after `ms`, and is cancelled (not delivered) if the request is aborted first.
function after(ms, value, options) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    options.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(options.signal.reason ?? timeoutError());
    });
  });
}

test("a slow main model is raced by the stronger one, and the quick answer wins", async () => {
  const signals = {};
  const { fetchImpl, models } = service((body, call, options) => {
    signals[body.model] = options.signal;
    return body.model === "big" ? after(500, say("Slow answer."), options) : after(5, say("Quick answer."), options);
  });
  const started = Date.now();
  const { result, lines } = await quietly(() => make(fetchImpl, { hedgeAfterMs: 30 }).ask({ system: "S", messages }));
  assert.deepEqual(models, ["big", "small"]);
  assert.equal(result.text, "Quick answer.");
  assert.equal(result.model, "small");
  assert.equal(result.fellBack, true);
  assert.ok(Date.now() - started < 300, "did not wait for the slow one");
  assert.equal(signals.big.aborted, true, "the slow request was cancelled");
  assert.match(lines[0], /big was slow; also asking small/);
});

test("if the main model does answer before the stronger one, its answer is used and the other is cancelled", async () => {
  const signals = {};
  const { fetchImpl } = service((body, call, options) => {
    signals[body.model] = options.signal;
    return body.model === "big" ? after(80, say("Main answer."), options) : after(400, say("Late answer."), options);
  });
  const { result } = await quietly(() => make(fetchImpl, { hedgeAfterMs: 30 }).ask({ system: "S", messages }));
  assert.equal(result.text, "Main answer.");
  assert.equal(result.fellBack, false);
  assert.equal(result.model, "big");
  assert.equal(signals.small.aborted, true, "the backup request was cancelled");
});

test("a main model that answers quickly never triggers the stronger one", async () => {
  const { fetchImpl, models } = service((body, call, options) => after(5, say("Fast."), options));
  const { result } = await quietly(() => make(fetchImpl, { hedgeAfterMs: 200 }).ask({ system: "S", messages }));
  assert.deepEqual(models, ["big"]);
  assert.equal(result.fellBack, false);
});

test("if the backup fails but the main model answers, the answer is used; if both fail, it is an error", async () => {
  const mixed = service((body, call, options) => (body.model === "big" ? after(80, say("Main answer."), options) : Promise.reject(Object.assign(new Error("busy"), { status: 503 }))));
  assert.equal((await quietly(() => make(mixed.fetchImpl, { hedgeAfterMs: 20 }).ask({ system: "S", messages }))).result.text, "Main answer.");

  const failing = (status) => Object.assign(new Error("busy"), { status });
  const bothFail = service((body, call, options) => after(30, null, options).then(() => { throw failing(body.model === "big" ? 503 : 429); }));
  await assert.rejects(
    quietly(() => make(bothFail.fetchImpl, { hedgeAfterMs: 20 }).ask({ system: "S", messages })),
    (error) => error.status === 503 || error.status === 429,
    "an error, not a hang, when neither model can answer"
  );
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

test("with the fallback turned off, a failure is reported", async () => {
  for (const fallbackModel of ["none", "NONE", ""]) {
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

test("'same' (the default) tries the main model once more, because a slow moment often passes", async () => {
  for (const setting of ["same", "SAME", "big"]) {
    let calls = 0;
    const { fetchImpl, models } = service(() => {
      if (++calls === 1) throw timeoutError();
      return say("Second time lucky.");
    });
    const { result } = await quietly(() => make(fetchImpl, { fallbackModel: setting }).ask({ system: "S", messages }));
    assert.deepEqual(models, ["big", "big"], `setting ${setting}`);
    assert.equal(result.text, "Second time lucky.");
    assert.equal(result.fellBack, true);
  }
  // And it does not retry forever: a second failure is reported.
  const { fetchImpl: alwaysSlow, models } = service(() => {
    throw timeoutError();
  });
  await assert.rejects(quietly(() => make(alwaysSlow, { fallbackModel: "same" }).ask({ system: "S", messages })), (e) => e.name === "TimeoutError");
  assert.equal(models.length, 2);
});

test("with nothing set, a slow everyday model escalates to Ultra, the stronger tier", async () => {
  const saved = process.env.NION_FALLBACK_MODEL;
  delete process.env.NION_FALLBACK_MODEL;
  try {
    let calls = 0;
    const { fetchImpl, models } = service(() => (++calls === 1 ? (() => { throw timeoutError(); })() : say("ok")));
    const { result } = await quietly(() => createNebiusProvider({ apiKey: "k", model: "everyday", fetchImpl }).ask({ system: "S", messages }));
    assert.deepEqual(models, ["everyday", ESCALATION_MODEL]);
    assert.equal(result.model, ESCALATION_MODEL, "the answer says which model gave it");
    assert.equal(result.fellBack, true);
  } finally {
    if (saved !== undefined) process.env.NION_FALLBACK_MODEL = saved;
  }
});

test("when Ultra is already the main model, escalating means trying it once more", async () => {
  const saved = process.env.NION_FALLBACK_MODEL;
  delete process.env.NION_FALLBACK_MODEL;
  try {
    let calls = 0;
    const { fetchImpl, models } = service(() => (++calls === 1 ? (() => { throw timeoutError(); })() : say("ok")));
    await quietly(() => createNebiusProvider({ apiKey: "k", model: ESCALATION_MODEL, fetchImpl }).ask({ system: "S", messages }));
    assert.deepEqual(models, [ESCALATION_MODEL, ESCALATION_MODEL]);
  } finally {
    if (saved !== undefined) process.env.NION_FALLBACK_MODEL = saved;
  }
});

test("a model that says nothing is not nudged first: the question goes to the stronger model with everything so far", async () => {
  const toolCall = { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"x"}' } }] } }], usage: {} };
  const silent = { choices: [{ message: { content: null }, finish_reason: "stop" }], usage: {} };
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const reply = requests.length === 1 ? toolCall : body.model === "stronger" ? say("A real answer.") : silent;
    return { ok: true, status: 200, json: async () => reply, text: async () => "" };
  };
  const tool = { name: "web_search", description: "d", parameters: { type: "object", properties: {} }, maxCalls: 1, run: async () => "results" };
  const { result, lines } = await quietly(() => createNebiusProvider({ apiKey: "k", model: "everyday", fallbackModel: "stronger", fetchImpl, tools: [tool] }).ask({ system: "S", messages }));

  assert.deepEqual(requests.map((r) => r.model), ["everyday", "everyday", "stronger"]);
  assert.equal(result.text, "A real answer.");
  assert.equal(result.model, "stronger");
  assert.equal(requests[2].messages.at(-1).role, "tool", "no nudge: the search results are simply passed on");
  assert.ok(lines.some((l) => /gave no answer; escalating to stronger/.test(l)));
});

test("a normal fast answer never touches the fallback", async () => {
  const { fetchImpl, models } = service(() => say("Hello."));
  const result = await make(fetchImpl).ask({ system: "S", messages });
  assert.deepEqual(models, ["big"]);
  assert.equal(result.fellBack, false);
});
