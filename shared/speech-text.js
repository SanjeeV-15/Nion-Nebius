// Turns an answer into what a speech voice should actually say. A voice reads symbols out loud
// ("$$" becomes "dollar dollar"), and review sites write prices exactly that way, so an answer that
// quotes them would sound silly. This puts words where the symbols are. The text on the screen
// keeps its symbols; only what is spoken changes.
//
// No requests and no secrets, so it is easy to test.

// How review sites show a price level, in words that fit a sentence ("is mid-range and serves...").
const LEVELS = { 1: "inexpensive", 2: "mid-range", 3: "pricey", 4: "very expensive" };

function money(whole, cents, scale) {
  const w = Number(String(whole).replace(/,/g, ""));
  if (scale) return `${whole}${cents ? `.${cents}` : ""} ${scale.toLowerCase()} dollars`;
  if (cents && cents.length <= 2) {
    const c = Number(cents.padEnd(2, "0"));
    if (w === 0) return `${c} cents`;
    return c === 0 ? `${whole} ${w === 1 ? "dollar" : "dollars"}` : `${whole} ${w === 1 ? "dollar" : "dollars"} ${c} cents`;
  }
  if (cents) return `${whole}.${cents} dollars`;
  return `${whole} ${w === 1 ? "dollar" : "dollars"}`;
}

// A web address or site name written out ("restaurantor.com", "https://www.bbc.com/news/x"): a voice would
// say "dot com", slashes and all. Nion names the site instead ("restaurantor", "bbc").
const TLDS = "(?:com|org|net|io|co|uk|gov|edu|info|tv|fm|me|us|ca|de|fr|es|pt|it|nl|au|app|dev|news)";
const URL_TEXT = /\bhttps?:\/\/[^\s)]+/g;
// Lower-case ending on purpose, so "Lisbon.It" or a missing space after a full stop is left alone.
const BARE_DOMAIN = new RegExp(`\\b(?:[A-Za-z0-9-]+\\.)+${TLDS}\\b(?:/[^\\s)]*)?`, "g");

function siteName(address) {
  const host = address.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0];
  const labels = host.split(".");
  labels.pop(); // the ending: com, org...
  if (labels.length > 1 && /^(?:co|com|org|ac|gov)$/i.test(labels.at(-1))) labels.pop(); // as in .co.uk
  return (labels.at(-1) ?? host).replace(/-/g, " ");
}

/** The words to speak for an answer: symbols for prices, "and", "percent" and the like turned into words. */
export function speechText(text) {
  return String(text ?? "")
    .replace(URL_TEXT, (address) => siteName(address))
    .replace(BARE_DOMAIN, (address) => siteName(address))
    // Amounts first: "$12" -> "12 dollars", "$12.50" -> "12 dollars 50 cents", "$3 million" -> "3 million dollars".
    .replace(/\$\s?(\d[\d,]*)(?:\.(\d+))?(?:\s*(million|billion|trillion|thousand))?/gi, (_, whole, cents, scale) => money(whole, cents, scale))
    // Price levels: a run of one to four dollar signs standing alone.
    .replace(/(?<![\w$])(\${1,4})(?![\w$])/g, (_, signs) => LEVELS[signs.length])
    .replace(/\s*&\s*/g, " and ")
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/[~≈]\s?/g, "about ")
    .replace(/^\s*[-•]\s+/gm, "") // a dash or bullet starting a line
    .replace(/([.:;!?)])\s+[-–•]\s+(?=[A-Z0-9])/g, "$1 ") // a dash used as a list marker after a sentence, as in "...: - In France, ..."
    .replace(/^#+\s*/gm, "") // heading marks
    .replace(/[*`]+/g, "") // stray markdown marks
    .replace(/\s+/g, " ")
    .trim();
}
