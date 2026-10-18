// Checks typing to Nion (public/js/typed.js) with a pretend server. Nothing real is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTypedChat } from "../public/js/typed.js";

function setup(responses) {
  const requests = [];
  const applied = [];
  const recorded = [];
  const known = { place: null };
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.body };
  };
  const chat = createTypedChat({
    known,
    fetchImpl,
    getContext: (isNew) => ({ isNewConversation: isNew, today: "2026-10-13" }),
    loadData: () => ({ memories: [{ id: "m1", text: "avoids pork" }] }),
    applyChanges: (ops) => applied.push(...ops),
    recordExchange: (id, q, a, sources) => (recorded.push({ id, q, a, sources }), "conv1"),
  });
  return { chat, requests, applied, recorded, known };
}

const ok = (body) => ({ body });

test("a typed question goes to the server with the notebook, and the answer comes back with its sources", async () => {
  const { chat, requests, applied, recorded } = setup([
    ok({ reply: "Added.", sources: [{ title: "Reuters", url: "https://reuters.com/x" }], changes: [{ op: "add_item", list: "todo", item: { id: "t1", text: "buy milk" } }] }),
  ]);
  const result = await chat.send("  add buy milk to my to-do list ");

  assert.deepEqual(result, { reply: "Added.", sources: [{ title: "Reuters", url: "https://reuters.com/x" }], ui: [] });
  assert.equal(requests[0].url, "/api/chat");
  assert.deepEqual(requests[0].body.messages, [{ role: "user", content: "add buy milk to my to-do list" }]);
  assert.equal(requests[0].body.context.isNewConversation, true);
  assert.equal(requests[0].body.data.memories[0].text, "avoids pork");
  assert.equal(requests[0].body.location, undefined);
  assert.equal(applied[0].op, "add_item", "notebook changes are saved");
  assert.deepEqual(recorded[0], { id: null, q: "add buy milk to my to-do list", a: "Added.", sources: [{ title: "Reuters", url: "https://reuters.com/x" }] });
});

test("a follow-up carries the conversation so far, and is no longer a new conversation", async () => {
  const { chat, requests, recorded } = setup([ok({ reply: "First." }), ok({ reply: "Second." })]);
  await chat.send("one");
  await chat.send("two");
  assert.deepEqual(requests[1].body.messages.map((m) => m.content), ["one", "First.", "two"]);
  assert.equal(requests[1].body.context.isNewConversation, false);
  assert.equal(recorded[1].id, "conv1", "both exchanges belong to one History conversation");
});

test("when Nion needs a place, the next thing typed is the place, and the question is asked again", async () => {
  const { chat, requests, known } = setup([ok({ needsLocation: true }), ok({ reply: "Try Joe's." })]);
  assert.deepEqual(await chat.send("places to eat near me"), { needsPlace: true });

  const result = await chat.send("Miami");
  assert.equal(result.reply, "Try Joe's.");
  assert.equal(known.place, "Miami");
  assert.deepEqual(requests[1].body.messages, [{ role: "user", content: "places to eat near me" }], "the place itself is not a question");
  assert.deepEqual(requests[1].body.location, { text: "Miami" });
});

test("a failed question reports the reason and is not kept in the conversation", async () => {
  const { chat, requests, applied } = setup([{ ok: false, status: 502, body: { error: "trouble", reason: "key" } }, new Error("offline"), ok({ reply: "Fine." })]);
  assert.deepEqual(await chat.send("a"), { error: true, reason: "key" });
  assert.deepEqual(await chat.send("b"), { error: true });
  await chat.send("c");
  assert.deepEqual(requests[2].body.messages.map((m) => m.content), ["c"], "failed questions are dropped");
  assert.deepEqual(applied, []);
});

test("an empty message is ignored, and reset starts a fresh conversation", async () => {
  const { chat, requests } = setup([ok({ reply: "Hi." }), ok({ reply: "Again." })]);
  assert.deepEqual(await chat.send("   "), { empty: true });
  assert.equal(requests.length, 0);
  await chat.send("hello");
  chat.reset();
  await chat.send("hello again");
  assert.deepEqual(requests[1].body.messages.map((m) => m.content), ["hello again"]);
  assert.equal(requests[1].body.context.isNewConversation, true);
});
