// Checks voice-controlled panels: recognising "show my to-do list" and "close it", what a
// panel shows, and what Nion says about it. No screen, no AI, no clock waited for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPanel, matchPanelCommand, panelFromWords, PANELS, spokenMoney, spokenPanel } from "../shared/panels.js";
import { applyOps, emptyData } from "../shared/store.js";
import { localToUtc } from "../shared/time.js";

const zone = "America/New_York";
const NOW = localToUtc("2026-10-13 14:00", zone);
const opts = { now: NOW, timeZone: zone, today: "2026-10-13" };
const at = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

const data = applyOps(emptyData(), [
  { op: "add_item", list: "todo", item: { id: "t1", text: "buy a SIM card" } },
  { op: "add_item", list: "todo", item: { id: "t2", text: "call the bank" } },
  { op: "complete_item", list: "todo", id: "t2" },
  { op: "add_item", list: "visit", item: { id: "v1", text: "the old town" } },
  { op: "add_reminder", item: { id: "r1", text: "call the bank", dueAt: at(20) } },
  { op: "add_expense", item: { id: "e1", amount: 12, currency: "USD", category: "food", note: "lunch", day: "2026-10-13" } },
  { op: "add_expense", item: { id: "e2", amount: 19, currency: "USD", category: "transport", day: "2026-10-13" } },
  { op: "remember", item: { id: "m1", text: "avoids pork" } },
  { op: "save_draft", item: { id: "d1", to: "Maria", subject: "Running late", body: "Hi Maria,\n\nI'll be late." } },
]);

// ---- recognising a request ----

test("the usual ways of asking to see a list are recognised", () => {
  const cases = {
    "show my to-do list": "todo",
    "Show me my to do list": "todo",
    "open the todo list": "todo",
    "pull up my tasks": "todo",
    "can you show me my to-do list please": "todo",
    "could you open my reminders": "reminders",
    "can I see my expenses": "expenses",
    "let me see my to-visit list": "visit",
    "show the places to visit": "visit",
    "okay show my drafts": "drafts",
    "display what you remember about me": "memories",
    "show my notebook": "all",
    "show everything": "all",
  };
  for (const [said, panel] of Object.entries(cases)) assert.deepEqual(matchPanelCommand(said), { type: "open", panel }, said);
});

test("closing is recognised, but only real closing", () => {
  for (const said of ["close it", "Close", "close the list", "please close that", "hide the panel", "can you hide it", "okay close the notebook", "dismiss this"]) {
    assert.deepEqual(matchPanelCommand(said), { type: "close" }, said);
  }
  for (const said of ["remove that", "clear the list", "delete it", "remove buy milk", "close the door", "close the conversation please and tell me the time"]) {
    assert.equal(matchPanelCommand(said), null, `${said} must not close the panel`);
  }
});

test("requests that merely sound similar are left for the AI to answer", () => {
  for (const said of ["show me places to visit in Paris", "show me the best restaurants nearby", "open the pod bay doors", "what is on my to-do list", "show me how to cook rice", "show my emails", "", undefined]) {
    assert.equal(matchPanelCommand(said), null, String(said));
  }
});

test("every panel can be named, and unknown names are not panels", () => {
  assert.equal(panelFromWords("to-do list"), "todo");
  assert.equal(panelFromWords("Places To Visit"), "visit");
  assert.equal(panelFromWords("what I've spent"), "expenses");
  assert.equal(panelFromWords("bank account"), null);
  assert.deepEqual(PANELS, ["todo", "visit", "reminders", "expenses", "drafts", "memories", "all"]);
});

// ---- what a panel shows ----

test("the to-do panel shows open items first, then finished ones ticked", () => {
  const panel = formatPanel(data, "todo", opts);
  assert.equal(panel.title, "To-do list");
  assert.equal(panel.text, "☐ buy a SIM card\n☑ call the bank");
  assert.equal(formatPanel(emptyData(), "todo", opts).text, "Nothing on the to-do list yet.");
});

test("reminders show when they are due, soonest first, in plain words", () => {
  assert.equal(formatPanel(data, "reminders", opts).text, "• call the bank · in 20 minutes");
  assert.equal(formatPanel(emptyData(), "reminders", opts).text, "No reminders.");
});

test("expenses show today's total and items, and earlier days in short", () => {
  const withEarlier = applyOps(data, [{ op: "add_expense", item: { id: "e3", amount: 8.5, currency: "USD", category: "food", day: "2026-10-12" } }]);
  const text = formatPanel(withEarlier, "expenses", opts).text;
  assert.match(text, /^Today: 31\.00 USD \(food 12\.00, transport 19\.00\)/);
  assert.match(text, /19\.00 USD · transport\n12\.00 USD · food · lunch/, "newest first");
  assert.match(text, /2026-10-12: 8\.50 USD \(food 8\.50\)/);
  assert.equal(formatPanel(emptyData(), "expenses", opts).text, "No expenses yet.");
});

test("drafts show the newest in full, and memories as a list; 'all' shows everything", () => {
  assert.match(formatPanel(data, "drafts", opts).text, /^To: Maria\nSubject: Running late\n\nHi Maria,\n\nI'll be late\.$/);
  assert.equal(formatPanel(data, "memories", opts).text, "• avoids pork");
  const all = formatPanel(data, "all", opts);
  assert.equal(all.title, "Notebook");
  for (const heading of ["To-do list", "To-visit list", "Reminders", "Expenses", "Email drafts", "What Nion remembers"]) assert.match(all.text, new RegExp(heading));
  assert.deepEqual(formatPanel(data, "nonsense", opts), { title: "", text: "" });
});

// ---- what Nion says ----

test("Nion says what is on the list, at most five items, in plain words", () => {
  assert.equal(spokenPanel(data, "todo", opts), "Here's your to-do list. You have 1 open item: buy a SIM card.");
  assert.equal(spokenPanel(emptyData(), "visit", opts), "Here's your to-visit list. It's empty.");
  const many = applyOps(emptyData(), ["a", "b", "c", "d", "e", "f", "g"].map((x, i) => ({ op: "add_item", list: "todo", item: { id: `i${i}`, text: `thing ${x}` } })));
  assert.equal(spokenPanel(many, "todo", opts), "Here's your to-do list. You have 7 open items: thing a, thing b, thing c, thing d, thing e, and 2 more.");
  const two = applyOps(emptyData(), [{ op: "add_item", list: "todo", item: { id: "a", text: "milk" } }, { op: "add_item", list: "todo", item: { id: "b", text: "eggs" } }]);
  assert.match(spokenPanel(two, "todo", opts), /2 open items: milk, and eggs\./);
});

test("money is said as words, not 'thirty-one point zero zero U S D'", () => {
  assert.equal(spokenMoney(31, "USD"), "31 dollars");
  assert.equal(spokenMoney(12.5, "EUR"), "12.50 euros");
  assert.equal(spokenMoney(5, "XYZ"), "5 XYZ");
  assert.equal(spokenPanel(data, "expenses", opts), "Here are your expenses. Today you've spent 31 dollars.");
  assert.equal(spokenPanel(emptyData(), "expenses", opts), "Here are your expenses. There are none yet.");
});

test("reminders, drafts, memories and the whole notebook are said briefly", () => {
  assert.equal(spokenPanel(data, "reminders", opts), "Here are your reminders. You have 1 reminder: call the bank, in 20 minutes.");
  assert.match(spokenPanel(data, "drafts", opts), /1 draft\. The newest is to Maria, about Running late\. Want me to read it to you\?/);
  assert.equal(spokenPanel(data, "memories", opts), "Here's what I remember. avoids pork.");
  assert.equal(spokenPanel(data, "all", opts), "Here's your notebook. You have 1 open to-do, 1 place to visit, and 1 reminder.");
  assert.equal(spokenPanel(data, "nonsense", opts), "");
});
