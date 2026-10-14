// Checks the tool loop, the web search tool and the prompt's honesty about search,
// all with pretend services. Nothing here makes a real request or needs a key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { createWebSearchTool } from "../server/tools/web-search.js";
import { buildSystemPrompt } from "../server/prompt.js";
import { createProvider } from "../server/brain.js";

const messages = [{ role: "user", content: "hi" }];

// A pretend Token Factory that returns the given replies one after another, and
// remembers every request it was sent.
function scriptedFetch(replies) {
  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push(JSON.parse(options.body));
    const body = replies[Math.min(sent.length - 1, replies.length - 1)];
    return { ok: true, status: 200, json: async () => body, text: async () => "" };
  };
  return { fetchImpl, sent };
}

const say = (content, usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({ choices: [{ message: { content } }], usage });
const callTool = (name, args, id = "call_1") => ({
  choices: [{ message: { content: null, tool_calls: [{ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

const fakeSearch = (run) => ({ name: "web_search", description: "d", parameters: { type: "object", properties: {} }, run });

// ---- the tool loop ----

test("the tool loop runs the tool the AI asks for and sends the result back", async () => {
  const { fetchImpl, sent } = scriptedFetch([callTool("web_search", { query: "pizza Miami" }), say("Try Joe's.")]);
  const seen = [];
  const tool = fakeSearch(async (args) => (seen.push(args), { text: "1. Site: joes.com", sources: [{ title: "Joe's", url: "https://joes.com" }], searches: 1 }));
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: [tool] }).ask({ system: "S", messages });

  assert.deepEqual(seen, [{ query: "pizza Miami" }]);
  assert.equal(result.text, "Try Joe's.");
  assert.equal(result.searches, 1);
  assert.deepEqual(result.sources, [{ title: "Joe's", url: "https://joes.com" }]);
  assert.equal(result.inputTokens, 20, "tokens from both requests are added up");

  // The second request carries the AI's tool call and our tool result.
  const second = sent[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.equal(second.at(-1).role, "tool");
  assert.equal(second.at(-1).tool_call_id, "call_1");
  assert.match(second.at(-1).content, /joes\.com/);
  assert.ok(sent[0].tools?.length === 1, "tools are offered");
});

test("when no tools exist the request carries none, and the provider says it can't search", async () => {
  const { fetchImpl, sent } = scriptedFetch([say("Hello.")]);
  const provider = createNebiusProvider({ apiKey: "k", model: "m", fetchImpl });
  await provider.ask({ system: "S", messages });
  assert.equal("tools" in sent[0], false);
  assert.deepEqual(provider.abilities, { search: false, data: false });
  assert.deepEqual(createNebiusProvider({ apiKey: "k", model: "m", tools: [fakeSearch(async () => "")] }).abilities, { search: true, data: false });
});

test("the loop cannot run forever: the last request is sent without tools", async () => {
  const { fetchImpl, sent } = scriptedFetch([callTool("web_search", { query: "a" }), callTool("web_search", { query: "b" }), callTool("web_search", { query: "c" }), say("Done.")]);
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: [fakeSearch(async () => "ok")] }).ask({ system: "S", messages });
  assert.equal(sent.length, 4);
  assert.equal("tools" in sent[3], false, "no tools on the final round");
  assert.equal(result.text, "Done.");
});

test("a tool that breaks does not break the question", async () => {
  const { fetchImpl, sent } = scriptedFetch([callTool("web_search", { query: "x" }), say("I'm having trouble reaching my sources.")]);
  const broken = fakeSearch(async () => {
    throw Object.assign(new Error("boom"), { status: 429 });
  });
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: [broken] }).ask({ system: "S", messages });
  assert.match(result.text, /trouble reaching/);
  assert.deepEqual(result.searchErrors, [429]);
  assert.match(sent[1].messages.at(-1).content, /tool failed/i);
});

test("an unknown tool or unreadable tool input is reported back to the AI, not crashed on", async () => {
  const unknown = scriptedFetch([callTool("delete_everything", {}), say("Sorry.")]);
  await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl: unknown.fetchImpl, tools: [fakeSearch(async () => "")] }).ask({ system: "S", messages });
  assert.match(unknown.sent[1].messages.at(-1).content, /no tool called delete_everything/);

  const garbled = scriptedFetch([callTool("web_search", "{not json"), say("Sorry.")]);
  let ran = false;
  await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl: garbled.fetchImpl, tools: [fakeSearch(async () => (ran = true))] }).ask({ system: "S", messages });
  assert.equal(ran, false);
  assert.match(garbled.sent[1].messages.at(-1).content, /not valid/);
});

test("a thinking block that was cut off before it closed is never spoken either", async () => {
  for (const content of ["<think>let me work out the answer step by step and then", "Sure. <think>half a thought", "<think>done</think>The answer.<think>and more"]) {
    const { fetchImpl } = scriptedFetch([say(content), say("Retried answer.")]);
    const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl }).ask({ system: "S", messages });
    assert.doesNotMatch(result.text, /think|step by step|half a thought|and more/, content);
  }
});

test("a search request written out as text is never spoken", async () => {
  const { fetchImpl } = scriptedFetch([say('Hey Sanjeev, I\'ll look that up. {"query": "restaurants Brickell Miami", "recency_days": 30}')]);
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl }).ask({ system: "S", messages });
  assert.equal(result.text, "Hey Sanjeev, I'll look that up.");
});

// ---- the web search tool ----

test("the web search tool asks Tavily and hands back short results with site names", async () => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { title: "Top stories", url: "https://www.reuters.com/world/x", content: "A".repeat(1000) },
          { title: "Local news", url: "https://bbc.co.uk/news/y", content: "short" },
        ],
      }),
    };
  };
  const tool = createWebSearchTool({ apiKey: "tvly-test", fetchImpl });
  const result = await tool.run({ query: "world news", topic: "news" });

  assert.equal(sent[0].url, "https://api.tavily.com/search");
  assert.equal(sent[0].options.headers.Authorization, "Bearer tvly-test");
  const body = JSON.parse(sent[0].options.body);
  assert.equal(body.query, "world news");
  assert.equal(body.topic, "news");
  assert.equal(body.search_depth, "fast");
  assert.match(result.text, /Site: reuters\.com/, "www. is dropped");
  assert.ok(result.text.length < 800, "long snippets are cut");
  assert.equal(result.searches, 1);
  assert.equal(result.sources.length, 2);
});

test("the web search tool handles an empty query, no results and a bad topic", async () => {
  const none = createWebSearchTool({ apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }) });
  assert.equal((await none.run({ query: "  " })).searches, 0);
  assert.match((await none.run({ query: "zzz", topic: "nonsense" })).text, /found nothing/);

  const fails = createWebSearchTool({ apiKey: "k", fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(fails.run({ query: "x" }), (error) => error.status === 401);
});

// ---- the prompt and the provider choice ----

test("Nion only claims web search when it can search", () => {
  assert.match(buildSystemPrompt({}, { search: true }), /You can search the web/);
  const without = buildSystemPrompt({}, { search: false });
  assert.doesNotMatch(without, /You can search the web/);
  assert.match(without, /can't look things up on the web/);
  assert.match(without, /Never invent places/);
  assert.match(buildSystemPrompt({}), /You can search the web/, "default is the old behaviour");
});

test("Nion's instructions keep a rambling reply under the word limit too", () => {
  assert.match(buildSystemPrompt({}), /including that sentence, still stays under about 60 words/);
});

test("the Tavily key in settings turns web search on for the Nebius provider", () => {
  const base = { NEBIUS_API_KEY: "k", NION_MODEL: "m" };
  assert.deepEqual(createProvider({ ...base }).abilities, { search: false, data: true }, "notebook tools are always on");
  assert.deepEqual(createProvider({ ...base, TAVILY_API_KEY: "tvly-x" }).abilities, { search: true, data: true });
});

// ---- the one-search limit (keeps replies quick) ----

const twoCalls = {
  choices: [{ message: { content: null, tool_calls: [
    { id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"a"}' } },
    { id: "c2", type: "function", function: { name: "web_search", arguments: '{"query":"b"}' } },
  ] } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

test("a tool limited to one use per question runs once, even if the AI asks twice at the same time", async () => {
  const { fetchImpl, sent } = scriptedFetch([twoCalls, say("Here you go.")]);
  const ran = [];
  const tool = { ...fakeSearch(async (args) => (ran.push(args.query), "result")), maxCalls: 1 };
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: [tool] }).ask({ system: "S", messages });

  assert.deepEqual(ran, ["a"], "only the first search ran");
  const replies = sent[1].messages.filter((m) => m.role === "tool");
  assert.equal(replies.length, 2, "both calls still get an answer back");
  assert.match(replies[1].content, /already used that tool/);
  assert.equal("tools" in sent[1], false, "once used up, the tool is no longer offered");
  assert.equal(result.text, "Here you go.");
});

test("a search that found nothing does not use up the allowance", async () => {
  const { fetchImpl, sent } = scriptedFetch([callTool("web_search", { query: "a" }, "c1"), callTool("web_search", { query: "b" }, "c2"), say("Found it.")]);
  let n = 0;
  const tool = { ...fakeSearch(async () => (++n === 1 ? { text: "nothing", retryable: true, searches: 1 } : { text: "got it", searches: 1 })), maxCalls: 1 };
  const result = await createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: [tool] }).ask({ system: "S", messages });

  assert.equal(n, 2, "the second search was allowed");
  assert.ok(sent[1].tools, "still offered after an empty search");
  assert.equal("tools" in sent[2], false, "not offered after the real one");
  assert.equal(result.searches, 2);
});

test("the real web search tool allows one search per question and says an empty search can be retried", async () => {
  const empty = createWebSearchTool({ apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }) });
  assert.equal(empty.maxCalls, 1);
  assert.equal((await empty.run({ query: "zzz" })).retryable, true);
});

test("Nion is told to search once, name the site, and keep a messy question's reply short", () => {
  const prompt = buildSystemPrompt({});
  assert.match(prompt, /Search once/);
  assert.match(prompt, /name the site once for places/);
  assert.match(prompt, /cut detail from the answer/);
});

// ---- an empty reply after a search ----

test("if the AI sends no words after a search, it is asked again instead of leaving silence", async () => {
  const silent = { choices: [{ message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "web_search", arguments: "{}" } }] }, finish_reason: "tool_calls" }], usage: {} };
  const { fetchImpl, sent } = scriptedFetch([callTool("web_search", { query: "a" }), silent, say("Try La Carreta.")]);
  const tool = { ...fakeSearch(async () => "result"), maxCalls: 1 };
  // (With no stronger model to escalate to, the model is nudged instead.)
  const warn = console.warn;
  const warnings = [];
  console.warn = (line) => warnings.push(line);
  let result;
  try {
    result = await createNebiusProvider({ apiKey: "k", model: "m", fallbackModel: "none", fetchImpl, tools: [tool] }).ask({ system: "S", messages });
  } finally {
    console.warn = warn;
  }
  assert.equal(result.text, "Try La Carreta.");
  assert.equal(sent.length, 3);
  assert.equal(sent[2].messages.at(-1).role, "user");
  assert.match(sent[2].messages.at(-1).content, /answer me now/i);
  assert.match(warnings[0], /no spoken text/);
});

test("search results end with a note that this was the only search, so the AI answers instead of going silent", async () => {
  const tool = createWebSearchTool({ apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ results: [{ title: "T", url: "https://a.com/x", content: "c" }] }) }) });
  const { text } = await tool.run({ query: "x" });
  assert.match(text, /This was your one search/);
  assert.match(text, /Don't ask to search again/);
});

test("Nion is told to answer from one search even when the results are thin", () => {
  const prompt = buildSystemPrompt({});
  assert.match(prompt, /even if the results are thin or messy/);
  assert.doesNotMatch(prompt, /Only search again if that search found nothing useful/);
});

test("news searches ask for the last day, and widen to a week when a quiet day finds nothing", async () => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    const results = body.time_range === "week" ? [{ title: "T", url: "https://a.com/x", content: "c" }] : [];
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  const tool = createWebSearchTool({ apiKey: "k", fetchImpl });

  const news = await tool.run({ query: "world news", topic: "news" });
  assert.deepEqual(sent.map((b) => b.time_range), ["day", "week"]);
  assert.equal(news.sources.length, 1);

  sent.length = 0;
  await tool.run({ query: "pizza", topic: "general" });
  assert.equal(sent.length, 1);
  assert.equal("time_range" in sent[0], false, "ordinary searches have no time limit");
});
