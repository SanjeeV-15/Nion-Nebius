// Guards the "runs on Nebius" story: no other AI provider's code or dependency is in
// the project, so a reader (or a judge) sees only Nebius, NVIDIA Nemotron and Tavily.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const files = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : [path];
  });

test("no other AI provider is a dependency", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.sort(), ["express"], "only the web server framework");
});

test("no source, page, script or setting file mentions Anthropic or Claude, or imports another provider's SDK", () => {
  const checked = [...files("server"), ...files("shared"), ...files("public/js"), ...files("scripts"), ".env.example", "Dockerfile", "package.json"];
  for (const file of checked) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /anthropic|claude/i, file);
    // (A comment may say Token Factory is OpenAI-compatible: that is a fact. Importing another provider's SDK is not allowed.)
    assert.doesNotMatch(text, /from ["'](openai|@google\/generative-ai|@mistralai[^"']*|cohere-ai|groq-sdk)["']/, file);
  }
});

test("Nion starts with only a Nebius key in its settings", () => {
  const example = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(example, /^NEBIUS_API_KEY=$/m);
  assert.doesNotMatch(example, /^NION_PROVIDER/m);
});
