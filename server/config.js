// Which AI answers for Nion, chosen by NION_PROVIDER in .env ("claude" by default,
// or "nebius"). This file only reads settings, so it is safe to load first and
// lets the server stop early with a clear message instead of failing later.

export const PROVIDERS = ["claude", "nebius"];

export function providerName(env = process.env) {
  return (env.NION_PROVIDER || "claude").toLowerCase();
}

/** Returns a message saying what to fix in .env, or undefined if the settings are fine. */
export function configProblem(env = process.env) {
  const name = providerName(env);
  if (!PROVIDERS.includes(name)) {
    return `NION_PROVIDER is "${name}", but it must be one of: ${PROVIDERS.join(", ")}.`;
  }
  if (name === "claude" && !env.ANTHROPIC_API_KEY) {
    return (
      "ANTHROPIC_API_KEY is missing.\n" +
      "Open the .env file in this folder and put your Claude API key after ANTHROPIC_API_KEY=\n" +
      "(see .env.example and the README)."
    );
  }
  if (name === "nebius") {
    if (!env.NEBIUS_API_KEY) {
      return "NEBIUS_API_KEY is missing.\nOpen the .env file in this folder and put your Token Factory key after NEBIUS_API_KEY=";
    }
    if (!env.NION_MODEL) {
      return "NION_MODEL is missing.\nOpen the .env file and put a model name from Token Factory's model list after NION_MODEL=";
    }
  }
  return undefined;
}
