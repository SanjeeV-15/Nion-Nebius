// How a model's name, speed and searches are shown under an answer: "NVIDIA Nemotron 3 Super · Nebius Token Factory · 1.9 s".
// It lets a viewer (a judge, say) see which model answered, how fast, and when the stronger
// one stepped in. No requests and no secrets, so it is easy to test.

const LABELS = [
  [/nemotron-3-super/i, "Nemotron 3 Super"],
  [/nemotron-3-ultra/i, "Nemotron 3 Ultra"],
  [/nemotron-3[-_.]?5?[-_ ]?lightning/i, "Nemotron 3.5 Lightning"],
  [/nemotron-3-nano/i, "Nemotron 3 Nano"],
];

/** A friendly name for a Token Factory model id, or the id without its "vendor/" prefix. */
export function modelLabel(id) {
  const text = String(id ?? "");
  if (!text) return "";
  return LABELS.find(([pattern]) => pattern.test(text))?.[1] ?? text.replace(/^[^/]*\//, "");
}

/**
 * The line shown under an answer. `meta` is { model, ms, searches, escalated } as sent by the
 * server. Returns "" when there is nothing to show.
 */
export function describeAnswer(meta) {
  if (!meta?.model) return "";
  const label = modelLabel(meta.model);
  const parts = [(label.startsWith("Nemotron") ? "NVIDIA " : "") + label + (meta.escalated ? " (stepped in)" : ""), "Nebius Token Factory"];
  if (Number.isFinite(meta.ms) && meta.ms >= 0) parts.push(`${(meta.ms / 1000).toFixed(1)} s`);
  if (meta.searches > 0) parts.push(`${meta.searches} web search${meta.searches === 1 ? "" : "es"} (Tavily)`);
  return parts.join(" · ");
}
