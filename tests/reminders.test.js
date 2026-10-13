// Checks spoken reminders: setting them by voice (the tools), keeping them (the store),
// and saying them when the time comes (the scheduler). Everything is pretend, so nothing
// is spent and no real clock is waited for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createDataTools } from "../server/tools/data-tools.js";
import { createReminderScheduler } from "../public/js/reminders.js";
import { applyOps, cleanData, describeData, emptyData, LIMITS } from "../shared/store.js";
import { localToUtc } from "../shared/time.js";
import { buildSystemPrompt } from "../server/prompt.js";

const tools = Object.fromEntries(createDataTools().map((tool) => [tool.name, tool]));
const zone = "America/New_York";
const NOW = localToUtc("2026-10-13 14:00", zone); // 2:00 pm in New York
const context = { today: "2026-10-13", nowISO: new Date(NOW).toISOString(), timeZone: zone };
const withData = (ops = []) => ({ data: applyOps(emptyData(), ops), context });

const reminder = (id, text, minutesFromNow, extra = {}) => ({ id, text, dueAt: new Date(NOW + minutesFromNow * 60_000).toISOString(), at: "", ...extra });

// ---- the tools ----

test("'in 20 minutes' sets a reminder 20 minutes ahead, and the answer says the time back", () => {
  const result = tools.set_reminder.run({ text: "call the bank", minutes_from_now: 20 }, withData());
  assert.equal(result.ops[0].op, "add_reminder");
  assert.equal(result.ops[0].item.text, "call the bank");
  assert.equal(result.ops[0].item.dueAt, new Date(NOW + 20 * 60_000).toISOString());
  assert.match(result.text, /Reminder set for in 20 minutes: call the bank/);
  assert.match(result.text, /only be spoken while Nion is still open/);
});

test("a clock time is read on the person's own clock, today or another day", () => {
  const today = tools.set_reminder.run({ text: "leave for the airport", at_local: "2026-10-13 15:30" }, withData());
  assert.equal(today.ops[0].item.dueAt, "2026-10-13T19:30:00.000Z", "3:30 pm in New York in October is 19:30 UTC");
  assert.match(today.text, /today at 3:30 PM/);

  const tomorrow = tools.set_reminder.run({ text: "check out", at_local: "2026-10-14 09:00" }, withData());
  assert.match(tomorrow.text, /tomorrow at 9:00 AM/);
});

test("a reminder is refused, with a hint for what to ask, when the time is missing, passed, impossible or too far", () => {
  const cases = [
    [{ text: "x" }, /I need to know when/],
    [{ text: "x", minutes_from_now: -5 }, /already passed/],
    [{ text: "x", at_local: "2026-10-13 09:00" }, /already passed/],
    [{ text: "x", at_local: "tomorrow morning" }, /not a time I can use/],
    [{ text: "x", at_local: "2026-03-08 02:30" }, /not a time I can use|already passed/],
    [{ text: "x", minutes_from_now: 60 * 24 * 400 }, /more than a year/],
    [{ text: "  ", minutes_from_now: 5 }, /nothing to remind/],
  ];
  for (const [args, expected] of cases) {
    const result = tools.set_reminder.run(args, withData());
    assert.deepEqual(result.ops, [], JSON.stringify(args));
    assert.match(result.text, expected, JSON.stringify(args));
  }
});

test("the same reminder is not set twice, and the number of reminders is limited", () => {
  const first = tools.set_reminder.run({ text: "call the bank", minutes_from_now: 20 }, withData());
  const again = tools.set_reminder.run({ text: "Call the bank", minutes_from_now: 20 }, withData(first.ops));
  assert.deepEqual(again.ops, []);
  assert.match(again.text, /already set/);

  const full = Array.from({ length: LIMITS.reminders }, (_, i) => ({ op: "add_reminder", item: reminder(`r${i}`, `thing ${i}`, 10 + i) }));
  const refused = tools.set_reminder.run({ text: "one more", minutes_from_now: 99 }, withData(full));
  assert.deepEqual(refused.ops, []);
  assert.match(refused.text, /too many reminders/);
});

test("a reminder can be cancelled by what it was about", () => {
  const set = [{ op: "add_reminder", item: reminder("r1", "call the bank", 20) }, { op: "add_reminder", item: reminder("r2", "buy milk", 30) }];
  const result = tools.cancel_reminder.run({ text: "the bank" }, withData(set));
  assert.deepEqual(result.ops, [{ op: "remove_reminder", id: "r1" }]);
  assert.match(tools.cancel_reminder.run({ text: "dentist" }, withData(set)).text, /reminders are: call the bank, buy milk/);
  assert.match(tools.cancel_reminder.run({ text: "x" }, withData()).text, /no reminders to cancel/);
  const spoken = [{ op: "add_reminder", item: reminder("r3", "old one", -5) }, { op: "complete_reminder", id: "r3" }];
  assert.match(tools.cancel_reminder.run({ text: "old one" }, withData(spoken)).text, /no reminders to cancel/, "one already spoken can't be cancelled");
});

// ---- the notebook ----

test("reminders are kept clean, in order, and spoken ones are dropped first when there are too many", () => {
  assert.deepEqual(cleanData({ reminders: [{ id: "a", text: "x", dueAt: "not a date" }, { id: "", text: "y", dueAt: new Date(NOW).toISOString() }, null] }).reminders, []);
  const ok = cleanData({ reminders: [{ id: "a", text: "  call   bank ", dueAt: "2026-10-13T19:30:00Z", done: "yes" }] }).reminders[0];
  assert.deepEqual([ok.text, ok.dueAt, ok.done], ["call bank", "2026-10-13T19:30:00.000Z", false]);

  let data = emptyData();
  for (let i = 0; i < LIMITS.reminders; i++) data = applyOps(data, [{ op: "add_reminder", item: reminder(`r${i}`, `thing ${i}`, 10 + i) }]);
  data = applyOps(data, [{ op: "complete_reminder", id: "r5" }, { op: "add_reminder", item: reminder("new", "newest", 99) }]);
  assert.equal(data.reminders.length, LIMITS.reminders);
  assert.equal(data.reminders.some((r) => r.id === "r5"), false, "the spoken one made room");
  assert.equal(data.reminders.some((r) => r.id === "r0"), true, "unspoken ones are kept");
});

test("Nion sees upcoming reminders in plain words, soonest first, and not the ones already spoken", () => {
  const data = applyOps(emptyData(), [
    { op: "add_reminder", item: reminder("a", "buy milk", 60 * 22) },
    { op: "add_reminder", item: reminder("b", "call the bank", 20) },
    { op: "add_reminder", item: reminder("c", "already done", 5) },
    { op: "complete_reminder", id: "c" },
  ]);
  const text = describeData(data, "2026-10-13", { now: NOW, timeZone: zone });
  assert.match(text, /Reminders you will speak aloud when the time comes \(only while Nion is open\):\n- call the bank: in 20 minutes\n- buy milk: tomorrow at 12:00 PM/);
  assert.doesNotMatch(text, /already done/);
  assert.match(describeData(emptyData(), "2026-10-13"), /No reminders are set/);
});

test("Nion's instructions explain reminders honestly: spoken only while Nion is open", () => {
  const prompt = buildSystemPrompt(context, { search: true, data: true }, emptyData());
  assert.match(prompt, /set_reminder: minutes_from_now/);
  assert.match(prompt, /spoken aloud when the time comes, but only while Nion is open and turned on/);
  assert.match(prompt, /never promise it will reach them if Nion is closed/);
  assert.match(prompt, /cancel_reminder/);
  assert.doesNotMatch(prompt, /can't send email, set timed reminders/);
});

// ---- saying them when the time comes ----

function scheduler({ speakable = true, at = NOW, data } = {}) {
  let notebook = data ?? emptyData();
  const said = [];
  const state = { speakable, now: at };
  const s = createReminderScheduler({
    loadData: () => notebook,
    applyChanges: (ops) => (notebook = applyOps(notebook, ops)),
    canSpeak: () => state.speakable,
    announce: (text) => said.push(text),
    timeZone: zone,
    now: () => state.now,
  });
  return { s, said, state, notebook: () => notebook };
}
const notebookWith = (...items) => applyOps(emptyData(), items.map((item) => ({ op: "add_reminder", item })));

test("a reminder that is due is spoken once, and marked so it is never said twice", () => {
  const { s, said, state, notebook } = scheduler({ data: notebookWith(reminder("a", "call the bank.", 20)) });
  assert.equal(s.check(), false, "not due yet");
  state.now = NOW + 20 * 60_000 + 1000;
  assert.equal(s.check(), true);
  assert.deepEqual(said, ["Reminder: call the bank."], "a trailing full stop is not doubled");
  assert.equal(notebook().reminders[0].done, true);
  assert.equal(s.check(), false);
  assert.equal(said.length, 1);
});

test("it waits while Nion is busy, then speaks as soon as Nion is free", () => {
  const { s, said, state } = scheduler({ speakable: false, at: NOW + 25 * 60_000, data: notebookWith(reminder("a", "call the bank", 20)) });
  assert.equal(s.check(), false);
  assert.deepEqual(said, []);
  state.speakable = true;
  assert.equal(s.check(), true);
  assert.equal(said.length, 1);
});

test("a reminder that came due while Nion was closed is said with the time it was for", () => {
  const { s, said } = scheduler({ at: NOW + 3 * 3600_000, data: notebookWith(reminder("a", "call the bank", 20)) });
  s.check();
  assert.deepEqual(said, ["You had a reminder: call the bank, which was for 2:20 PM."]);
});

test("several that are due together are said together, in order", () => {
  const { s, said } = scheduler({ at: NOW + 60 * 60_000, data: notebookWith(reminder("b", "buy milk", 40), reminder("a", "call the bank", 20)) });
  s.check();
  assert.equal(said.length, 1);
  assert.match(said[0], /^You had reminders: call the bank, which was for 2:20 PM\. Also: buy milk, which was for 2:40 PM\.$/);
});

test("reminders already spoken, or not due yet, are ignored", () => {
  const data = notebookWith(reminder("a", "old", -10, { done: true }), reminder("b", "later", 120));
  const { s, said } = scheduler({ data });
  assert.equal(s.check(), false);
  assert.deepEqual(said, []);
});

test("the scheduler can be started and stopped without leaving a timer behind", () => {
  const { s } = scheduler();
  s.start();
  s.start();
  s.stop();
  assert.equal(s.CHECK_EVERY_MS, 5000);
});
