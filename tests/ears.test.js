// Guards Nion's main idea: designed for ears, not screens. Whatever Nion can do, it must be
// possible, and natural, to do it by voice alone, without sending the listener to a screen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../server/prompt.js";
import { createDataTools } from "../server/tools/data-tools.js";
import { applyOps, describeData, emptyData } from "../shared/store.js";

const withDraft = applyOps(emptyData(), [
  { op: "save_draft", item: { id: "d1", to: "Maria", subject: "Running late", body: "Hi Maria,\n\nI'll be about ten minutes late.\n\nSanjeev" } },
]);

test("Nion is told to offer to read a saved draft back, not to look at a screen", () => {
  const prompt = buildSystemPrompt({ today: "2026-10-13" }, { search: true, data: true }, withDraft);
  assert.match(prompt, /offer to read it back/);
  assert.match(prompt, /about sixty words at a time/);
  assert.match(prompt, /don't send the person to a screen/);
  assert.match(prompt, /Never tell the person to look at something, to open a link, or to read a list/);
  assert.doesNotMatch(prompt, /they can read and copy it on the Notebook page/, "the old instruction is gone");
});

test("the Notebook screen is mentioned only when the person asks for it", () => {
  const prompt = buildSystemPrompt({}, { search: true, data: true }, emptyData());
  assert.match(prompt, /Mention the Notebook screen only if they ask/);
});

test("Nion can see the newest draft in full, so it can read it out", () => {
  const text = describeData(withDraft, "2026-10-13");
  assert.match(text, /The newest draft, in full/);
  assert.match(text, /I'll be about ten minutes late\./);
  assert.match(text, /Subject: Running late/);
  assert.doesNotMatch(describeData(emptyData(), "2026-10-13"), /newest draft/);
});

test("only the newest draft is shown in full; older ones are one line each", () => {
  const two = applyOps(withDraft, [{ op: "save_draft", item: { id: "d2", to: "Sam", subject: "Lunch", body: "Lunch tomorrow?" } }]);
  const text = describeData(two, "2026-10-13");
  assert.match(text, /Lunch tomorrow\?/);
  assert.doesNotMatch(text, /ten minutes late/, "the older draft's text is not repeated in full");
  assert.match(text, /to Maria: Running late/);
});

test("no notebook tool tells the model to send the listener to a screen", () => {
  const sample = { data: emptyData(), context: { today: "2026-10-13" } };
  const results = [
    createDataTools().find((t) => t.name === "save_draft").run({ to: "Maria", subject: "Hi", body: "Hello" }, sample),
    createDataTools().find((t) => t.name === "add_to_list").run({ list: "todo", item: "buy milk" }, sample),
    createDataTools().find((t) => t.name === "add_expense").run({ amount: 12, currency: "USD" }, sample),
    createDataTools().find((t) => t.name === "remember").run({ fact: "avoids pork" }, sample),
    createDataTools().find((t) => t.name === "set_reminder").run({ text: "call the bank", minutes_from_now: 20 }, { data: emptyData(), context: { nowISO: "2026-10-13T18:00:00.000Z", timeZone: "UTC" } }),
  ];
  for (const { text } of results) assert.doesNotMatch(text, /screen|look at|Notebook page|open the/i, text);
});
