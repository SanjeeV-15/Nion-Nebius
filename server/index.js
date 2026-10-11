// The small server. It does two jobs:
//   1. Serves the Nion page (everything in the public/ folder) to your browser.
//   2. Answers POST /api/chat: takes what the person said, asks Claude, and
//      returns Nion's reply. This is the only place your API key is used.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Stop early with a clear message if the key is missing (instead of failing later).
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\nNion can't start: ANTHROPIC_API_KEY is missing.\n" +
      "Open the .env file in this folder and put your Claude API key after ANTHROPIC_API_KEY=\n" +
      "(see .env.example and the README).\n"
  );
  process.exit(1);
}

// Loaded after the key check so a missing key gives the message above.
const { askNion } = await import("./brain.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(here, "..", "public")));

// A quick "are you alive?" check, used by tests and later by the phone check.
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { messages, context } = req.body ?? {};

  // Check the request looks right before spending money on it.
  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 40 &&
    messages.every(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 4000
    ) &&
    messages[messages.length - 1].role === "user";

  if (!valid) {
    return res.status(400).json({ error: "Bad request: send a list of messages ending with a user message." });
  }

  try {
    const { reply } = await askNion({ messages, context });
    res.json({ reply });
  } catch (error) {
    console.error("Claude request failed:", error?.status ?? "", error?.message ?? error);
    res.status(502).json({ error: "I'm having trouble reaching my sources." });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Nion is running. Open http://localhost:${port} in Chrome.`);
});
