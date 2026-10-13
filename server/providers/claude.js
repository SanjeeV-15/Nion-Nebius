// The Claude "provider": the one place that talks to Claude.
//
// Every provider offers the same thing: ask({ system, messages, context, location, model })
// and gives back a plain result, so the brain doesn't care which AI is behind it:
//   { text, sources, searches, inputTokens, outputTokens, searchErrors, refused }
//
// The Claude SDK reads your key from the ANTHROPIC_API_KEY setting (your .env
// file), so the key never appears in the code and never reaches the browser.

import Anthropic from "@anthropic-ai/sdk";
import { searchTool, pickSpokenText, collectSources, searchErrors } from "../search.js";

// Which Claude model to use. Change NION_MODEL in .env to try another one
// (for example claude-haiku-5-5 if replies feel slow).
const DEFAULT_MODEL = "claude-sonnet-5-5";

// A search can pause partway through a reply. We then send the paused reply back
// and Claude carries on. This caps how many times, so a question can't run forever.
const MAX_ROUNDS = 4;

/** `client` can be swapped for a pretend one in tests. */
export function createClaudeProvider({ client, model: defaultModel } = {}) {
  let sdk = client;

  return {
    name: "claude",
    // Claude searches the web by itself (see ../search.js).
    abilities: { search: true },

    async ask({ system, messages, context, location, model }) {
      sdk ??= new Anthropic();
      const useModel = model || defaultModel || process.env.NION_MODEL || DEFAULT_MODEL;

      let thread = messages;
      let response;
      let searches = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      const sources = new Map();
      const errors = [];

      for (let round = 0; round < MAX_ROUNDS; round++) {
        response = await sdk.messages.create({
          model: useModel,
          // A generous ceiling, not a target. Nion's answers are short, but the model
          // may also spend some of this budget thinking before it answers.
          max_tokens: 4096,
          // "low" effort keeps replies quick, which matters for a voice conversation.
          output_config: { effort: "low" },
          system,
          tools: [searchTool(context, location)],
          messages: thread,
        });

        searches += response.usage?.server_tool_use?.web_search_requests ?? 0;
        inputTokens += response.usage?.input_tokens ?? 0;
        outputTokens += response.usage?.output_tokens ?? 0;
        for (const source of collectSources(response.content)) sources.set(source.url, source);
        errors.push(...searchErrors(response.content));

        if (response.stop_reason !== "pause_turn") break;
        // Paused: send Claude's unfinished reply back unchanged so it can continue.
        thread = [...thread, { role: "assistant", content: response.content }];
      }

      return {
        // The spoken words are the text after the last search result.
        text: pickSpokenText(response.content),
        sources: [...sources.values()],
        searches,
        inputTokens,
        outputTokens,
        searchErrors: errors,
        // Claude can decline a request. That is a normal reply with a special reason.
        refused: response.stop_reason === "refusal",
      };
    },
  };
}
