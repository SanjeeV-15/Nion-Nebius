// Checks which voice Nion prefers: the most natural-sounding one the computer offers.

import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis;
globalThis.speechSynthesis = { getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} };
const { bestVoice } = await import("../public/js/speech-out.js");

const v = (name, lang = "en-US") => ({ name, lang });
const pick = (...voices) => bestVoice(voices)?.name ?? null;

test("a Premium or Enhanced voice beats everything else", () => {
  assert.equal(pick(v("Samantha"), v("Google US English"), v("Zoe (Premium)")), "Zoe (Premium)");
  assert.equal(pick(v("Samantha"), v("Evan (Enhanced)")), "Evan (Enhanced)");
  assert.equal(pick(v("Evan (Enhanced)"), v("Zoe (Premium)")), "Zoe (Premium)", "Premium comes before Enhanced");
});

test("online and neural voices (such as Edge's) come next, then Google's, then the basic built-in ones", () => {
  assert.equal(pick(v("Google US English"), v("Microsoft Aria Online (Natural) - English (United States)")), "Microsoft Aria Online (Natural) - English (United States)");
  assert.equal(pick(v("Samantha"), v("Some Neural Voice")), "Some Neural Voice");
  assert.equal(pick(v("Samantha"), v("Google US English")), "Google US English");
  assert.equal(pick(v("Fred"), v("Samantha")), "Samantha");
});

test("with none of the known names, any US English voice, then any English one; other languages never", () => {
  assert.equal(pick(v("Fred", "en-GB"), v("Bob", "en-US")), "Bob");
  assert.equal(pick(v("Fred", "en-GB")), "Fred");
  assert.equal(pick(v("Amelie", "fr-FR"), v("Ava (Premium)", "fr-FR")), null, "a French voice is never used, however good");
  assert.equal(pick(), null);
});
