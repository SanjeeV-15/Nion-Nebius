// Checks the Notebook page (public/js/notebook.js) with a tiny pretend web page.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOps, emptyData, expenseDays } from "../shared/store.js";

// --- A tiny pretend page ----------------------------------------------------

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.handlers = {};
    this.classList = { add: (name) => (this.className += ` ${name}`) };
  }
  append(...nodes) { this.children.push(...nodes); }
  prepend(node) { this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  setAttribute() {}
  remove() {}
  click() { return this.handlers.click?.(); }
}

const everyNode = (node) => [node, ...node.children.filter((c) => typeof c !== "string").flatMap(everyNode)];
const textOf = (node) => everyNode(node).map((n) => n.textContent).join("\n") + node.children.filter((c) => typeof c === "string").join("");
const buttonsLabelled = (root, label) => everyNode(root).filter((n) => n.tag === "button" && n.textContent === label);

let storage, root, confirmAnswer;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.confirm = () => confirmAnswer;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async () => {} } } });

let version = 0;
async function openNotebook(data) {
  storage = new Map();
  if (data) storage.set("nion.data", JSON.stringify(data));
  root = new FakeNode("div");
  globalThis.document = { getElementById: () => root, createElement: (tag) => new FakeNode(tag), body: new FakeNode("body") };
  await import(`../public/js/notebook.js?run=${++version}`);
}
const saved = () => JSON.parse(storage.get("nion.data"));

const sample = applyOps(emptyData(), [
  { op: "remember", item: { id: "m1", text: "avoids pork" } },
  { op: "add_item", list: "todo", item: { id: "t1", text: "buy a SIM card" } },
  { op: "add_item", list: "visit", item: { id: "v1", text: "the old town" } },
  { op: "add_expense", item: { id: "e1", amount: 12, currency: "USD", category: "food", note: "lunch", day: "2026-10-13" } },
  { op: "add_expense", item: { id: "e2", amount: 19, currency: "USD", category: "transport", day: "2026-10-13" } },
  { op: "save_draft", item: { id: "d1", to: "Maria", subject: "Running late", body: "Hi Maria, I'll be late." } },
]);

// --- The tests --------------------------------------------------------------

test("an empty notebook shows a friendly line for every section", async () => {
  await openNotebook();
  const text = textOf(root);
  assert.match(text, /What Nion remembers/);
  assert.match(text, /Nothing yet\. Tell Nion something lasting/);
  assert.match(text, /Nothing on the to-do list yet/);
  assert.match(text, /Nothing on the to-visit list yet/);
  assert.match(text, /No expenses yet/);
  assert.match(text, /No drafts yet/);
});

test("the notebook page shows what Nion saved", async () => {
  await openNotebook(sample);
  const text = textOf(root);
  for (const expected of [/avoids pork/, /buy a SIM card/, /the old town/, /2026-10-13: 31\.00 USD \(food 12\.00, transport 19\.00\)/, /12\.00 USD · food · lunch/, /To: Maria/, /Subject: Running late/, /Hi Maria, I'll be late\./, /saved, never sent/]) {
    assert.match(text, expected);
  }
  // Every section that has something in it must not also say it is empty.
  assert.doesNotMatch(text, /Nothing yet|Nothing on the|No expenses yet|No drafts yet/);
});

test("removing, ticking off and forgetting change the saved notebook", async () => {
  await openNotebook(sample);
  buttonsLabelled(root, "Forget")[0].click();
  assert.equal(saved().memories.length, 0);

  const box = everyNode(root).find((n) => n.tag === "input");
  box.checked = true;
  box.handlers.change();
  assert.equal(saved().lists.todo[0].done, true);
  assert.match(root.children.map(textOf).join(" "), /buy a SIM card/, "still shown, just ticked");
  const again = everyNode(root).find((n) => n.tag === "input");
  again.checked = false;
  again.handlers.change();
  assert.equal(saved().lists.todo[0].done, false, "unticking reopens it");

  buttonsLabelled(root, "Remove").find((b) => true).click(); // first Remove: the to-do item
  assert.equal(saved().lists.todo.length, 0);

  const removeExpense = buttonsLabelled(root, "Remove").at(-1);
  removeExpense.click();
  assert.equal(saved().expenses.length, 1);

  buttonsLabelled(root, "Delete").find((b) => true).click();
  assert.equal(saved().drafts.length, 0);
});

test("Delete everything asks first, and only deletes when you say yes", async () => {
  await openNotebook(sample);
  confirmAnswer = false;
  buttonsLabelled(root, "Delete everything")[0].click();
  assert.equal(saved().memories.length, 1, "nothing deleted after no");

  confirmAnswer = true;
  buttonsLabelled(root, "Delete everything")[0].click();
  assert.equal(storage.get("nion.data"), undefined);
  assert.match(textOf(root), /No drafts yet/);
});

test("text from the notebook is shown as plain text, never as HTML", async () => {
  const sneaky = applyOps(emptyData(), [{ op: "remember", item: { id: "x", text: '<img src=x onerror="alert(1)">' } }]);
  await openNotebook(sneaky);
  assert.match(textOf(root), /<img src=x onerror="alert\(1\)">/, "shown literally");
  const source = readFileSync(new URL("../public/js/notebook.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test("expenseDays lists the newest day first and unknown days last", () => {
  const data = applyOps(emptyData(), [
    { op: "add_expense", item: { id: "a", amount: 1, day: "2026-10-12" } },
    { op: "add_expense", item: { id: "b", amount: 1, day: "" } },
    { op: "add_expense", item: { id: "c", amount: 1, day: "2026-10-13" } },
  ]);
  assert.deepEqual(expenseDays(data), ["2026-10-13", "2026-10-12", ""]);
});

test("the new store changes: reopen, remove expense, remove draft", () => {
  const next = applyOps(sample, [
    { op: "complete_item", list: "todo", id: "t1" },
    { op: "reopen_item", list: "todo", id: "t1" },
    { op: "remove_expense", id: "e1" },
    { op: "remove_draft", id: "d1" },
  ]);
  assert.equal(next.lists.todo[0].done, false);
  assert.deepEqual(next.expenses.map((e) => e.id), ["e2"]);
  assert.equal(next.drafts.length, 0);
});

// --- Email and share buttons ----------------------------------------------------

const useNavigator = (value) => Object.defineProperty(globalThis, "navigator", { configurable: true, value });

test("a draft has an 'Open in email app' link, and a name leaves the To field empty", async () => {
  await openNotebook(sample); // the sample draft is for "Maria", a name, not an address
  const link = everyNode(root).find((n) => n.tag === "a" && n.textContent === "Open in email app");
  assert.ok(link.href.startsWith("mailto:?subject=Running%20late"), link.href);
  assert.match(decodeURIComponent(link.href), /Hi Maria, I'll be late\./);

  const withAddress = applyOps(emptyData(), [{ op: "save_draft", item: { id: "d2", to: "maria@example.com", subject: "Hi", body: "Hello" } }]);
  await openNotebook(withAddress);
  assert.ok(everyNode(root).find((n) => n.tag === "a" && n.textContent === "Open in email app").href.startsWith("mailto:maria@example.com?"));
});

test("Share on a draft, a list and the day's recap hands the right text to the share sheet", async () => {
  const shared = [];
  useNavigator({ share: async (payload) => shared.push(payload), clipboard: { writeText: async () => {} } });
  await openNotebook(sample);

  const shareButtons = buttonsLabelled(root, "Share");
  assert.equal(shareButtons.length, 3, "one per list with open items (2) and one for the draft");
  for (const b of shareButtons) await b.click();
  const texts = shared.map((s) => s.text);
  assert.ok(texts.some((t) => t === "To-do list:\n- buy a SIM card"));
  assert.ok(texts.some((t) => t === "To-visit list:\n- the old town"));
  assert.ok(texts.some((t) => /^To: Maria\nSubject: Running late\n\nHi Maria/.test(t)));

  await buttonsLabelled(root, "Share today's recap")[0].click();
  assert.match(shared.at(-1).text, /^Trip recap for \d{4}-\d{2}-\d{2}\n\nSpent today:/);
  assert.equal(shared.at(-1).title, "Trip recap");
});

test("a list with nothing open has no Share button", async () => {
  await openNotebook(emptyData());
  assert.equal(buttonsLabelled(root, "Share").length, 0);
});
