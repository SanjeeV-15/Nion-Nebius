// Checks the keep-awake helper, and that the home-screen setup (manifest and icons) is
// complete: every file the manifest points to must exist and really be that size.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createWakeLock } from "../public/js/wakelock.js";

const publicFile = (path) => new URL(`../public${path}`, import.meta.url);

// A pretend browser that records what happens to the wake lock.
function pretend({ supported = true, visibility = "visible", refuse = false } = {}) {
  const log = [];
  const handlers = {};
  const doc = { visibilityState: visibility, addEventListener: (type, fn) => (handlers[type] = fn) };
  const nav = supported
    ? {
        wakeLock: {
          async request(kind) {
            log.push(`request ${kind}`);
            if (refuse) throw new Error("not allowed");
            const lock = { listeners: {}, addEventListener: (t, fn) => (lock.listeners[t] = fn), release: async () => log.push("release") };
            nav.last = lock;
            return lock;
          },
        },
      }
    : {};
  return { nav, doc, log, handlers };
}

test("turning Nion on keeps the screen awake, and turning it off lets go", async () => {
  const { nav, doc, log } = pretend();
  const lock = createWakeLock({ nav, doc });
  assert.equal(lock.supported, true);
  await lock.enable();
  assert.equal(lock.active, true);
  assert.deepEqual(log, ["request screen"]);
  await lock.disable();
  assert.equal(lock.active, false);
  assert.deepEqual(log, ["request screen", "release"]);
});

test("asking twice does not hold two locks", async () => {
  const { nav, doc, log } = pretend();
  const lock = createWakeLock({ nav, doc });
  await lock.enable();
  await lock.enable();
  assert.equal(log.filter((l) => l.startsWith("request")).length, 1);
});

test("when the browser takes the lock back and the page returns, it asks again", async () => {
  const { nav, doc, log, handlers } = pretend();
  const lock = createWakeLock({ nav, doc });
  await lock.enable();
  nav.last.listeners.release(); // the browser released it (the person switched apps)
  assert.equal(lock.active, false);

  doc.visibilityState = "hidden";
  handlers.visibilitychange();
  assert.equal(log.filter((l) => l.startsWith("request")).length, 1, "not while the page is hidden");
  doc.visibilityState = "visible";
  handlers.visibilitychange();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(lock.active, true);
  assert.equal(log.filter((l) => l.startsWith("request")).length, 2);
});

test("after turning it off, coming back to the page does not take the lock again", async () => {
  const { nav, doc, log, handlers } = pretend();
  const lock = createWakeLock({ nav, doc });
  await lock.enable();
  await lock.disable();
  doc.visibilityState = "visible";
  handlers.visibilitychange();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(log.filter((l) => l.startsWith("request")).length, 1);
});

test("an unsupported or refusing browser is never an error", async () => {
  const none = createWakeLock(pretend({ supported: false }));
  assert.equal(none.supported, false);
  await none.enable();
  assert.equal(none.active, false);
  await none.disable();

  const refusing = createWakeLock(pretend({ refuse: true }));
  await refusing.enable();
  assert.equal(refusing.active, false);
  assert.doesNotThrow(() => createWakeLock({}), "even with no browser at all");
});

// ---- the home-screen setup ----

const manifest = JSON.parse(readFileSync(publicFile("/manifest.webmanifest"), "utf8"));

test("the manifest has what a phone needs to install Nion like an app", () => {
  assert.equal(manifest.name, "Nion");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512"));
});

test("every icon the manifest lists exists and really is that size", () => {
  for (const icon of manifest.icons) {
    assert.ok(existsSync(publicFile(icon.src)), `${icon.src} exists`);
    const bytes = readFileSync(publicFile(icon.src));
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${icon.src} is a PNG`);
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.equal(bytes.readUInt32BE(16), w, `${icon.src} width`);
    assert.equal(bytes.readUInt32BE(20), h, `${icon.src} height`);
  }
});

test("the main page links the manifest and icons, and the files they name exist", () => {
  const html = readFileSync(publicFile("/index.html"), "utf8");
  for (const href of ["/manifest.webmanifest", "/icons/icon.svg", "/icons/apple-touch-icon.png"]) {
    assert.ok(html.includes(`href="${href}"`), `links ${href}`);
    assert.ok(existsSync(publicFile(href)), `${href} exists`);
  }
});
