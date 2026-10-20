// Checks the pre-flight secret scan and the files that keep secrets out of builds. Everything
// here uses made-up values, and the scan itself never prints a secret.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findLeaks, secretValues, setupProblems } from "../scripts/preflight.mjs";

// Test fixtures are built from parts, so no key-shaped text ever sits in this file's source
// (which would make the pre-flight scan flag its own tests).
const tvly = (rest) => "tvly" + "-" + rest;
const placeholder = "sk-ant-" + "not-a-real-key";
const pem = "-----BEGIN RSA " + "PRIVATE KEY-----";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("secret values are read from .env: long ones only, comments and blanks skipped", () => {
  const env = ["# a comment", "NEBIUS_API_KEY=abcdefghijkl1234", `TAVILY_API_KEY="${tvly("abcdefghij")}"`, "SHORT=abc", "EMPTY=", "", "NION_MODEL = some/long-model-name"].join("\n");
  assert.deepEqual(secretValues(env), ["abcdefghijkl1234", tvly("abcdefghij"), "some/long-model-name"]);
  assert.deepEqual(secretValues(undefined), []);
});

test("a value from .env found in a file is reported by file name, never by value", () => {
  const values = ["abcdefghijkl1234"];
  const result = findLeaks([{ path: "a.js", text: "const k = 'abcdefghijkl1234';" }, { path: "b.js", text: "nothing here" }], values);
  assert.deepEqual(result, { exact: ["a.js"], shaped: [] });
  assert.doesNotMatch(JSON.stringify(result), /abcdefghijkl1234/);
});

test("anything shaped like a real key is caught, but the known made-up placeholder is not", () => {
  const files = [
    { path: "real.js", text: `key = '${tvly("ABCDEFGHIJKLMNOP")}'` },
    { path: "pem.txt", text: pem },
    { path: "test.js", text: `ANTHROPIC_API_KEY: '${placeholder}'` },
    { path: "plain.js", text: "tvly- is just a prefix" },
  ];
  assert.deepEqual(findLeaks(files, []).shaped, ["real.js", "pem.txt"]);
});

test("setup problems: .env tracked or not ignored, and missing files for a public repo and a host", () => {
  const good = ["LICENSE", "Dockerfile", ".dockerignore", ".gcloudignore", "package-lock.json", "server/index.js"];
  assert.deepEqual(setupProblems({ tracked: good, ignored: [".env"] }), []);
  assert.match(setupProblems({ tracked: [...good, ".env"], ignored: [".env"] }).join(), /\.env is tracked/);
  assert.match(setupProblems({ tracked: good, ignored: [] }).join(), /\.env is not ignored/);
  assert.match(setupProblems({ tracked: good.filter((f) => f !== "LICENSE"), ignored: [".env"] }).join(), /LICENSE is missing/);
});

test("the real repository passes its own pre-flight setup checks", () => {
  const tracked = ["LICENSE", "Dockerfile", ".dockerignore", ".gcloudignore", "package-lock.json"];
  for (const file of tracked) assert.ok(read(file).length > 0, `${file} exists`);
});

test("builds on Google Cloud leave out secrets, notes and tests", () => {
  const ignored = read(".gcloudignore").split("\n").map((l) => l.trim());
  for (const entry of [".env", ".env.*", ".git", "node_modules", "tests", "docs"]) assert.ok(ignored.includes(entry), `${entry} is left out`);
});

test("the container's health check follows the port the host chooses", () => {
  assert.match(read("Dockerfile"), /HEALTHCHECK .*\$\{PORT:-3000\}\/api\/health/);
  assert.match(read("server/index.js"), /process\.env\.PORT/);
});

test("npm run preflight exists", () => {
  assert.equal(JSON.parse(read("package.json")).scripts.preflight, "node scripts/preflight.mjs");
});
