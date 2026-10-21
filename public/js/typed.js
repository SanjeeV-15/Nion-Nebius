// Typing to Nion. Not everyone can or wants to talk: a quiet place, a noisy airport,
// a browser without speech, or a judge trying the demo with no microphone. This is
// the same Nion (same memory, same notebook, same History), just typed, and its
// answers are shown on screen instead of spoken.
//
// It keeps its own small conversation, separate from the voice one, so the two never
// get in each other's way. Everything it needs from the page is passed in, so it can
// be tested without a browser.

import { visitorId, judgePass } from "./visitor.js";

const ASK_TIMEOUT_MS = 25000;

/**
 * deps:
 *   known         { place } shared with the voice side: where the person is, once known
 *   getContext    (isNewConversation) => details about the person's moment (date, name...)
 *   loadData      () => the notebook
 *   applyChanges  (ops) => saves notebook changes the server sent back
 *   recordExchange (conversationId, question, reply, sources) => new conversationId (History)
 *   fetchImpl     swapped in tests
 */
export function createTypedChat({ known, getContext, loadData, applyChanges, recordExchange, fetchImpl = fetch }) {
  let messages = [];
  let conversationId = null;
  let waitingFor = null; // a question that needs a place; the next thing typed is the place

  async function ask(question) {
    const thread = [...messages, { role: "user", content: question }];
    let response;
    try {
      response = await fetchImpl("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Nion-Visitor": visitorId() ?? "", "X-Nion-Pass": judgePass() ?? "" },
        signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
        body: JSON.stringify({
          messages: thread.slice(-20),
          context: getContext(messages.length === 0),
          location: known.place ? { text: known.place } : undefined,
          data: loadData(),
        }),
      });
    } catch {
      return { error: true };
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { error: true, reason: body.reason };
    }

    const data = await response.json();
    // The question depends on where the person is: ask them to type it, then ask again.
    if (data.needsLocation) {
      waitingFor = question;
      return { needsPlace: true };
    }

    messages = [...thread, { role: "assistant", content: data.reply }];
    if (data.changes?.length) applyChanges(data.changes);
    conversationId = recordExchange(conversationId, question, data.reply, data.sources);
    return {
      reply: data.reply,
      sources: data.sources ?? [],
      ui: data.ui ?? [],
      // How the answer was made (which model, how long), when the server says.
      ...(data.model ? { meta: { model: data.model, ms: data.ms, searches: data.searches, escalated: data.escalated } } : {}),
    };
  }

  return {
    /** Send what the person typed. Returns { reply, sources } | { needsPlace } | { error, reason }. */
    async send(text) {
      const typed = String(text ?? "").trim();
      if (!typed) return { empty: true };
      if (waitingFor) {
        // The person is answering "which city are you in?".
        const question = waitingFor;
        waitingFor = null;
        known.place = typed.slice(0, 80);
        return ask(question);
      }
      return ask(typed);
    },
    /** Start a fresh typed conversation. */
    reset() {
      messages = [];
      conversationId = null;
      waitingFor = null;
    },
  };
}
