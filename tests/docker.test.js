// Guards the container recipe against the two mistakes that would hurt: leaving out
// the shared folder (the server imports it) and baking secret keys into the image.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the Dockerfile copies everything the server needs, and starts it without a .env file", () => {
  const file = read("Dockerfile");
  for (const folder of ["server", "shared", "public"]) assert.match(file, new RegExp(`^COPY ${folder} \\./${folder}$`, "m"));
  assert.match(file, /npm ci --omit=dev/);
  assert.match(file, /^CMD \["node", "server\/index\.js"\]$/m);
  assert.doesNotMatch(file, /--env-file|COPY \.env/);
  assert.match(file, /^USER node$/m, "does not run as root");
});

test("the container leaves out .env and other private or unneeded files", () => {
  const ignored = read(".dockerignore").split("\n").map((line) => line.trim());
  for (const entry of [".env", ".git", "node_modules"]) assert.ok(ignored.includes(entry), `${entry} is ignored`);
});

test("every folder the server imports from is in the image", () => {
  const imports = ["server/index.js", "server/brain.js", "server/prompt.js", "server/tools/data-tools.js"]
    .flatMap((file) => [...read(file).matchAll(/from "(\.\.?\/[^"]+)"/g)].map((m) => [file, m[1]]));
  const copied = new Set(["server", "shared", "public"]);
  for (const [file, target] of imports) {
    const top = new URL(target, new URL(`../${file}`, import.meta.url)).pathname.split("/nion-nebius/")[1].split("/")[0];
    assert.ok(copied.has(top), `${file} imports ${target}, which is in "${top}"`);
  }
});
