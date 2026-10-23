// Checks the sample trip: it fills the notebook, is clearly marked, and comes out again cleanly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, emptyData } from "../shared/store.js";
import { hasSample, removeSampleOps, sampleOps } from "../shared/sample.js";
import { formatPanel, spokenPanel } from "../shared/panels.js";

const NOW = Date.parse("2026-10-22T15:00:00Z");
const TODAY = "2026-10-22";

test("the sample trip fills every part of the notebook, and today's expenses add up", () => {
  const data = applyOps(emptyData(), sampleOps({ now: NOW, today: TODAY }));
  assert.equal(data.memories.length, 2);
  assert.equal(data.expenses.length, 4);
  assert.equal(data.lists.todo.length, 2);
  assert.equal(data.lists.visit.length, 2);
  assert.equal(data.reminders.length, 1);
  assert.equal(data.drafts.length, 1);
  assert.equal(data.expenses.filter((e) => e.day === TODAY).length, 3);
  assert.match(spokenPanel(data, "expenses", { now: NOW, today: TODAY }), /38\.50 euros/);
  assert.match(formatPanel(data, "todo").text, /Book the airport shuttle/);
});

test("the reminder is in the future, so it does not go off while someone is looking", () => {
  const data = applyOps(emptyData(), sampleOps({ now: NOW, today: TODAY }));
  assert.ok(Date.parse(data.reminders[0].dueAt) > NOW + 24 * 3_600_000);
});

test("removing the sample leaves the person's own entries alone", () => {
  const own = applyOps(emptyData(), [
    { op: "add_expense", item: { id: "mine1", amount: 7, currency: "USD", category: "food", note: "Bagel", day: TODAY, at: "" } },
    { op: "add_item", list: "todo", item: { id: "mine2", text: "Call home", at: "" } },
  ]);
  const withSample = applyOps(own, sampleOps({ now: NOW, today: TODAY }));
  assert.equal(hasSample(withSample), true);
  const cleaned = applyOps(withSample, removeSampleOps(withSample));
  assert.equal(hasSample(cleaned), false);
  assert.deepEqual(cleaned, own);
});

test("a notebook with no sample says so", () => {
  assert.equal(hasSample(emptyData()), false);
});
