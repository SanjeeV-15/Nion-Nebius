// Measures how Nion's brain really performs on Nebius Token Factory, so claims about
// speed and reliability rest on numbers. It runs a fixed set of questions against each
// model several times and prints a table (and can save it to docs/benchmark.md).
//
//   node scripts/benchmark.mjs            a free dry run with a pretend service (checks the script)
//   node --env-file=.env scripts/benchmark.mjs --live [--runs 2] [--models ultra,nano] [--write]
//
// --live CALLS THE REAL SERVICE AND COSTS MONEY (roughly 5 to 10 cents per model per
// run at the prices I could find, plus a few free Tavily searches). Decide before you run it.
//
// Each run is a short conversation: the notebook carries over from one question to the
// next, so recall questions ("how much did I spend?") test real memory. Models are
// called with no fallback, so each one is measured on its own.

import { writeFileSync } from "node:fs";
import { askNion } from "../server/brain.js";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { createWebSearchTool } from "../server/tools/web-search.js";
import { createDataTools } from "../server/tools/data-tools.js";
import { applyOps, cleanData, emptyData, localToday } from "../shared/store.js";

const MODELS = {
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  super: "nvidia/nemotron-3-super-120b-a12b",
};
const WORD_LIMIT = 75; // Nion aims for about 60; this is the line past which a reply counts as too long

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const live = flag("live");
const runs = Math.max(1, Number(option("runs", 2)) || 2);
const modelKeys = option("models", "ultra,nano").split(",").map((k) => k.trim()).filter((k) => MODELS[k]);

const words = (text) => (text.match(/\S+/g) || []).length;
const median = (nums) => [...nums].sort((a, b) => a - b)[Math.floor((nums.length - 1) / 2)];
const has = (ops, op, test = () => true) => ops.some((o) => o.op === op && test(o));

// Each scenario: what to ask, and what must be true of the answer. `fails` returns a
// reason, or "" when the answer is fine. Every answer must also be non-empty and not too long.
const month = new Date().toLocaleString("en-US", { month: "long" });
const SCENARIOS = [
  { name: "date (no search)", ask: "What's today's date?", fails: (r) => (r.searches > 0 ? "searched for the date" : new RegExp(month, "i").test(r.reply) ? "" : "wrong month") },
  { name: "plain question", ask: "Why is the sky blue?", fails: (r) => (r.searches > 0 ? "searched needlessly" : "") },
  { name: "places (search)", ask: "What are some places to eat around me?", fails: (r) => (r.searches === 1 ? "" : `searched ${r.searches} times`) },
  { name: "news (search)", ask: "What's the latest world news?", fails: (r) => (r.searches === 1 ? "" : `searched ${r.searches} times`) },
  { name: "save expense", ask: "I just spent 12 dollars on lunch.", fails: (r) => (has(r.ops, "add_expense", (o) => o.item.amount === 12) ? "" : "expense not saved") },
  { name: "add to visit list", ask: "Add the old town to my to-visit list.", fails: (r) => (has(r.ops, "add_item", (o) => o.list === "visit") ? "" : "not added to the visit list") },
  { name: "recall spending", ask: "How much have I spent today?", fails: (r) => (/\b12\b|twelve/i.test(r.reply) ? "" : "did not say 12") },
  { name: "recall list", ask: "What's on my to-visit list?", fails: (r) => (/old town/i.test(r.reply) ? "" : "did not mention the old town") },
  { name: "set reminder", ask: "Remind me in 20 minutes to call the bank.", fails: (r) => (has(r.ops, "add_reminder", (o) => /bank/i.test(o.item.text)) ? (/open|still/i.test(r.reply) ? "" : "did not say it only works while Nion is open") : "reminder not set") },
  { name: "save draft", ask: "Draft an email to Maria saying I'll be ten minutes late.", fails: (r) => (has(r.ops, "save_draft") ? (/can't send|cannot send|not send|isn't sent|saved/i.test(r.reply) ? "" : "did not say it is only saved") : "draft not saved") },
];

// A pretend Token Factory for the dry run: answers instantly with something plausible.
function dryFetch() {
  let n = 0;
  return async (url, options) => {
    const body = JSON.parse(options.body);
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const last = body.messages.at(-1);
    let message = { content: `Dry run reply ${++n}. It's ${month} twelve, twelve dollars, the old town.` };
    if (last.role === "user" && /spent 12/.test(lastUser)) message = { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "add_expense", arguments: '{"amount":12,"currency":"USD","category":"food"}' } }] };
    if (last.role === "user" && /old town to my/.test(lastUser)) message = { content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "add_to_list", arguments: '{"list":"visit","item":"the old town"}' } }] };
    if (last.role === "user" && /Remind me in 20/.test(lastUser)) message = { content: null, tool_calls: [{ id: "c4", type: "function", function: { name: "set_reminder", arguments: '{"text":"call the bank","minutes_from_now":20}' } }] };
    if (last.role === "user" && /Draft an email/.test(lastUser)) message = { content: null, tool_calls: [{ id: "c3", type: "function", function: { name: "save_draft", arguments: '{"to":"Maria","subject":"Late","body":"Hi Maria, I will be late."}' } }] };
    if (last.role === "tool") message = { content: "Saved. I can't send it, and I'm still open." };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 1000, completion_tokens: 50 } }), text: async () => "" };
  };
}

function tools() {
  const searchKey = live ? process.env.TAVILY_API_KEY : "dry-run";
  const search = searchKey
    ? [createWebSearchTool({ apiKey: searchKey, fetchImpl: live ? fetch : async () => ({ ok: true, json: async () => ({ results: [{ title: "T", url: "https://example.com/x", content: "c" }] }) }) })]
    : [];
  return [...search, ...createDataTools()];
}

async function runOnce(modelId) {
  const provider = createNebiusProvider({ apiKey: live ? process.env.NEBIUS_API_KEY : "dry", model: modelId, fallbackModel: "none", tools: tools(), ...(live ? {} : { fetchImpl: dryFetch() }) });
  const now = new Date();
  const base = {
    nowISO: now.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, today: localToday(now),
    localDateTime: now.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }),
    userName: "Sanjeev", place: "Miami, Florida",
  };
  let notebook = emptyData();
  const messages = [];
  const rows = [];
  for (const [i, scenario] of SCENARIOS.entries()) {
    messages.push({ role: "user", content: scenario.ask });
    const started = performance.now();
    let row = { scenario: scenario.name };
    try {
      const r = await askNion({ messages: messages.slice(-20), context: { ...base, isNewConversation: i === 0 }, provider, data: cleanData(notebook) });
      notebook = applyOps(notebook, r.ops);
      messages.push({ role: "assistant", content: r.reply });
      const w = words(r.reply);
      const problem = !r.reply || /didn't catch that/.test(r.reply) ? "empty reply" : w > WORD_LIMIT ? `too long (${w} words)` : scenario.fails(r);
      row = { ...row, seconds: (performance.now() - started) / 1000, words: w, searches: r.searches, tokensIn: r.usage.inputTokens, tokensOut: r.usage.outputTokens, ok: !problem, problem };
    } catch (error) {
      messages.pop();
      row = { ...row, seconds: (performance.now() - started) / 1000, words: 0, searches: 0, ok: false, problem: `error ${error.status ?? error.name ?? ""}` };
    }
    rows.push(row);
  }
  return rows;
}

if (live && (!process.env.NEBIUS_API_KEY)) {
  console.error("NEBIUS_API_KEY is missing: run with  node --env-file=.env scripts/benchmark.mjs --live");
  process.exit(1);
}

console.log(live ? `LIVE run: ${modelKeys.join(", ")} x ${runs} run(s). This costs money.` : "Dry run with a pretend service (free). Add --live to measure for real.");

const lines = [`# Benchmark`, ``, `${live ? "Measured live" : "DRY RUN with a pretend service: these numbers mean nothing"} on ${new Date().toISOString().slice(0, 10)}; ${runs} run(s) per model, no fallback, one search allowed per question.`, ``];
for (const key of modelKeys) {
  const all = [];
  for (let run = 0; run < runs; run++) all.push(...(await runOnce(MODELS[key])));
  lines.push(`## ${MODELS[key]}`, ``, `| Question | Median s | Slowest s | Words (median) | Passed |`, `|---|---|---|---|---|`);
  for (const scenario of SCENARIOS) {
    const rows = all.filter((r) => r.scenario === scenario.name);
    const passed = rows.filter((r) => r.ok).length;
    const problems = [...new Set(rows.filter((r) => !r.ok).map((r) => r.problem))].join("; ");
    lines.push(`| ${scenario.name} | ${median(rows.map((r) => r.seconds)).toFixed(1)} | ${Math.max(...rows.map((r) => r.seconds)).toFixed(1)} | ${median(rows.map((r) => r.words))} | ${passed}/${rows.length}${problems ? ` (${problems})` : ""} |`);
  }
  const times = all.map((r) => r.seconds);
  const sum = (field) => all.reduce((total, r) => total + (r[field] ?? 0), 0);
  lines.push(``, `Overall: ${all.filter((r) => r.ok).length}/${all.length} passed; median ${median(times).toFixed(1)} s, slowest ${Math.max(...times).toFixed(1)} s. Tokens used: ${sum("tokensIn")} in, ${sum("tokensOut")} out; Tavily searches: ${sum("searches")}.`, ``);
}
console.log("\n" + lines.join("\n"));
if (flag("write") && !live) console.log("Not saved: --write only saves a --live run, so pretend numbers never replace real ones.");
if (flag("write") && live) {
  writeFileSync(new URL("../docs/benchmark.md", import.meta.url), lines.join("\n") + "\n");
  console.log("Saved to docs/benchmark.md");
}
