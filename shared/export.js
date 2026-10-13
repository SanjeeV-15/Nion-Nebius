// Turns the notebook into text you can send, share or paste somewhere else (an email
// app, Notes, a message), and builds the "open in my email app" link.
//
// Nion never sends anything itself: these only prepare text, and the person decides
// what to do with it. No requests, no secrets, so it is easy to test.

import { LIST_NAMES, describeDay } from "./store.js";

/** "To: ...\nSubject: ...\n\nbody", for copying or sharing a draft. */
export function draftAsText(draft) {
  return `To: ${draft.to || "(nobody yet)"}\nSubject: ${draft.subject || "(none)"}\n\n${draft.body}`;
}

// A plain address only. Names ("Maria") can't go in the To field of an email link.
const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Email apps and browsers refuse very long links; past this we offer Copy or Share instead.
const MAX_LINK_CHARS = 6000;

/**
 * A mailto: link that opens the person's own email app with the draft filled in. They
 * read it and press send themselves. Returns null if the link would be too long.
 * If "to" is a name and not an address, the To field is left empty for them to fill.
 */
export function mailtoLink(draft) {
  const to = EMAIL.test(draft.to ?? "") ? draft.to : "";
  const link = `mailto:${to}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.body ?? "")}`;
  return link.length <= MAX_LINK_CHARS ? link : null;
}

/** One list as text: "To-do list:\n- buy a SIM card". Finished items are left out. */
export function listAsText(data, name) {
  const title = LIST_NAMES[name][0].toUpperCase() + LIST_NAMES[name].slice(1);
  const open = data.lists[name].filter((item) => !item.done);
  return open.length ? `${title}:\n${open.map((item) => `- ${item.text}`).join("\n")}` : `${title}: nothing open.`;
}

/** A short end-of-day summary for sharing: spending, what is still to do, places to visit. */
export function recapAsText(data, today) {
  return [
    `Trip recap for ${today}`,
    `Spent today: ${describeDay(data, today)}.`,
    listAsText(data, "todo"),
    listAsText(data, "visit"),
  ].join("\n\n");
}
