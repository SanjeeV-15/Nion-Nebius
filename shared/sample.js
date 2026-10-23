// A sample trip, so someone trying Nion for the first time can see the notebook and the
// panels working ("show my expenses") without having to fill them by talking first.
// Every sample item has an id starting with "sample-", so it can be told apart from
// real entries and removed again with one tap.
//
// No requests and no secrets, so it is easy to test.

import { LISTS } from "./store.js";

const PREFIX = "sample-";
const HOUR = 3_600_000;

const dayBefore = (today, days) => {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - days));
  return date.toISOString().slice(0, 10);
};

/** The changes that fill the notebook with a small trip. `today` is "YYYY-MM-DD", `now` is milliseconds. */
export function sampleOps({ now = Date.now(), today }) {
  const at = new Date(now).toISOString();
  const expense = (n, amount, category, note, day) => ({ op: "add_expense", item: { id: `${PREFIX}e${n}`, amount, currency: "EUR", category, note, day, at } });
  const item = (list, n, text) => ({ op: "add_item", list, item: { id: `${PREFIX}${list}${n}`, text, at } });
  return [
    { op: "remember", item: { id: `${PREFIX}m1`, text: "Prefers walking and buses to taxis", at } },
    { op: "remember", item: { id: `${PREFIX}m2`, text: "Vegetarian", at } },
    expense(1, 18, "food", "Lunch near the station", dayBefore(today, 1)),
    expense(2, 4.5, "food", "Coffee", today),
    expense(3, 12, "transport", "Bus ticket", today),
    expense(4, 22, "food", "Dinner", today),
    item("todo", 1, "Book the airport shuttle"),
    item("todo", 2, "Charge the phone and power bank"),
    item("visit", 1, "Alfama old town"),
    item("visit", 2, "Belém Tower"),
    { op: "add_reminder", item: { id: `${PREFIX}r1`, text: "Check in for the flight", dueAt: new Date(now + 26 * HOUR).toISOString(), at } },
    { op: "save_draft", item: { id: `${PREFIX}d1`, to: "Maria", subject: "Running late", body: "Hi Maria,\n\nMy bus is delayed, so I'll be about 20 minutes late. See you soon.\n\nThanks", at } },
  ];
}

const isSample = (item) => typeof item?.id === "string" && item.id.startsWith(PREFIX);

/** Is any sample item in this notebook? */
export function hasSample(data) {
  return [data.memories, data.expenses, data.drafts, data.reminders, ...LISTS.map((l) => data.lists[l])].some((items) => items.some(isSample));
}

/** The changes that take every sample item out again, leaving the person's own entries alone. */
export function removeSampleOps(data) {
  return [
    ...data.memories.filter(isSample).map((m) => ({ op: "forget", id: m.id })),
    ...data.expenses.filter(isSample).map((e) => ({ op: "remove_expense", id: e.id })),
    ...data.drafts.filter(isSample).map((d) => ({ op: "remove_draft", id: d.id })),
    ...data.reminders.filter(isSample).map((r) => ({ op: "remove_reminder", id: r.id })),
    ...LISTS.flatMap((list) => data.lists[list].filter(isSample).map((i) => ({ op: "remove_item", list, id: i.id }))),
  ];
}
