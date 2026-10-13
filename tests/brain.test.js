// Checks the brain and its providers with pretend AIs. Nothing here makes a real
// request, so it costs nothing and needs no key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { askNion, completeShort } from "../server/brain.js";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { configProblem, DEFAULT_MODEL } from "../server/config.js";

// A pretend provider that returns what it is told and remembers what it was asked.
function fakeProvider(result) {
  const calls = [];
  return {
    calls,
    async ask(input) {
      calls.push(input);
      return { text: "", sources: [], searches: 0, inputTokens: 5, outputTokens: 7, searchErrors: [], refused: false, ...result };
    },
  };
}

const messages = [{ role: "user", content: "hi" }];

test("the brain passes Nion's instructions and the conversation to the provider", async () => {
  const provider = fakeProvider({ text: "Hello there." });
  const result = await askNion({ messages, context: { userName: "Sanjeev" }, provider });
  assert.equal(result.reply, "Hello there.");
  assert.deepEqual(provider.calls[0].messages, messages);
  assert.match(provider.calls[0].system, /You are Nion/);
  assert.match(provider.calls[0].system, /Sanjeev/);
  assert.deepEqual(result.usage, { searches: 0, inputTokens: 5, outputTokens: 7, searchErrors: [], fellBack: false });
});

test("the brain asks the page to find out where the person is when the AI says so", async () => {
  const result = await askNion({ messages, provider: fakeProvider({ text: "[[NEED_LOCATION]]" }) });
  assert.equal(result.needsLocation, true);
  assert.equal(result.reply, "");
});

test("a refusal and an empty answer both become something sensible to say", async () => {
  const refused = await askNion({ messages, provider: fakeProvider({ refused: true, text: "ignored" }) });
  assert.match(refused.reply, /can't help/);
  const empty = await askNion({ messages, provider: fakeProvider({ text: "" }) });
  assert.match(empty.reply, /didn't catch that/);
});

test("the brain keeps at most eight sources", async () => {
  const sources = Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, url: `https://example.com/${i}` }));
  const result = await askNion({ messages, provider: fakeProvider({ text: "ok", sources }) });
  assert.equal(result.sources.length, 8);
});

// ---- the Nebius provider ----

function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, calls };
}

test("the Nebius provider sends an OpenAI-style request and reads the reply", async () => {
  const { fetchImpl, calls } = fakeFetch(200, {
    choices: [{ message: { content: "It's  ten past three." } }],
    usage: { prompt_tokens: 12, completion_tokens: 6 },
  });
  const provider = createNebiusProvider({ apiKey: "test-key", model: "some/model", fetchImpl });
  const result = await provider.ask({ system: "SYS", messages });

  assert.equal(calls[0].url, "https://api.tokenfactory.nebius.com/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "some/model");
  assert.deepEqual(body.messages, [{ role: "system", content: "SYS" }, ...messages]);
  assert.equal(result.text, "It's ten past three.");
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 6);
});

test("the Nebius provider never lets a model's thinking reach the speech voice", async () => {
  const { fetchImpl } = fakeFetch(200, { choices: [{ message: { content: "<think>hmm, the time</think>Half past two." } }] });
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl }).ask({ system: "S", messages });
  assert.equal(result.text, "Half past two.");

  const cut = fakeFetch(200, { choices: [{ message: { content: "thinking first...</think>Half past two." } }] });
  const result2 = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl: cut.fetchImpl }).ask({ system: "S", messages });
  assert.equal(result2.text, "Half past two.");
});

test("the Nebius provider fails with the status code, so a bad key can be told from 'too busy'", async () => {
  const { fetchImpl } = fakeFetch(401, { error: "bad key" });
  await assert.rejects(
    createNebiusProvider({ apiKey: "k", model: "m", fetchImpl }).ask({ system: "S", messages }),
    (error) => error.status === 401
  );
});

test("the Nebius provider insists on a model name instead of guessing one", async () => {
  const { fetchImpl } = fakeFetch(200, {});
  await assert.rejects(
    createNebiusProvider({ apiKey: "k", model: "", fetchImpl }).ask({ system: "S", messages }),
    /NION_MODEL/
  );
});

// ---- the settings check ----

test("the settings check says what is missing", () => {
  assert.match(configProblem({}), /NEBIUS_API_KEY is missing/);
  assert.match(configProblem({}), /\.env/);
  assert.equal(configProblem({ NEBIUS_API_KEY: "x" }), undefined, "the model and everything else have defaults");
});

test("with no model chosen, Nion uses Nemotron Ultra", async () => {
  const saved = process.env.NION_MODEL;
  delete process.env.NION_MODEL;
  try {
    const sent = [];
    const fetchImpl = async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "Hi." } }] }), text: async () => "" };
    };
    await createNebiusProvider({ apiKey: "k", fetchImpl }).ask({ system: "S", messages });
    assert.equal(sent[0].model, DEFAULT_MODEL);
    assert.equal(DEFAULT_MODEL, "nvidia/Nemotron-3-Ultra-550b-a55b");
  } finally {
    if (saved !== undefined) process.env.NION_MODEL = saved;
  }
});

// ---- answering one short question (used to name a place) ----

test("the Nebius provider answers one short question with no tools, and cleans the reply", async () => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "<think>hmm</think>Miami | Florida | US" } }] }), text: async () => "" };
  };
  const provider = createNebiusProvider({ apiKey: "k", model: "big", fetchImpl, tools: [{ name: "web_search", description: "d", parameters: {}, run: async () => "" }] });
  assert.equal(await provider.complete("where is 25,-80?"), "Miami | Florida | US");
  assert.equal(sent[0].model, "big");
  assert.equal("tools" in sent[0], false, "no tools for a short question");
  assert.deepEqual(sent[0].messages.map((m) => m.role), ["system", "user"]);
  await assert.rejects(createNebiusProvider({ apiKey: "k", model: "", fetchImpl }).complete("x"), /NION_MODEL/);
});

test("completeShort asks whichever provider it is given", async () => {
  assert.equal(await completeShort("q", { complete: async (p) => `answer to ${p}` }), "answer to q");
});
