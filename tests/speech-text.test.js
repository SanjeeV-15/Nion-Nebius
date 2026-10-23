// Checks what a speech voice is told to say: symbols turned into words, so "$$" is never read out
// as "dollar dollar". The first test is the exact answer a real conversation produced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { speechText } from "../shared/speech-text.js";

test("the answer that was read out as 'dollar dollar dollar' now reads as words", () => {
  const heard =
    "According to Yelp and OpenTable, Four Friends Kitchen in Stapleton is $$ and serves American comfort food. " +
    "The Ponti downtown is $$$$ with contemporary American dishes focusing on vegetables and grains. " +
    "PEMA in Five Points is $$ and offers Tibetan‑Nepali‑Indian fusion.";
  assert.equal(
    speechText(heard),
    "According to Yelp and OpenTable, Four Friends Kitchen in Stapleton is mid-range and serves American comfort food. " +
      "The Ponti downtown is very expensive with contemporary American dishes focusing on vegetables and grains. " +
      "PEMA in Five Points is mid-range and offers Tibetan‑Nepali‑Indian fusion."
  );
});

test("price levels of every size become words, wherever they sit in a sentence", () => {
  assert.equal(speechText("It's $ and tasty."), "It's inexpensive and tasty.");
  assert.equal(speechText("Prices: $$$, open late."), "Prices: pricey, open late.");
  assert.equal(speechText("A $$$$ spot."), "A very expensive spot.");
  assert.equal(speechText("Ranked $, $$ and $$$."), "Ranked inexpensive, mid-range and pricey.");
});

test("dollar amounts are said as amounts", () => {
  assert.equal(speechText("It costs $12."), "It costs 12 dollars.");
  assert.equal(speechText("Just $1."), "Just 1 dollar.");
  assert.equal(speechText("About $12.50 each."), "About 12 dollars 50 cents each.");
  assert.equal(speechText("Only $0.99."), "Only 99 cents.");
  assert.equal(speechText("That's $5.00 flat."), "That's 5 dollars flat.");
  assert.equal(speechText("A $3 million plan and $8 billion more."), "A 3 million dollars plan and 8 billion dollars more.");
  assert.equal(speechText("Rent is $1,200 a month."), "Rent is 1,200 dollars a month.");
  assert.equal(speechText("It cost $ 15 in total."), "It cost 15 dollars in total.");
});

test("other symbols a voice would read awkwardly are turned into words, and ordinary text is left alone", () => {
  assert.equal(speechText("Salt & pepper"), "Salt and pepper");
  assert.equal(speechText("A 20% tip, about 5 %"), "A 20 percent tip, about 5 percent");
  assert.equal(speechText("It's ~10 minutes away."), "It's about 10 minutes away.");
  assert.equal(speechText("**Bold** and `code`"), "Bold and code");
  const plain = "It's Tuesday, October 13th, and the time in Denver is 3:30 PM.";
  assert.equal(speechText(plain), plain);
  assert.equal(speechText(""), "");
  assert.equal(speechText(undefined), "");
});

test("a dash or bullet used as a list marker is not spoken, but hyphens and ranges are kept", () => {
  assert.equal(
    speechText("Here are the latest headlines: - In France, a gunman opened fire (Euronews). - Russian strikes hit Kyiv (WORLD)."),
    "Here are the latest headlines: In France, a gunman opened fire (Euronews). Russian strikes hit Kyiv (WORLD)."
  );
  assert.equal(speechText("Three things:\n- Coffee\n- Lunch\n• Dinner"), "Three things: Coffee Lunch Dinner");
  assert.equal(speechText("A mid-range, family-run spot, open 9 - 5."), "A mid-range, family-run spot, open 9 - 5.");
  assert.equal(speechText("It's well-known and a 5-minute walk."), "It's well-known and a 5-minute walk.");
});

test("Nion's instructions tell it to say price levels in words and never read out dollar signs", async () => {
  const { buildSystemPrompt } = await import("../server/prompt.js");
  const prompt = buildSystemPrompt({}, { search: true });
  assert.match(prompt, /price level in words \(inexpensive, mid-range, pricey or very expensive\)/);
  assert.match(prompt, /never read out dollar signs/);
});
