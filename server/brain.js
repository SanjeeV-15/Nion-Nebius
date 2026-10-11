// The "brain": asks Claude for Nion's answer.
//
// The Claude SDK reads your key from the ANTHROPIC_API_KEY setting (your .env
// file), so the key never appears in the code and never reaches the browser.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./prompt.js";

const client = new Anthropic();

// Which Claude model to use. Change NION_MODEL in .env to try another one
// (for example claude-haiku-5-5 if replies feel slow).
const MODEL = process.env.NION_MODEL || "claude-sonnet-5-5";

/**
 * Ask Claude for Nion's reply.
 *   messages: the conversation so far, [{ role: "user" | "assistant", content: "..." }]
 *   context:  details from the person's browser (date, time, time zone)
 * Returns { reply } where reply is the text Nion should speak.
 */
export async function askNion({ messages, context }) {
  const response = await client.messages.create({
    model: MODEL,
    // A generous ceiling, not a target. Nion's answers are short, but the model
    // may also spend some of this budget thinking before it answers.
    max_tokens: 4096,
    // "low" effort keeps replies quick, which matters for a voice conversation.
    output_config: { effort: "low" },
    system: buildSystemPrompt(context),
    messages,
  });

  // Claude can decline a request. That is a normal reply with a special reason.
  if (response.stop_reason === "refusal") {
    return { reply: "Sorry, I can't help with that one." };
  }

  // The reply arrives as a list of blocks; the spoken words are in the text blocks.
  const reply = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  return { reply: reply || "Sorry, I didn't catch that. Could you say it again?" };
}
