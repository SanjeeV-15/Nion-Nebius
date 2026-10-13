// Nion's notebook: what it remembers about you, your expenses, your two lists and
// your saved email drafts.
//
// The notebook lives in the browser (see public/js/data.js), so it stays on your own
// device. Each request carries a copy; the server changes nothing itself. Instead it
// answers with "changes" (small instructions like "add this expense"), and the
// browser applies them with applyOps() below. This file is shared, so the server
// and the browser use exactly the same rules and can never disagree.
//
// It makes no requests and holds no secrets, so it is easy to test.

export const LIMITS = { memories: 40, expenses: 200, listItems: 50, drafts: 15 };
export const LISTS = ["todo", "visit"];
export const LIST_NAMES = { todo: "to-do list", visit: "to-visit list" };

export function emptyData() {
  return { memories: [], expenses: [], lists: { todo: [], visit: [] }, drafts: [] };
}

// ---------- cleaning (the data arrives from a browser, so it is never trusted) ----------

const text = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const keepNewest = (list, max) => (list.length > max ? list.slice(list.length - max) : list);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function cleanId(value) {
  return text(value, 24).replace(/[^A-Za-z0-9_-]/g, "");
}

function cleanMemory(raw) {
  const id = cleanId(raw?.id);
  const body = text(raw?.text, 200);
  return id && body ? { id, text: body, at: text(raw.at, 30) } : null;
}

function cleanExpense(raw) {
  const id = cleanId(raw?.id);
  const amount = Math.round(Number(raw?.amount) * 100) / 100;
  if (!id || !Number.isFinite(amount) || amount <= 0 || amount >= 1e9) return null;
  const day = text(raw.day, 10);
  return {
    id,
    amount,
    currency: text(raw.currency, 3).toUpperCase().replace(/[^A-Z]/g, ""),
    category: text(raw.category, 24).toLowerCase(),
    note: text(raw.note, 100),
    at: text(raw.at, 30),
    day: DAY.test(day) ? day : "",
  };
}

function cleanListItem(raw) {
  const id = cleanId(raw?.id);
  const body = text(raw?.text, 120);
  return id && body ? { id, text: body, done: raw.done === true, at: text(raw.at, 30) } : null;
}

function cleanDraft(raw) {
  const id = cleanId(raw?.id);
  const body = text(raw?.body, 1200);
  if (!id || !body) return null;
  return { id, to: text(raw.to, 80), subject: text(raw.subject, 120), body, at: text(raw.at, 30) };
}

const cleanList = (raw, clean, max) =>
  keepNewest((Array.isArray(raw) ? raw : []).map(clean).filter(Boolean), max);

/** Turns anything into a valid notebook: wrong shapes, too much, odd characters. */
export function cleanData(raw) {
  const lists = raw && typeof raw === "object" && raw.lists && typeof raw.lists === "object" ? raw.lists : {};
  return {
    memories: cleanList(raw?.memories, cleanMemory, LIMITS.memories),
    expenses: cleanList(raw?.expenses, cleanExpense, LIMITS.expenses),
    lists: Object.fromEntries(LISTS.map((name) => [name, cleanList(lists[name], cleanListItem, LIMITS.listItems)])),
    drafts: cleanList(raw?.drafts, cleanDraft, LIMITS.drafts),
  };
}

// ---------- changes ----------
//
// A change is { op, ... }:
//   remember        { item: { id, text, at } }
//   forget          { id }
//   add_expense     { item: { id, amount, currency, category, note, at, day } }
//   add_item        { list, item: { id, text, at } }
//   complete_item   { list, id }
//   remove_item     { list, id }
//   save_draft      { item: { id, to, subject, body, at } }

/** Returns a new notebook with the changes applied. Unknown or invalid changes are skipped. */
export function applyOps(data, ops = []) {
  const next = cleanData(data);
  for (const op of Array.isArray(ops) ? ops : []) {
    switch (op?.op) {
      case "remember": {
        const item = cleanMemory(op.item);
        if (item && !next.memories.some((m) => m.text.toLowerCase() === item.text.toLowerCase())) next.memories.push(item);
        break;
      }
      case "forget":
        next.memories = next.memories.filter((m) => m.id !== op.id);
        break;
      case "add_expense": {
        const item = cleanExpense(op.item);
        if (item) next.expenses.push(item);
        break;
      }
      case "add_item": {
        const item = cleanListItem(op.item);
        if (item && LISTS.includes(op.list)) next.lists[op.list].push(item);
        break;
      }
      case "complete_item":
        if (LISTS.includes(op.list)) next.lists[op.list] = next.lists[op.list].map((i) => (i.id === op.id ? { ...i, done: true } : i));
        break;
      case "remove_item":
        if (LISTS.includes(op.list)) next.lists[op.list] = next.lists[op.list].filter((i) => i.id !== op.id);
        break;
      case "save_draft": {
        const item = cleanDraft(op.item);
        if (item) next.drafts.push(item);
        break;
      }
    }
  }
  // Keep only the newest, so the notebook (and each request) stays small.
  next.memories = keepNewest(next.memories, LIMITS.memories);
  next.expenses = keepNewest(next.expenses, LIMITS.expenses);
  for (const name of LISTS) next.lists[name] = keepNewest(next.lists[name], LIMITS.listItems);
  next.drafts = keepNewest(next.drafts, LIMITS.drafts);
  return next;
}

// ---------- finding things by what the person said ----------

/** The first item whose text matches `query` (either contains the other), or undefined. */
export function findByText(items, query, { openOnly = false } = {}) {
  const wanted = text(query, 120).toLowerCase();
  if (!wanted) return undefined;
  return items.find((item) => {
    if (openOnly && item.done) return false;
    const have = item.text.toLowerCase();
    return have === wanted || have.includes(wanted) || wanted.includes(have);
  });
}

// ---------- spending ----------

const money = (amount, currency) => `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;

function totalsByCurrency(expenses) {
  const totals = new Map();
  for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount);
  return totals;
}

/** "31.00 USD (food 12.00, taxi 19.00)" for one day, or "nothing yet". */
export function describeDay(data, day) {
  const todays = data.expenses.filter((e) => e.day === day);
  if (todays.length === 0) return "nothing yet";
  return [...totalsByCurrency(todays)]
    .map(([currency, total]) => {
      const byCategory = new Map();
      for (const e of todays.filter((x) => x.currency === currency)) {
        const name = e.category || "other";
        byCategory.set(name, (byCategory.get(name) ?? 0) + e.amount);
      }
      const parts = [...byCategory].map(([name, amount]) => `${name} ${amount.toFixed(2)}`).join(", ");
      return `${money(total, currency)} (${parts})`;
    })
    .join("; ");
}

// ---------- what Nion is told about the notebook, every turn ----------

/**
 * A short text for Nion's instructions: everything it needs to answer "what did I
 * spend today?" or "what's on my list?" without a tool call. `today` is the person's
 * own date, "YYYY-MM-DD".
 */
export function describeData(data, today = "") {
  const lines = [];
  const open = (name) => data.lists[name].filter((i) => !i.done);

  lines.push(
    data.memories.length
      ? `Things you remember about the person:\n${data.memories.map((m) => `- ${m.text}`).join("\n")}`
      : "You don't remember anything about the person yet."
  );
  for (const name of LISTS) {
    const items = open(name);
    lines.push(items.length ? `Their ${LIST_NAMES[name]} (open items):\n${items.map((i) => `- ${i.text}`).join("\n")}` : `Their ${LIST_NAMES[name]} is empty.`);
  }

  if (data.expenses.length === 0) {
    lines.push("No expenses are tracked yet.");
  } else {
    lines.push(`Spending today${today ? ` (${today})` : ""}: ${describeDay(data, today)}.`);
    const allTime = [...totalsByCurrency(data.expenses)].map(([c, t]) => money(t, c)).join("; ");
    lines.push(`Spending in total, across ${data.expenses.length} tracked expenses: ${allTime}.`);
    const recent = data.expenses.slice(-8).map((e) => `- ${e.day || "?"}: ${money(e.amount, e.currency)} ${e.category || "other"}${e.note ? ` (${e.note})` : ""}`);
    lines.push(`The latest expenses:\n${recent.join("\n")}`);
  }

  lines.push(
    data.drafts.length
      ? `Saved email drafts:\n${data.drafts.slice(-5).map((d) => `- to ${d.to || "nobody yet"}: ${d.subject || d.body.slice(0, 40)}`).join("\n")}`
      : "No email drafts are saved."
  );
  return lines.join("\n\n");
}
