// Finds a place the person named inside their own question: "Right now I'm in Denver, and what are
// some good places to eat?" or "Can you suggest places to eat in Miami?". If they say where, Nion
// should use it instead of asking "where are you?".
//
// It reads text only (no requests, no secrets), so it is easy to test. It looks for either
// "I'm in <place>" (any capitalisation, since people type in lower case) or "in/near/around <Place>"
// where the place starts with a capital letter, so "in the morning" or "in a hurry" never count.

const NAME_WORD = "[\\p{Lu}][\\p{L}.'’-]*";
// One to four capitalised words: "Denver", "San Francisco", "New York City".
const CAPITALISED_PLACE = `${NAME_WORD}(?:[\\s,]+${NAME_WORD}){0,3}`;

const IM_IN = new RegExp(
  "\\b(?:i'm|i’m|i am|we're|we’re|we are)\\s+(?:currently\\s+|right now\\s+|now\\s+)?(?:in|at|near|around)\\s+" +
    "([^,.?!;]+?)(?=\\s+(?:and|but|so|what|what's|whats|where|how|which|can|could|do|does|is|are|any|some|tell|give|suggest|recommend)\\b|[,.?!;]|$)",
  "iu"
);
// Case-sensitive on purpose: "in Miami" counts, "in the morning" does not.
const IN_PLACE = new RegExp(`\\b(?:in|near|around|at)\\s+(${CAPITALISED_PLACE})`, "u");

const NOT_PLACES = new Set(["me", "here", "there", "the", "a", "an", "my", "your", "this", "that", "town", "general"]);

function clean(candidate) {
  const place = String(candidate ?? "")
    .replace(/\b(?:right now|at the moment|currently|today|tonight)\b/gi, "")
    .replace(/[^\p{L}\p{N}\p{M}\s,.'’-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.]+$/, "");
  const letters = (place.match(/\p{L}/gu) ?? []).length;
  if (letters < 2 || place.split(" ").length > 5) return null;
  if (NOT_PLACES.has(place.toLowerCase())) return null;
  // "I'm in a hurry", "I'm in the mood for pizza", "I'm in my hotel": not a place Nion can search.
  if (/^(?:a|an|the|my|our|your|this|that|some|no|need|love|trouble|between|front)\b/i.test(place)) return null;
  return place;
}

/** The place named in what the person said, as text, or null if none is named. */
export function placeNamedIn(text) {
  const heard = String(text ?? "");
  const explicit = IM_IN.exec(heard);
  if (explicit) {
    const place = clean(explicit[1]);
    if (place) return place;
  }
  const named = IN_PLACE.exec(heard);
  return named ? clean(named[1]) : null;
}
