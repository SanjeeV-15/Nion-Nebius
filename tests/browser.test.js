// Checks which browsers get hands-free voice: Chrome-style ones do, Safari does not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceLikelyWorks } from "../public/js/browser.js";

const AGENTS = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
};

test("Chrome, Edge, Firefox and Chrome on iPhone are allowed to use voice", () => {
  for (const name of ["chromeMac", "chromeAndroid", "edge", "firefox", "chromeIphone"]) assert.equal(voiceLikelyWorks(AGENTS[name]), true, name);
});

test("Safari on a Mac or an iPhone gets typing instead", () => {
  for (const name of ["safariMac", "safariIphone"]) assert.equal(voiceLikelyWorks(AGENTS[name]), false, name);
});

test("a browser that does not say what it is is never blocked", () => {
  for (const ua of [undefined, null, ""]) assert.equal(voiceLikelyWorks(ua), true);
});
