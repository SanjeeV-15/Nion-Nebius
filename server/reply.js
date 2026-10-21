// Builds the JSON the server sends back for a question. Kept apart from the web server so it is
// easy to test: it holds what the page needs (the answer, its sources, notebook changes, screen
// actions) and a little about how the answer was made (which model, how long, how many searches).

/**
 * `result` is what the brain returned; `ms` is how long the whole question took on the server;
 * `place` is the place worked out from GPS (a string), if any.
 */
export function chatResponse({ reply, sources, ops, ui, usage }, { ms, place } = {}) {
  return {
    reply,
    sources,
    place: place || undefined,
    changes: ops?.length ? ops : undefined,
    ui: ui?.length ? ui : undefined,
    // How the answer was made. Shown quietly under the answer, so a viewer can see the models at work.
    model: usage?.model || undefined,
    ms: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : undefined,
    searches: usage?.searches > 0 ? usage.searches : undefined,
    escalated: usage?.fellBack ? true : undefined,
  };
}
