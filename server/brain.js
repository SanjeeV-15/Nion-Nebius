// The "brain": works out Nion's answer.
//
// The "brain" works out Nion's answer. The AI that actually answers is a "provider"
// (see providers/nebius.js): Nemotron on Nebius Token Factory. This file holds the parts
// that don't depend on which model it is: Nion's instructions, the "I need to know where
// you are" signal, and the fallback when there is no answer.

import { buildSystemPrompt } from "./prompt.js";
import { createNebiusProvider } from "./providers/nebius.js";
import { createWebSearchTool } from "./tools/web-search.js";
import { createDataTools } from "./tools/data-tools.js";

// What Nion writes, instead of an answer, when a question depends on where the
// person is and it doesn't know. (See the rules in prompt.js.)
const NEED_LOCATION = "[[NEED_LOCATION]]";

/** Builds the Nebius provider, with web search if a Tavily key is set, and the notebook tools. */
export function createProvider(env = process.env) {
  // Without a Tavily key Nion still works, and says honestly that it can't look things up
  // (see prompt.js).
  const tools = [...(env.TAVILY_API_KEY ? [createWebSearchTool({ apiKey: env.TAVILY_API_KEY })] : []), ...createDataTools()];
  return createNebiusProvider({ tools });
}

let defaultProvider;

/** Ask the configured AI one short question (no tools, no conversation), for small jobs like naming a place. */
export async function completeShort(prompt, provider) {
  provider ??= defaultProvider ??= createProvider();
  return provider.complete(prompt);
}

/**
 * Ask the AI for Nion's reply.
 *   messages: the conversation so far, [{ role: "user" | "assistant", content: "..." }]
 *   context:  details from the person's browser (date, time, time zone, name)
 *   location: optional { city, region, country } to localize searches
 *   data:     the person's notebook (memories, expenses, lists, drafts), already cleaned
 *   provider: which AI to use (tests pass a pretend one)
 * Returns { reply, sources, searches, usage, ops }: reply is the text Nion should speak,
 * sources are the pages it used, as [{ title, url }], and ops are notebook changes
 * for the browser to apply.
 */
export async function askNion({ messages, context, location, model, provider, data }) {
  provider ??= defaultProvider ??= createProvider();

  const result = await provider.ask({
    system: buildSystemPrompt(context, provider.abilities, data),
    messages,
    context,
    location,
    model,
    data,
  });

  const { searches, inputTokens, outputTokens, searchErrors } = result;
  const usage = { searches, inputTokens, outputTokens, searchErrors, fellBack: result.fellBack === true, ...(result.model ? { model: result.model } : {}) };
  const ops = result.ops ?? [];

  if (result.refused) {
    return { reply: "Sorry, I can't help with that one.", sources: [], searches, usage, ops: [] };
  }

  // Nion needs to know where the person is, and doesn't. The page will ask them.
  if (result.text.includes(NEED_LOCATION)) {
    return { needsLocation: true, reply: "", sources: [], searches, usage };
  }

  return {
    reply: result.text || "Sorry, I didn't catch that. Could you say it again?",
    sources: result.sources.slice(0, 8),
    searches,
    usage,
    ops,
  };
}
