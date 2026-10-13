// The web search tool: lets the AI look things up through Tavily.
// Docs: https://docs.tavily.com/documentation/api-reference/endpoint/search
//
// A tool is { name, description, parameters, run(args, ctx) }. The AI sees the first
// three; `run` is our code, and only it ever sees the Tavily key (from .env).
// `run` returns { text, sources, searches }: `text` goes back to the AI, `sources`
// are the pages used (for History), `searches` is how many searches it cost.

const MAX_RESULTS = 4; // few, so the reply stays quick and the token cost low
const SNIPPET_CHARS = 450; // enough to answer from (300 was too thin: the AI kept wanting to search again)

// "www.reuters.com" -> "reuters.com". The AI turns this into a spoken name ("Reuters").
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown site";
  }
}

/** `fetchImpl` can be swapped in tests, so no real search or key is needed there. */
export function createWebSearchTool({ apiKey = process.env.TAVILY_API_KEY, fetchImpl = fetch } = {}) {
  return {
    name: "web_search",
    // One search per question keeps replies quick: every extra search adds a few seconds.
    maxCalls: 1,
    description:
      "Search the web for current information: news, prices, weather, hours, places, transport. " +
      "Short plain query; for anything local, include the person's place.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for." },
        topic: {
          type: "string",
          enum: ["general", "news", "finance"],
          description: "news for current events, finance for markets, else general.",
        },
      },
      required: ["query"],
    },

    async run(args) {
      const query = typeof args?.query === "string" ? args.query.trim().slice(0, 300) : "";
      if (!query) return { text: "No search was made: the query was empty.", sources: [], searches: 0 };
      const topic = ["general", "news", "finance"].includes(args.topic) ? args.topic : "general";

      // News and market answers must be current. Without a time range Tavily returns old
      // stories (found by testing: July World Cup predictions for "latest world news").
      // So ask for the last day, and widen to a week if a quiet day gave nothing.
      const ranges = topic === "general" ? [undefined] : ["day", "week"];
      let results = [];
      for (const range of ranges) {
        const response = await fetchImpl("https://api.tavily.com/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            query, topic, search_depth: "fast", max_results: MAX_RESULTS, chunks_per_source: 1,
            ...(range ? { time_range: range } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          const error = new Error(`Tavily search failed (${response.status})`);
          error.status = response.status;
          throw error;
        }
        results = ((await response.json()).results ?? []).slice(0, MAX_RESULTS);
        if (results.length > 0) break;
      }

      // retryable: an empty search does not use up the one allowed search.
      if (results.length === 0) return { text: "The search found nothing. You may try one different search.", sources: [], searches: 1, retryable: true };

      // The AI is told these are information, not instructions (see prompt.js).
      // The footer matters: without it the AI often wants a second search, can't have one,
      // and then says nothing at all (found by testing).
      const text =
        results
          .map((r, i) => `${i + 1}. Site: ${siteOf(r.url)}. Title: ${r.title ?? ""}. ${String(r.content ?? "").slice(0, SNIPPET_CHARS)}`)
          .join("\n") +
        "\n(This was your one search for this question. Answer the person now from these results, even if they are thin: say what you found. Don't ask to search again.)";
      return {
        text,
        sources: results.filter((r) => r.url).map((r) => ({ title: r.title || siteOf(r.url), url: r.url })),
        searches: 1,
      };
    },
  };
}
