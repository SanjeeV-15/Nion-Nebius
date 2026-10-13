// Checks the notebook tools and how they work inside the tool loop, with a pretend
// AI. Nothing here makes a real request or needs a key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createDataTools } from "../server/tools/data-tools.js";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { buildSystemPrompt } from "../server/prompt.js";
import { applyOps, emptyData } from "../shared/store.js";

const tools = Object.fromEntries(createDataTools().map((tool) => [tool.name, tool]));
const context = { today: "2026-10-13", nowISO: "2026-10-13T15:00:00.000Z" };
const withData = (ops = []) => ({ data: applyOps(emptyData(), ops), context });

test("the notebook tools are the ones Nion's instructions talk about", () => {
  assert.deepEqual(Object.keys(tools).sort(), ["add_expense", "add_to_list", "cancel_reminder", "forget", "remember", "save_draft", "set_reminder", "update_list_item"]);
  for (const tool of Object.values(tools)) {
    assert.equal(tool.parameters.type, "object");
    assert.ok(tool.description.length > 20);
  }
});

test("add_expense saves the amount and says what today's total is now", () => {
  const first = tools.add_expense.run({ amount: 12, currency: "usd", category: "Food", note: "lunch" }, withData());
  assert.equal(first.ops[0].op, "add_expense");
  assert.equal(first.ops[0].item.currency, "USD");
  assert.equal(first.ops[0].item.category, "food");
  assert.equal(first.ops[0].item.day, "2026-10-13");
  assert.match(first.text, /Saved 12\.00 USD for food/);

  const second = tools.add_expense.run({ amount: 19, currency: "USD", category: "taxi" }, withData(first.ops));
  assert.match(second.text, /31\.00 USD \(food 12\.00, taxi 19\.00\)/);
});

test("add_expense refuses a missing or silly amount", () => {
  for (const amount of [undefined, 0, -3, "lots"]) {
    const result = tools.add_expense.run({ amount }, withData());
    assert.deepEqual(result.ops, []);
    assert.match(result.text, /Not saved/);
  }
});

test("lists: add, don't duplicate, tick off, remove", () => {
  const added = tools.add_to_list.run({ list: "todo", item: "buy milk" }, withData());
  assert.match(added.text, /Added to the to-do list. It now has 1 open item\./);

  const again = tools.add_to_list.run({ list: "todo", item: "Buy milk" }, withData(added.ops));
  assert.deepEqual(again.ops, []);
  assert.match(again.text, /already on the to-do list/);

  const done = tools.update_list_item.run({ list: "todo", item: "milk", action: "done" }, withData(added.ops));
  assert.equal(done.ops[0].op, "complete_item");

  const removed = tools.update_list_item.run({ list: "todo", item: "buy milk", action: "remove" }, withData(added.ops));
  assert.equal(removed.ops[0].op, "remove_item");

  const missing = tools.update_list_item.run({ list: "todo", item: "fly to mars", action: "done" }, withData(added.ops));
  assert.deepEqual(missing.ops, []);
  assert.match(missing.text, /open items are: buy milk/);

  assert.match(tools.add_to_list.run({ list: "secret", item: "x" }, withData()).text, /Not saved/);
});

test("remember, don't repeat, and forget", () => {
  const saved = tools.remember.run({ fact: "avoids pork" }, withData());
  assert.equal(saved.ops[0].op, "remember");
  assert.match(tools.remember.run({ fact: "Avoids pork" }, withData(saved.ops)).text, /Already remembered/);
  const gone = tools.forget.run({ fact: "pork" }, withData(saved.ops));
  assert.equal(gone.ops[0].op, "forget");
  assert.match(tools.forget.run({ fact: "tea" }, withData()).text, /don't have a memory/);
});

test("save_draft only saves: the confirmation says it was not sent", () => {
  const result = tools.save_draft.run({ to: "Maria", subject: "Running late", body: "Hi Maria, I'll be about ten minutes late." }, withData());
  assert.equal(result.ops[0].item.to, "Maria");
  assert.match(result.text, /cannot send email/);
  assert.match(result.text, /offer to read it back/);
  assert.doesNotMatch(result.text, /screen|Notebook page|look at/i, "a listener is never sent to a screen")
  assert.deepEqual(tools.save_draft.run({ body: "" }, withData()).ops, []);
});

// ---- inside the tool loop ----

function scriptedFetch(replies) {
  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => replies[Math.min(sent.length - 1, replies.length - 1)], text: async () => "" };
  };
  return { fetchImpl, sent };
}
const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

test("two expenses in one go: the second sees the first, and the browser gets both changes", async () => {
  const { fetchImpl, sent } = scriptedFetch([
    { choices: [{ message: { content: null, tool_calls: [call("c1", "add_expense", { amount: 12, currency: "USD", category: "food" }), call("c2", "add_expense", { amount: 19, currency: "USD", category: "taxi" })] } }], usage: {} },
    { choices: [{ message: { content: "Done. That's 31 dollars today." } }], usage: {} },
  ]);
  const provider = createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: createDataTools() });
  assert.deepEqual(provider.abilities, { search: false, data: true });

  const result = await provider.ask({ system: "S", messages: [{ role: "user", content: "12 on lunch and 19 on a taxi" }], context, data: emptyData() });

  assert.equal(result.text, "Done. That's 31 dollars today.");
  assert.deepEqual(result.ops.map((op) => op.item.amount), [12, 19]);
  const toolReplies = sent[1].messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.match(toolReplies[1], /31\.00 USD/, "the second tool saw the first one's expense");
});

test("a provider with no notebook given still works (it starts from an empty one)", async () => {
  const { fetchImpl } = scriptedFetch([
    { choices: [{ message: { content: null, tool_calls: [call("c1", "add_to_list", { list: "visit", item: "old town" })] } }], usage: {} },
    { choices: [{ message: { content: "Added." } }], usage: {} },
  ]);
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: createDataTools() }).ask({ system: "S", messages: [{ role: "user", content: "x" }], context });
  assert.equal(result.ops[0].list, "visit");
});

// ---- the prompt ----

test("with the notebook on, Nion says what it can do and sees the notebook", () => {
  const data = applyOps(emptyData(), [{ op: "remember", item: { id: "m1", text: "avoids pork" } }]);
  const prompt = buildSystemPrompt({ today: "2026-10-13" }, { search: true, data: true }, data);
  assert.match(prompt, /You have a notebook on the person's own device/);
  assert.match(prompt, /never sent/);
  assert.match(prompt, /can't send email, make bookings or buy tickets, and a reminder can't reach the person if Nion is closed/);
  assert.match(prompt, /avoids pork/);
  assert.doesNotMatch(prompt, /You can't set reminders, change a to-do list, save notes/, "the old 'can't' text is gone");
});

test("without the notebook, Nion still says honestly that it can't save things", () => {
  const prompt = buildSystemPrompt({}, { search: true });
  assert.match(prompt, /You can't set reminders, change a to-do list, save notes/);
  assert.doesNotMatch(prompt, /The person's notebook, as it is right now/);
});
