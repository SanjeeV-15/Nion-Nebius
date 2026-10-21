// Checks the line under each answer ("Nemotron 3 Super · 1.9 s") and what the server sends for it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAnswer, modelLabel } from "../shared/models.js";
import { chatResponse } from "../server/reply.js";
import { createTypedChat } from "../public/js/typed.js";

test("model ids get friendly names; unknown ones lose their vendor prefix", () => {
  assert.equal(modelLabel("nvidia/nemotron-3-super-120b-a12b"), "Nemotron 3 Super");
  assert.equal(modelLabel("nvidia/Nemotron-3-Ultra-550b-a55b"), "Nemotron 3 Ultra");
  assert.equal(modelLabel("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"), "Nemotron 3 Nano");
  assert.equal(modelLabel("nvidia/Nemotron-3_5-Lightning"), "Nemotron 3.5 Lightning");
  assert.equal(modelLabel("someone/Some-Model-7B"), "Some-Model-7B");
  assert.equal(modelLabel(""), "");
  assert.equal(modelLabel(undefined), "");
});

test("the line shows the model, the time, any search, and when the stronger model stepped in", () => {
  assert.equal(describeAnswer({ model: "nvidia/nemotron-3-super-120b-a12b", ms: 1930 }), "Nemotron 3 Super · 1.9 s");
  assert.equal(describeAnswer({ model: "nvidia/nemotron-3-super-120b-a12b", ms: 4200, searches: 1 }), "Nemotron 3 Super · 4.2 s · 1 web search");
  assert.equal(describeAnswer({ model: "nvidia/Nemotron-3-Ultra-550b-a55b", ms: 3400, searches: 2, escalated: true }), "Nemotron 3 Ultra (stepped in) · 3.4 s · 2 web searches");
  assert.equal(describeAnswer({ model: "nvidia/nemotron-3-super-120b-a12b" }), "Nemotron 3 Super", "no time known");
});

test("nothing is shown when the server did not say which model answered", () => {
  for (const meta of [undefined, null, {}, { ms: 1000 }]) assert.equal(describeAnswer(meta), "");
});

test("the server's reply carries the answer, and how it was made", () => {
  const answer = {
    reply: "It's Tuesday.",
    sources: [],
    ops: [{ op: "remember" }],
    ui: [{ ui: "show", panel: "todo" }],
    usage: { model: "nvidia/nemotron-3-super-120b-a12b", searches: 1, fellBack: false },
  };
  assert.deepEqual(chatResponse(answer, { ms: 1934.6, place: "Miami" }), {
    reply: "It's Tuesday.",
    sources: [],
    place: "Miami",
    changes: [{ op: "remember" }],
    ui: [{ ui: "show", panel: "todo" }],
    model: "nvidia/nemotron-3-super-120b-a12b",
    ms: 1935,
    searches: 1,
    escalated: undefined,
  });
});

test("a reply says when the stronger model stepped in, and leaves out what is empty", () => {
  const body = JSON.parse(JSON.stringify(chatResponse({ reply: "Hi.", sources: [], ops: [], ui: [], usage: { model: "nvidia/Nemotron-3-Ultra-550b-a55b", searches: 0, fellBack: true } }, { ms: 3000 })));
  assert.deepEqual(body, { reply: "Hi.", sources: [], model: "nvidia/Nemotron-3-Ultra-550b-a55b", ms: 3000, escalated: true });
  assert.deepEqual(JSON.parse(JSON.stringify(chatResponse({ reply: "Hi.", usage: {} }, {}))), { reply: "Hi." }, "a plain reply from a pretend AI still works");
});

test("typing carries how the answer was made through to the page", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ reply: "Hi.", model: "nvidia/nemotron-3-super-120b-a12b", ms: 1500, searches: 1 }) });
  const chat = createTypedChat({ known: {}, fetchImpl, getContext: () => ({}), loadData: () => ({}), applyChanges: () => {}, recordExchange: () => "c" });
  const result = await chat.send("hello");
  assert.deepEqual(result.meta, { model: "nvidia/nemotron-3-super-120b-a12b", ms: 1500, searches: 1, escalated: undefined });
});
