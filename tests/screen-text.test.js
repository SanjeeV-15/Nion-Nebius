// Checks what is shown on screen: markdown and list dashes are removed, and sources get short names.
// The first cases are real answers that looked wrong on the live site.

import { test } from "node:test";
import assert from "node:assert/strict";
import { screenText, sourceName } from "../shared/screen-text.js";

test("markdown bold marks are removed", () => {
  assert.equal(
    screenText("A few solid spots in Lisbon: **Prado** in Chiado—mid-range; **Bairro do Avillez**, also in Chiado."),
    "A few solid spots in Lisbon: Prado in Chiado—mid-range; Bairro do Avillez, also in Chiado."
  );
  assert.equal(screenText("Use `code` and *this*"), "Use code and this");
});

test("dashes used as list markers are removed, but hyphens, dashes inside sentences and ranges stay", () => {
  assert.equal(
    screenText("Here are the headlines: - In France, a shooting (Euronews). - Russian strikes hit Kyiv (WORLD)."),
    "Here are the headlines: In France, a shooting (Euronews). Russian strikes hit Kyiv (WORLD)."
  );
  assert.equal(screenText("Three things:\n- Coffee\n- Lunch\n• Dinner"), "Three things: Coffee Lunch Dinner");
  assert.equal(screenText("A mid-range, family-run spot, open 9 - 5, in Chiado—near the river."), "A mid-range, family-run spot, open 9 - 5, in Chiado—near the river.");
});

test("headings and blank space are tidied; ordinary text is unchanged", () => {
  assert.equal(screenText("## Today\nIt is Tuesday."), "Today It is Tuesday.");
  const plain = "It's Tuesday, October 13th, and the time in Denver is 3:30 PM.";
  assert.equal(screenText(plain), plain);
  assert.equal(screenText(""), "");
  assert.equal(screenText(undefined), "");
});

test("a source shows its title shortened, or its site name when it has no title", () => {
  assert.equal(sourceName({ title: "Euronews", url: "https://www.euronews.com/x" }), "Euronews");
  assert.equal(
    sourceName({ title: "What are the best restaurants to try when visiting Lisbon? What should you try while you're there? - Quora", url: "https://q.com" }),
    "What are the best restaurants to try when visit…"
  );
  assert.equal(sourceName({ title: "", url: "https://www.thevegetarianhannibal.com/best-vegetarian-restaurants-in-lisbon/" }), "thevegetarianhannibal.com");
  assert.equal(sourceName({ title: "https://thevegetarianhannibal.com/best/", url: "https://thevegetarianhannibal.com/best/" }), "thevegetarianhannibal.com");
  assert.equal(sourceName({}), "source");
  assert.equal(sourceName(undefined), "source");
});
