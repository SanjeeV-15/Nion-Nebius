// Reads Nion's settings from .env and says what is missing. This file only reads
// settings, so it is safe to load first and lets the server stop early with a clear
// message instead of failing later.
//
//   NEBIUS_API_KEY   your Token Factory key (required)
//   NION_MODEL       the Token Factory model to use (default: Nemotron 3 Ultra)
//   TAVILY_API_KEY   web search (optional: without it Nion says it can't look things up)

export const DEFAULT_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";

/** Returns a message saying what to fix in .env, or undefined if the settings are fine. */
export function configProblem(env = process.env) {
  if (!env.NEBIUS_API_KEY) {
    return "NEBIUS_API_KEY is missing.\nOpen the .env file in this folder and put your Token Factory key after NEBIUS_API_KEY=\n(see .env.example and the README).";
  }
  return undefined;
}
