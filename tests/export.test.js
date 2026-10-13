// Checks the text builders, the email link and the share helper. Nothing is sent
// anywhere: they only prepare text for the person.

import { test } from "node:test";
import assert from "node:assert/strict";
import { draftAsText, listAsText, mailtoLink, recapAsText } from "../shared/export.js";
import { applyOps, emptyData, localToday } from "../shared/store.js";
import { shareText } from "../public/js/share.js";

const draft = { id: "d1", to: "maria@example.com", subject: "Running late & sorry", body: "Hi Maria,\n\nI'll be ten minutes late.\n\nSanjeev" };

test("an email link carries the address, subject and body, safely encoded", () => {
  const link = mailtoLink(draft);
  assert.ok(link.startsWith("mailto:maria@example.com?subject="));
  const url = new URL(link);
  assert.equal(url.searchParams.get("subject"), "Running late & sorry");
  assert.equal(url.searchParams.get("body"), draft.body, "line breaks survive");
  assert.doesNotMatch(link, /\s/, "no raw spaces or line breaks in the link");
});

test("a name is not an address: the To field is left for the person to fill in", () => {
  for (const to of ["Maria", "", undefined, "maria@", "a b@c.com", "x@y.com?bcc=evil@bad.com"]) {
    assert.ok(mailtoLink({ ...draft, to }).startsWith("mailto:?subject="), `to = ${JSON.stringify(to)}`);
  }
});

test("a draft too long for an email link gets no link (Copy and Share still work)", () => {
  assert.equal(mailtoLink({ ...draft, body: "é".repeat(1200) }), null);
});

test("a draft, a list and the recap read well as plain text", () => {
  assert.equal(draftAsText(draft), "To: maria@example.com\nSubject: Running late & sorry\n\nHi Maria,\n\nI'll be ten minutes late.\n\nSanjeev");
  assert.match(draftAsText({ body: "Hi" }), /^To: \(nobody yet\)\nSubject: \(none\)\n\nHi$/);

  const data = applyOps(emptyData(), [
    { op: "add_item", list: "todo", item: { id: "t1", text: "buy a SIM card" } },
    { op: "add_item", list: "todo", item: { id: "t2", text: "call the bank" } },
    { op: "complete_item", list: "todo", id: "t2" },
    { op: "add_item", list: "visit", item: { id: "v1", text: "the old town" } },
    { op: "add_expense", item: { id: "e1", amount: 12, currency: "USD", category: "food", day: "2026-10-13" } },
  ]);
  assert.equal(listAsText(data, "todo"), "To-do list:\n- buy a SIM card");
  assert.equal(listAsText(emptyData(), "visit"), "To-visit list: nothing open.");
  assert.equal(
    recapAsText(data, "2026-10-13"),
    "Trip recap for 2026-10-13\n\nSpent today: 12.00 USD (food 12.00).\n\nTo-do list:\n- buy a SIM card\n\nTo-visit list:\n- the old town"
  );
});

test("localToday is the person's own date", () => {
  assert.equal(localToday(new Date(2026, 9, 3, 23, 59)), "2026-10-03");
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
});

// ---- sharing ----

test("sharing uses the share sheet when there is one", async () => {
  const sent = [];
  const nav = { share: async (payload) => sent.push(payload) };
  assert.equal(await shareText({ title: "T", text: "hello" }, nav), "shared");
  assert.deepEqual(sent, [{ title: "T", text: "hello" }]);
});

test("closing the share sheet is not an error, and a broken share falls back to copying", async () => {
  const abort = { share: async () => { throw Object.assign(new Error("closed"), { name: "AbortError" }); } };
  assert.equal(await shareText({ title: "T", text: "x" }, abort), "cancelled");

  const copied = [];
  const broken = { share: async () => { throw new Error("nope"); }, clipboard: { writeText: async (t) => copied.push(t) } };
  assert.equal(await shareText({ title: "T", text: "fallback" }, broken), "copied");
  assert.deepEqual(copied, ["fallback"]);
});

test("with no share sheet it copies, and says so if even that is not possible", async () => {
  const copied = [];
  assert.equal(await shareText({ title: "T", text: "abc" }, { clipboard: { writeText: async (t) => copied.push(t) } }), "copied");
  assert.equal(await shareText({ title: "T", text: "abc" }, {}), "failed");
  assert.equal(await shareText({ title: "T", text: "abc" }, undefined), "failed");
});
