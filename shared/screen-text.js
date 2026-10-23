// What is shown on the screen for an answer. The model is told to write plain spoken words, but it
// sometimes still uses markdown (**bold**) or dashes as list markers, which look like clutter on the
// screen. This takes those marks out, and gives each source a short readable name instead of a long
// title or a raw web address. The spoken version is made separately (speech-text.js).
//
// No requests and no secrets, so it is easy to test.

/** The answer text with markdown marks and list-marker dashes removed. */
export function screenText(text) {
  return String(text ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/[*`]+/g, "") // any stray * or ` marks
    .replace(/^\s*[-•]\s+/gm, "") // a dash or bullet starting a line
    .replace(/([.:;!?)])\s+[-–•]\s+(?=[A-Z0-9])/g, "$1 ") // a dash used as a list marker after a sentence
    .replace(/^#+\s*/gm, "") // heading marks
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

const MAX_SOURCE_NAME = 48;

/** A short readable name for a source: its title (shortened), or the site name if it has no title. */
export function sourceName(source) {
  const title = String(source?.title ?? "").replace(/\s+/g, " ").trim();
  if (title && !/^https?:\/\//i.test(title)) {
    return title.length > MAX_SOURCE_NAME ? `${title.slice(0, MAX_SOURCE_NAME - 1).trimEnd()}…` : title;
  }
  try {
    const host = new URL(String(source?.url ?? title)).hostname.replace(/^www\./i, "");
    return host || "source";
  } catch {
    return "source";
  }
}
