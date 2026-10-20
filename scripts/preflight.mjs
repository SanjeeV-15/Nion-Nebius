// A last check before anything leaves your laptop (a push to GitHub, an upload to a host).
//   npm run preflight
// It looks for your secret keys inside every file git tracks or would commit (new files that
// are not ignored too), and for anything shaped like a key, and says PASS or FAIL. It NEVER prints a secret: only file names and counts.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// Things that look like a real key (a made-up test placeholder is allowed).
const KEY_SHAPES = [/tvly-[A-Za-z0-9]{10,}/g, /sk-ant-[A-Za-z0-9_-]{10,}/g, /AKIA[0-9A-Z]{12,}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g];
const PLACEHOLDERS = new Set(["sk-ant-not-a-real-key"]);

/** The secret-looking values in a .env file: every value of 12 or more characters. */
export function secretValues(envText) {
  return String(envText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""))
    .filter((value) => value.length >= 12);
}

/**
 * Looks through { path, text } files. Returns { exact: [paths holding a value from .env],
 * shaped: [paths holding something shaped like a key] }. Never returns a secret itself.
 */
export function findLeaks(files, values) {
  const exact = [];
  const shaped = [];
  for (const { path, text } of files) {
    if (values.some((value) => text.includes(value))) exact.push(path);
    const looksLikeKey = KEY_SHAPES.some((shape) => (text.match(shape) ?? []).some((hit) => !PLACEHOLDERS.has(hit)));
    if (looksLikeKey) shaped.push(path);
  }
  return { exact, shaped };
}

/** Problems with how the project is set up for a public repository and a host. */
export function setupProblems({ tracked, ignored }) {
  const problems = [];
  if (tracked.includes(".env")) problems.push(".env is tracked by git (it must never be)");
  if (!ignored.includes(".env")) problems.push(".env is not ignored by git");
  for (const file of ["LICENSE", "Dockerfile", ".dockerignore", ".gcloudignore", "package-lock.json"]) {
    if (!tracked.includes(file)) problems.push(`${file} is missing from the repository`);
  }
  return problems;
}

function main() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Committed files, plus new files that are not ignored (so it works before a commit too).
  const tracked = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter(Boolean);
  const files = tracked.filter((p) => existsSync(p)).flatMap((path) => {
    try {
      return [{ path, text: readFileSync(path, "utf8") }];
    } catch {
      return [];
    }
  });
  const values = existsSync(".env") ? secretValues(readFileSync(".env", "utf8")) : [];
  const ignored = existsSync(".env") ? git("check-ignore", ".env").split("\n").filter(Boolean) : [".env"];

  const { exact, shaped } = findLeaks(files, values);
  const problems = setupProblems({ tracked, ignored });
  if (exact.length) problems.push(`a secret from .env appears in: ${exact.join(", ")}`);
  if (shaped.length) problems.push(`something shaped like a key appears in: ${shaped.join(", ")}`);

  console.log(`Checked ${files.length} files git tracks or would commit, against ${values.length} secret value(s) from .env.`);
  if (problems.length === 0) {
    console.log("PASS: no secrets found, and the project is set up for a public repository and a host.");
    return;
  }
  console.log("FAIL:\n- " + problems.join("\n- "));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
