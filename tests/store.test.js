// Checks the notebook rules (shared/store.js) used by both the server and the page.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, cleanData, describeData, describeDay, emptyData, findByText, LIMITS } from "../shared/store.js";

const expense = (id, amount, extra = {}) => ({ id, amount, currency: "USD", category: "food", note: "", at: "", day: "2026-10-13", ...extra });

test("cleanData turns anything into a valid notebook", () => {
  assert.deepEqual(cleanData(undefined), emptyData());
  assert.deepEqual(cleanData("nonsense"), emptyData());
  assert.deepEqual(cleanData({ memories: "x", lists: 5, expenses: [null, 3] }), emptyData());
});

test("cleanData drops broken items and tidies the rest", () => {
  const data = cleanData({
    memories: [{ id: "a", text: "  likes   tea " }, { id: "", text: "no id" }, { id: "b", text: "" }],
    expenses: [expense("e1", 12.345, { currency: "usd1", category: " FOOD " }), expense("e2", -5), expense("e3", "abc"), expense("e4", 3, { day: "yesterday" })],
    lists: { todo: [{ id: "t1", text: "buy milk", done: "yes" }], other: [{ id: "x", text: "ignored" }] },
    drafts: [{ id: "d1", body: "Hi" }, { id: "d2", body: "" }],
  });
  assert.deepEqual(data.memories.map((m) => m.text), ["likes tea"]);
  assert.deepEqual(data.expenses.map((e) => [e.id, e.amount, e.currency, e.category, e.day]), [["e1", 12.35, "USD", "food", "2026-10-13"], ["e4", 3, "USD", "food", ""]]);
  assert.equal(data.lists.todo[0].done, false, "only a real true counts as done");
  assert.equal("other" in data.lists, false);
  assert.deepEqual(data.drafts.map((d) => d.id), ["d1"]);
});

test("the notebook keeps only the newest items, so requests stay small", () => {
  const many = Array.from({ length: LIMITS.expenses + 25 }, (_, i) => expense(`e${i}`, 1));
  const data = cleanData({ expenses: many });
  assert.equal(data.expenses.length, LIMITS.expenses);
  assert.equal(data.expenses.at(-1).id, `e${LIMITS.expenses + 24}`);
  assert.equal(data.expenses[0].id, "e25");
});

test("applyOps adds, completes and removes things, and never changes the original", () => {
  const start = emptyData();
  const next = applyOps(start, [
    { op: "remember", item: { id: "m1", text: "avoids pork" } },
    { op: "add_expense", item: expense("e1", 12) },
    { op: "add_item", list: "todo", item: { id: "t1", text: "buy milk" } },
    { op: "add_item", list: "visit", item: { id: "v1", text: "old town" } },
    { op: "save_draft", item: { id: "d1", to: "Maria", subject: "Late", body: "I'll be late." } },
    { op: "complete_item", list: "todo", id: "t1" },
    { op: "remove_item", list: "visit", id: "v1" },
  ]);
  assert.deepEqual(start, emptyData());
  assert.equal(next.memories.length, 1);
  assert.equal(next.expenses[0].amount, 12);
  assert.equal(next.lists.todo[0].done, true);
  assert.equal(next.lists.visit.length, 0);
  assert.equal(next.drafts[0].to, "Maria");
  assert.equal(applyOps(next, [{ op: "forget", id: "m1" }]).memories.length, 0);
});

test("applyOps skips invalid or unknown changes and doesn't remember the same thing twice", () => {
  const next = applyOps(emptyData(), [
    { op: "launch_rocket" },
    null,
    { op: "add_expense", item: { id: "e1", amount: "lots" } },
    { op: "add_item", list: "secret", item: { id: "x", text: "no" } },
    { op: "remember", item: { id: "m1", text: "Avoids pork" } },
    { op: "remember", item: { id: "m2", text: "avoids pork" } },
  ]);
  assert.equal(next.expenses.length, 0);
  assert.equal(next.memories.length, 1);
  assert.deepEqual(applyOps(emptyData(), "not a list"), emptyData());
});

test("findByText matches what the person said to an item, loosely", () => {
  const items = [{ id: "a", text: "Buy milk", done: true }, { id: "b", text: "call the bank", done: false }];
  assert.equal(findByText(items, "buy milk")?.id, "a");
  assert.equal(findByText(items, "the bank")?.id, "b");
  assert.equal(findByText(items, "please call the bank today")?.id, "b", "the item inside a longer phrase");
  assert.equal(findByText(items, "buy milk", { openOnly: true }), undefined, "done items skipped on request");
  assert.equal(findByText(items, ""), undefined);
});

test("spending today is totalled by category and currency", () => {
  const data = cleanData({ expenses: [expense("a", 12), expense("b", 19, { category: "taxi" }), expense("c", 5, { currency: "EUR" }), expense("d", 7, { day: "2026-10-12" })] });
  assert.equal(describeDay(data, "2026-10-13"), "31.00 USD (food 12.00, taxi 19.00); 5.00 EUR (food 5.00)");
  assert.equal(describeDay(data, "2026-10-01"), "nothing yet");
});

test("describeData gives Nion everything it needs to answer from the notebook", () => {
  const empty = describeData(emptyData(), "2026-10-13");
  assert.match(empty, /don't remember anything/);
  assert.match(empty, /to-do list is empty/);
  assert.match(empty, /No expenses/);

  const data = applyOps(emptyData(), [
    { op: "remember", item: { id: "m1", text: "avoids pork" } },
    { op: "add_item", list: "todo", item: { id: "t1", text: "buy milk" } },
    { op: "add_item", list: "todo", item: { id: "t2", text: "call bank" } },
    { op: "complete_item", list: "todo", id: "t2" },
    { op: "add_expense", item: expense("e1", 12, { note: "lunch" }) },
  ]);
  const text = describeData(data, "2026-10-13");
  assert.match(text, /avoids pork/);
  assert.match(text, /buy milk/);
  assert.doesNotMatch(text, /call bank/, "finished items are not listed as open");
  assert.match(text, /Spending today \(2026-10-13\): 12\.00 USD \(food 12\.00\)/);
  assert.match(text, /12\.00 USD food \(lunch\)/);
});
