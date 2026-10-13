// The Nebius "provider": asks a model on Nebius Token Factory (for example an
// NVIDIA Nemotron model). Same job as providers/claude.js, different AI.
//
// Token Factory speaks the same "chat completions" language as OpenAI, so this uses
// plain fetch and needs no extra package. Docs: https://docs.tokenfactory.nebius.com
//
// Settings (in .env):
//   NEBIUS_API_KEY   your Token Factory key
//   NION_MODEL       the exact model name from Token Factory's model list
//
// Tools: when the AI wants to do something (search the web, later: save an expense),
// it answers with a "tool call" instead of words. We run the tool, send the result
// back, and ask again, until it answers in words. That is the "tool loop" below.

import { applyOps, emptyData } from "../../shared/store.js";

const DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

// A ceiling, not a target: Nion's answers are short, but some models "think" first.
const MAX_TOKENS = 1024;

// The tool loop can run at most this many AI requests per question. The last one is
// sent with no tools, so the AI has to answer in words.
const MAX_ROUNDS = 4;

// Everything for one question must finish within this. (The page gives up at 25 seconds.)
const TOTAL_BUDGET_MS = 22_000;

// The main model is given this long per request. Past it (or if it is overloaded), the
// same request is retried on a smaller, faster model, because in testing the big model
// sometimes took 11 to 20 seconds, and a long silence feels broken in a voice chat.
const PRIMARY_TIMEOUT_MS = 8_000;
const DEFAULT_FALLBACK_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

// Slow or overloaded is worth a second try on another model. A rejected key or a bad
// request (401, 400...) would fail the same way on any model, so those are not retried.
function worthRetrying(error) {
  const status = error?.status;
  return error?.name === "TimeoutError" || error?.name === "AbortError" || status === 429 || status >= 500 || status === undefined;
}

// Some models write their thinking inside <think>...</think> before the answer.
// Nion reads everything aloud, so the thinking must never reach the speech voice.
function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim();
}

// A model with no search tool sometimes writes a search request as text, like
// {"query": "restaurants"}. The speech voice must never read that out.
function stripJson(text) {
  return text.replace(/\{[^{}]*"[^{}]*"\s*:[^{}]*\}/g, "");
}

function cleanSpoken(text) {
  return stripJson(stripThinking(String(text ?? ""))).replace(/\s+/g, " ").trim();
}

/** Everything can be swapped in tests, so no real request or key is needed there. */
export function createNebiusProvider({
  apiKey = process.env.NEBIUS_API_KEY,
  baseUrl = process.env.NEBIUS_BASE_URL || DEFAULT_BASE_URL,
  model: defaultModel = process.env.NION_MODEL,
  fetchImpl = fetch,
  tools = [],
  // Set NION_FALLBACK_MODEL=none to turn the fallback off.
  fallbackModel = process.env.NION_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
  primaryTimeoutMs = PRIMARY_TIMEOUT_MS,
} = {}) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const toolDefinitions = tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));

  async function send(body, timeoutMs) {
    const response = await fetchImpl(new URL("chat/completions", base), {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (!response.ok) {
      const error = new Error(`Nebius request failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
      error.status = response.status; // lets failure.js tell a bad key from "too busy"
      throw error;
    }
    return response.json();
  }

  // One request. The main model gets a short time limit; if it is too slow or
  // overloaded, the same request goes to the fallback model, and that model is then
  // used for the rest of this question so the conversation stays consistent.
  async function request(body, deadline, state) {
    const remaining = () => deadline - Date.now();
    const canFallBack = state.model === state.primary && state.fallback && state.fallback !== state.primary;
    try {
      return await send({ ...body, model: state.model }, canFallBack ? Math.min(primaryTimeoutMs, remaining()) : remaining());
    } catch (error) {
      if (!canFallBack || !worthRetrying(error)) throw error;
      console.warn(`Nebius: ${state.primary} was slow or unavailable (${error?.name === "TimeoutError" ? "timeout" : error?.status ?? error?.name}); using ${state.fallback}.`);
      state.model = state.fallback;
      state.fellBack = true;
      return send({ ...body, model: state.model }, remaining());
    }
  }

  // A tool can limit how often it may be used per question (`maxCalls`), because every
  // extra search adds seconds. Once used up, it is no longer offered to the AI.
  const withinLimit = (tool, used) => (used[tool.name] ?? 0) < (tool.maxCalls ?? Infinity);
  const offered = (used) => toolDefinitions.filter((_, i) => withinLimit(tools[i], used));

  // Runs one tool the AI asked for. A tool that breaks must not break Nion: the AI is
  // told it failed, so it can say so instead of the whole question failing.
  async function runTool(call, ctx, totals, used) {
    const tool = tools.find((t) => t.name === call.function?.name);
    if (!tool) return `There is no tool called ${call.function?.name}.`;
    // The AI can ask for the same tool twice in one go; only the first is run.
    if (!withinLimit(tool, used)) return "You've already used that tool for this question. Answer now with what you have.";
    let args;
    try {
      args = JSON.parse(call.function.arguments || "{}");
    } catch {
      return "The tool input was not valid.";
    }
    try {
      const result = await tool.run(args, ctx);
      const { text, sources = [], searches = 0, retryable = false, ops = [] } = typeof result === "string" ? { text: result } : result;
      // Notebook changes: keep them for the browser, and apply them to our working copy so
      // a second tool in the same turn sees the first one's result.
      if (ops.length > 0) {
        ctx.data = applyOps(ctx.data, ops);
        totals.ops.push(...ops);
      }
      totals.searches += searches;
      totals.sources.push(...sources);
      // A search that found nothing doesn't use up the allowance, so the AI can try once more.
      if (!retryable) used[tool.name] = (used[tool.name] ?? 0) + 1;
      return text;
    } catch (error) {
      used[tool.name] = (used[tool.name] ?? 0) + 1;
      totals.errors.push(error?.status ?? "failed");
      return "The tool failed. Tell the person you're having trouble reaching your sources.";
    }
  }

  return {
    name: "nebius",
    // What Nion may claim it can do (see prompt.js).
    abilities: {
      search: tools.some((tool) => tool.name === "web_search"),
      data: tools.some((tool) => tool.name === "add_expense"),
    },

    async ask({ system, messages, context, location, model, data }) {
      const useModel = model || defaultModel;
      if (!useModel) throw new Error("No model chosen: set NION_MODEL in .env to a Token Factory model name.");

      const deadline = Date.now() + TOTAL_BUDGET_MS;
      const fallback = fallbackModel && fallbackModel.toLowerCase() !== "none" ? fallbackModel : undefined;
      const state = { primary: useModel, model: useModel, fallback, fellBack: false };
      const thread = [{ role: "system", content: system }, ...messages];
      const totals = { searches: 0, sources: [], errors: [], ops: [], inputTokens: 0, outputTokens: 0 };
      const ctx = { context, location, data: data ?? emptyData() }; // what the tools can see
      const used = {}; // how many times each tool has been used for this question
      let text = "";

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const body = { messages: thread, max_tokens: MAX_TOKENS };
        const available = offered(used);
        if (available.length > 0 && round < MAX_ROUNDS) body.tools = available;

        const data = await request(body, deadline, state);
        totals.inputTokens += data.usage?.prompt_tokens ?? 0;
        totals.outputTokens += data.usage?.completion_tokens ?? 0;

        const message = data.choices?.[0]?.message ?? {};
        const calls = body.tools ? (message.tool_calls ?? []) : [];

        if (calls.length === 0) {
          text = cleanSpoken(message.content);
          if (text) break;

          // No words came back (seen after a search: the model sometimes sends nothing,
          // or asks for a tool it is no longer offered). Say so in the server log, then
          // ask once more, plainly, instead of leaving the person with silence.
          console.warn(
            `Nebius gave no spoken text (finish: ${data.choices?.[0]?.finish_reason}, ` +
              `tool calls: ${message.tool_calls?.length ?? 0}, thinking chars: ${String(message.reasoning_content ?? "").length})`
          );
          thread.push({ role: "user", content: "No more searches are available. Answer me now in plain spoken words, using only the search results you already have." });
          continue;
        }

        // The AI asked for tools: remember what it said, run them, send back the results.
        thread.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
        for (const call of calls) {
          thread.push({ role: "tool", tool_call_id: call.id, content: await runTool(call, ctx, totals, used) });
        }
      }

      const sources = new Map(totals.sources.map((source) => [source.url, source]));
      return {
        text,
        sources: [...sources.values()],
        searches: totals.searches,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        searchErrors: totals.errors,
        ops: totals.ops,
        fellBack: state.fellBack,
        refused: false,
      };
    },
  };
}
