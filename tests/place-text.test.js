// Checks that a place named inside a question is found ("I'm in Denver", "places to eat in Miami"),
// and that ordinary phrases are not mistaken for places. The first two are the exact questions
// that wrongly made Nion ask "where are you?".

import { test } from "node:test";
import assert from "node:assert/strict";
import { placeNamedIn } from "../shared/place-text.js";
import { askNion } from "../server/brain.js";

test("a place the person says they are in is found", () => {
  assert.equal(placeNamedIn("Right now I'm in Denver, and what are some good places to eat?"), "Denver");
  assert.equal(placeNamedIn("i'm in brickell miami what's good for dinner"), "brickell miami");
  assert.equal(placeNamedIn("We are currently in Lisbon and want a coffee"), "Lisbon");
});

test("a capitalised place after 'in' or 'near' is found", () => {
  assert.equal(placeNamedIn("Can you suggest some good places to eat in Miami?"), "Miami");
  assert.equal(placeNamedIn("What's open late in San Francisco tonight?"), "San Francisco");
  assert.equal(placeNamedIn("a good spot near Union Square"), "Union Square");
});

test("questions that name no place return null, so Nion still asks where you are", () => {
  for (const heard of [
    "I'm hungry",
    "good places to eat near me",
    "what's around here",
    "what's open in the morning",
    "I'm in a hurry, where can I eat",
    "is it raining",
    "",
    undefined,
  ]) {
    assert.equal(placeNamedIn(heard), null, `no place in: ${heard}`);
  }
});

function fakeProvider(replies) {
  const calls = [];
  return {
    calls,
    abilities: { search: true },
    async ask(args) {
      calls.push(args);
      const text = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { text, sources: [], searches: 0, inputTokens: 1, outputTokens: 1, searchErrors: [] };
    },
  };
}

test("if the AI asks for a location but the question already named one, Nion asks again with that place", async () => {
  const provider = fakeProvider(["[[NEED_LOCATION]]", "Try Safta, mid-range Israeli."]);
  const result = await askNion({
    messages: [{ role: "user", content: "Right now I'm in Denver, and what are some good places to eat?" }],
    context: {},
    provider,
  });
  assert.equal(result.needsLocation, undefined);
  assert.match(result.reply, /Safta/);
  assert.equal(provider.calls.length, 2);
  assert.match(provider.calls[1].system, /The person is in Denver/);
});

test("if no place was named, the AI's request for a location still goes to the page", async () => {
  const provider = fakeProvider(["[[NEED_LOCATION]]"]);
  const result = await askNion({ messages: [{ role: "user", content: "good places to eat near me" }], context: {}, provider });
  assert.equal(result.needsLocation, true);
  assert.equal(provider.calls.length, 1);
});
