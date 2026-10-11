// Decides what Nion should do with each thing it hears. No sound, no screen, no
// network here: just a decision. That keeps it easy to test, and app.js carries
// the decision out.
//
// `session` describes where we are:
//   active:   true while a conversation is running ("Hey Nion, let's start a conversation")
//   awaiting: null, "name" (Nion just asked for your name) or "question"
//             (you said only "Hey Nion" and the next thing you say is the question)
//
// The decision is one of:
//   { type: "ignore" }                     not for Nion
//   { type: "setName", name }              remember this name
//   { type: "nameRetry" }                  that wasn't a name, ask again
//   { type: "start" }                      begin a conversation
//   { type: "end" }                        end the conversation
//   { type: "awaitQuestion" }              heard only "Hey Nion"
//   { type: "ask", question, oneShot }     send a question to Claude

import { parseUtterance, detectCommand } from "./wake.js";
import { extractName } from "./name.js";

// What to do with words that came after the wake phrase (or, in a
// conversation, with anything said at all).
function decideAfterWake(question, session) {
  const command = detectCommand(question);
  if (command === "start") return session.active ? { type: "ignore" } : { type: "start" };
  if (command === "end") return session.active ? { type: "end" } : { type: "ignore" };

  const name = extractName(question);
  if (name) return { type: "setName", name };

  if (!question) return { type: "awaitQuestion" };
  return { type: "ask", question, oneShot: !session.active };
}

export function decide(session, text) {
  const heard = String(text ?? "").trim();
  if (!heard) return { type: "ignore" };

  // Nion just asked for your name: the next thing you say is the name.
  if (session.awaiting === "name") {
    const name = extractName(heard, { asked: true });
    return name ? { type: "setName", name } : { type: "nameRetry" };
  }

  // In a conversation you don't need the wake phrase. "Hey Nion" is still
  // allowed at the start, and is ignored if you say it.
  if (session.active) {
    const parsed = parseUtterance(heard);
    return decideAfterWake(parsed.woke ? parsed.question : heard, session);
  }

  // After a lone "Hey Nion", whatever comes next is the question.
  if (session.awaiting === "question") return decideAfterWake(heard, session);

  // Otherwise Nion only listens for the wake phrase.
  const parsed = parseUtterance(heard);
  if (!parsed.woke) return { type: "ignore" };
  return decideAfterWake(parsed.question, session);
}
