// Reads Nion's settings from .env and says what is missing. This file only reads
// settings, so it is safe to load first and lets the server stop early with a clear
// message instead of failing later.
//
//   NEBIUS_API_KEY   your Token Factory key (required)
//   NION_MODEL       the model for everyday turns (default: Nemotron 3 Super)
//   NION_FALLBACK_MODEL  the stronger model to escalate to (default: Nemotron 3 Ultra)
//   TAVILY_API_KEY   web search (optional: without it Nion says it can't look things up)

// Two tiers, chosen from measurements (docs/benchmark.md, 2026-10-14, 2 runs of 10 questions each):
// Super passed 20 of 20 with a median of 1.9 s and the fewest tokens; Ultra passed 19 of 20 at
// 2.1 s; Nano passed 18 of 20, with a median of 3.5 s and a 22 s timeout on a search question.
// So everyday turns use Super (smaller, so cheaper and quick), and Ultra, the stronger model,
// is the escalation tier when Super is slow, overloaded or gives no answer.
export const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export const ESCALATION_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";

/** Returns a message saying what to fix in .env, or undefined if the settings are fine. */
export function configProblem(env = process.env) {
  if (!env.NEBIUS_API_KEY) {
    return "NEBIUS_API_KEY is missing.\nOpen the .env file in this folder and put your Token Factory key after NEBIUS_API_KEY=\n(see .env.example and the README).";
  }
  return undefined;
}
