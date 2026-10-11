// Decides what Nion should do with a piece of text that the browser heard.
//
// The browser turns speech into text, and it often spells "Nion" in a different
// way ("Neon", "Nyan", "Ni on"...). So instead of looking for one exact word, we
// accept several spellings of the name after a greeting like "Hey".

// Several ways Chrome might write "Nion". Add new ones here when the "heard"
// line on the screen shows a spelling we don't recognise yet.
const NAME = "(?:n[iy]\\s?on|nee\\s?on|knee\\s?on|neon|nyan|nian|nyon)";
const GREETING = "(?:hey|hay|hi|hello|ok|okay)";

// A greeting, a gap (spaces or punctuation), then the name, then more gap.
const WAKE = new RegExp(`\\b${GREETING}[\\s,.!?-]+${NAME}\\b[\\s,.!?-]*`, "i");

/**
 * Look at what was heard and say whether it starts with the wake phrase.
 *
 * Returns { woke: false } when there is no "Hey Nion".
 * Returns { woke: true, question } when there is. `question` is whatever came
 * after the wake phrase (an empty string if the person only said "Hey Nion").
 */
export function parseUtterance(text) {
  const heard = String(text ?? "");
  const match = WAKE.exec(heard);
  if (!match) return { woke: false };

  const question = heard
    .slice(match.index + match[0].length)
    .replace(/^[\s,.!?-]+/, "")
    .trim();

  return { woke: true, question };
}
