// Voice-controlled panels: "show my to-do list" opens a panel on the main page, and while
// it is open, "add buy milk" or "tick off the bank" changes it as you speak. This file holds
// the parts that need no screen: which panels exist, how to recognise a spoken request to
// open or close one, what a panel shows, and what Nion says aloud about it (the panel is
// extra: everything on it is also said, so nobody has to look).
//
// No requests and no secrets, so it is easy to test.

import { describeDay, expenseDays, LIST_NAMES, localToday } from "./store.js";
import { describeWhen } from "./time.js";

export const PANELS = ["todo", "visit", "reminders", "expenses", "drafts", "memories", "all"];

const TITLES = {
  todo: "To-do list",
  visit: "To-visit list",
  reminders: "Reminders",
  expenses: "Expenses",
  drafts: "Email drafts",
  memories: "What Nion remembers",
  all: "Notebook",
};

// ---------- recognising a spoken request ----------

// What a person might call each panel. Matched against the whole phrase, so a request that
// only sounds similar ("show me places to visit in Paris") is left for the AI to answer.
const NOUNS = [
  ["todo", /^(?:to[\s-]?do|todo|task|tasks)(?:\s+list)?$/i],
  ["visit", /^(?:to[\s-]?visit|visit|places(?:\s+(?:i\s+want\s+)?to\s+visit)?)(?:\s+list)?$/i],
  ["reminders", /^reminders?(?:\s+list)?$/i],
  ["expenses", /^(?:expenses?|spending|what\s+i(?:'ve|\s+have)?\s+spent)(?:\s+list)?$/i],
  ["drafts", /^(?:email\s+)?drafts?$/i],
  ["memories", /^(?:memories|what\s+you\s+remember(?:\s+about\s+me)?)$/i],
  ["all", /^(?:notebook|everything|all\s+of\s+it)$/i],
];

const SHOW =
  "(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:show|open|display|pull\\s+up|bring\\s+up)" +
  "|(?:can|could|may)\\s+i\\s+(?:please\\s+)?(?:see|look\\s+at)" +
  "|(?:please\\s+)?(?:show|open|display|pull\\s+up|bring\\s+up|let\\s+me\\s+see|let\\s+me\\s+look\\s+at))";
const OPEN = new RegExp(`^(?:(?:okay|ok|please|now|just|so)[\\s,]+)*${SHOW}(?:\\s+me)?(?:\\s+(?:my|the|our))?\\s+(.+?)(?:\\s+please)?[\\s.!?]*$`, "i");

const CLOSE =
  /^(?:(?:okay|ok|please|now|just|thanks|thank\s+you)[\s,]+)*(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?(?:please\s+)?(?:close|hide|dismiss)(?:\s+(?:it|that|this|(?:the|my)\s+(?:panel|list|screen|notebook|window|reminders|expenses|drafts)))?(?:\s+please)?[\s.!?]*$/i;

/** The panel a phrase like "to-do list" names, or null. */
export function panelFromWords(words) {
  const phrase = String(words ?? "").trim().replace(/\s+/g, " ");
  return NOUNS.find(([, pattern]) => pattern.test(phrase))?.[0] ?? null;
}

/**
 * Is this a request to open or close a panel? Returns { type: "open", panel },
 * { type: "close" } or null. Only whole, clear requests count; "remove that" and "clear the
 * list" are NOT closing (they change the list), and questions about other things go to the AI.
 */
export function matchPanelCommand(text) {
  const heard = String(text ?? "").trim();
  const open = OPEN.exec(heard);
  if (open) {
    const panel = panelFromWords(open[1]);
    return panel ? { type: "open", panel } : null;
  }
  return CLOSE.test(heard) ? { type: "close" } : null;
}

// ---------- what a panel shows ----------

const MONEY_WORDS = { USD: "dollars", EUR: "euros", GBP: "pounds", INR: "rupees", JPY: "yen", CAD: "Canadian dollars", AUD: "Australian dollars" };

/** 31 and "USD" become "31 dollars" (and 12.5 becomes "12.50 dollars"), so a speech voice reads it well. */
export function spokenMoney(amount, currency) {
  const number = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${number} ${MONEY_WORDS[currency] ?? currency ?? ""}`.trim();
}

const clean = (text) => text.replace(/[.!\s]+$/, "");

function openItems(data, list) {
  return data.lists[list].filter((item) => !item.done);
}

function upcoming(data) {
  return data.reminders.filter((r) => !r.done).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

function listBody(data, list) {
  const items = data.lists[list];
  if (items.length === 0) return `Nothing on the ${LIST_NAMES[list]} yet.`;
  return [...items.filter((i) => !i.done).map((i) => `☐ ${i.text}`), ...items.filter((i) => i.done).map((i) => `☑ ${i.text}`)].join("\n");
}

/**
 * What to show on the panel: { title, text }. `opts`: now (milliseconds), timeZone, today
 * ("YYYY-MM-DD"), so times and "today" are the person's own.
 */
export function formatPanel(data, panel, { now = Date.now(), timeZone = "UTC", today = localToday() } = {}) {
  const opts = { now, timeZone, today };
  if (panel === "all") {
    const parts = PANELS.filter((p) => p !== "all").map((p) => formatPanel(data, p, opts));
    return { title: TITLES.all, text: parts.map((p) => `${p.title}\n${p.text}`).join("\n\n") };
  }
  let text;
  switch (panel) {
    case "todo":
    case "visit":
      text = listBody(data, panel);
      break;
    case "reminders": {
      const items = upcoming(data);
      text = items.length ? items.map((r) => `• ${r.text} · ${describeWhen(Date.parse(r.dueAt), now, timeZone)}`).join("\n") : "No reminders.";
      break;
    }
    case "expenses": {
      if (data.expenses.length === 0) {
        text = "No expenses yet.";
        break;
      }
      const lines = [`Today: ${describeDay(data, today)}`];
      for (const e of data.expenses.filter((x) => x.day === today).slice(-8).reverse()) {
        lines.push(`${e.amount.toFixed(2)}${e.currency ? ` ${e.currency}` : ""} · ${e.category || "other"}${e.note ? ` · ${e.note}` : ""}`);
      }
      const earlier = expenseDays(data).filter((d) => d !== today).slice(0, 3);
      for (const day of earlier) lines.push(`${day || "Earlier"}: ${describeDay(data, day)}`);
      text = lines.join("\n");
      break;
    }
    case "drafts": {
      if (data.drafts.length === 0) {
        text = "No drafts yet.";
        break;
      }
      const latest = data.drafts.at(-1);
      const older = data.drafts.slice(0, -1).reverse().map((d) => `• to ${d.to || "nobody yet"}: ${d.subject || d.body.slice(0, 40)}`);
      text = [`To: ${latest.to || "(nobody yet)"}\nSubject: ${latest.subject || "(none)"}\n\n${latest.body}`, ...older].join("\n\n");
      break;
    }
    case "memories":
      text = data.memories.length ? data.memories.map((m) => `• ${m.text}`).join("\n") : "Nothing yet.";
      break;
    default:
      return { title: "", text: "" };
  }
  return { title: TITLES[panel], text };
}

// ---------- what Nion says about it ----------

function sayList(items, max = 5) {
  const shown = items.slice(0, max).map(clean);
  const more = items.length - shown.length;
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(", ")}, and ${shown.at(-1)}` : shown[0];
  return more > 0 ? `${shown.join(", ")}, and ${more} more` : joined;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A short spoken version of a panel: the same things the panel shows, at most five items. */
export function spokenPanel(data, panel, { now = Date.now(), timeZone = "UTC", today = localToday() } = {}) {
  switch (panel) {
    case "todo":
    case "visit": {
      const items = openItems(data, panel);
      const name = LIST_NAMES[panel];
      return items.length ? `Here's your ${name}. You have ${plural(items.length, "open item")}: ${sayList(items.map((i) => i.text))}.` : `Here's your ${name}. It's empty.`;
    }
    case "reminders": {
      const items = upcoming(data);
      return items.length
        ? `Here are your reminders. You have ${plural(items.length, "reminder")}: ${sayList(items.map((r) => `${r.text}, ${describeWhen(Date.parse(r.dueAt), now, timeZone)}`))}.`
        : "Here are your reminders. There are none.";
    }
    case "expenses": {
      const todays = data.expenses.filter((e) => e.day === today);
      if (data.expenses.length === 0) return "Here are your expenses. There are none yet.";
      if (todays.length === 0) return "Here are your expenses. Nothing yet today.";
      const byCurrency = new Map();
      for (const e of todays) byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amount);
      const totals = [...byCurrency].map(([currency, total]) => spokenMoney(Math.round(total * 100) / 100, currency));
      return `Here are your expenses. Today you've spent ${totals.join(" and ")}.`;
    }
    case "drafts": {
      const latest = data.drafts.at(-1);
      if (!latest) return "Here are your email drafts. There are none.";
      return `Here are your email drafts. You have ${plural(data.drafts.length, "draft")}. The newest is ${latest.to ? `to ${latest.to}` : "not addressed yet"}${latest.subject ? `, about ${latest.subject}` : ""}. Want me to read it to you?`;
    }
    case "memories": {
      return data.memories.length ? `Here's what I remember. ${sayList(data.memories.map((m) => m.text))}.` : "I don't remember anything about you yet.";
    }
    case "all":
      return `Here's your notebook. You have ${plural(openItems(data, "todo").length, "open to-do")}, ${plural(openItems(data, "visit").length, "place")} to visit, and ${plural(upcoming(data).length, "reminder")}.`;
    default:
      return "";
  }
}
