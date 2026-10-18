// The notebook tools: what lets Nion actually DO things for you, by voice.
//
// A tool never saves anything itself. It returns { text, ops }: `text` goes back to
// the AI (so it can confirm in a few words), and `ops` are the changes for the
// notebook (see shared/store.js). The browser applies them and keeps them on your
// device. While answering one question, the provider also applies them to its own
// working copy, so a second tool in the same turn sees the first one's result.

import { randomUUID } from "node:crypto";
import { LISTS, LIST_NAMES, LIMITS, describeDay, findByText } from "../../shared/store.js";
import { describeWhen, isTimeZone, localToUtc } from "../../shared/time.js";
import { PANELS } from "../../shared/panels.js";

const newId = () => randomUUID().slice(0, 8);
const listEnum = { type: "string", enum: LISTS, description: "todo = to-do list; visit = places to visit." };
const say = (message) => ({ text: message, ops: [] });

const openItems = (data, list) => data.lists[list].filter((i) => !i.done);

export function createDataTools() {
  return [
    {
      name: "remember",
      description:
        "Save a lasting fact or preference about the person (like 'avoids pork' or 'prefers buses'). Not for one-off requests.",
      parameters: {
        type: "object",
        properties: { fact: { type: "string", description: "The fact, as a short sentence." } },
        required: ["fact"],
      },
      run({ fact }, { data }) {
        if (!fact || typeof fact !== "string") return say("Not saved: there was no fact.");
        if (findByText(data.memories, fact)) return say("Already remembered.");
        const full = data.memories.length >= LIMITS.memories;
        return {
          text: full ? "Saved. (The notebook is full, so the oldest memory was dropped.)" : "Saved.",
          ops: [{ op: "remember", item: { id: newId(), text: fact, at: new Date().toISOString() } }],
        };
      },
    },
    {
      name: "forget",
      description: "Forget a saved fact when the person asks.",
      parameters: {
        type: "object",
        properties: { fact: { type: "string", description: "Which fact." } },
        required: ["fact"],
      },
      run({ fact }, { data }) {
        const found = findByText(data.memories, fact);
        if (!found) return say("I don't have a memory like that.");
        return { text: `Forgotten: ${found.text}`, ops: [{ op: "forget", id: found.id }] };
      },
    },
    {
      name: "add_expense",
      description:
        "Record money the person spent. Use the currency they said, else the usual one where they are. Short category: food, transport, lodging, shopping or other.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount." },
          currency: { type: "string", description: "Currency code, like USD." },
          category: { type: "string", description: "One or two words." },
          note: { type: "string", description: "What for." },
        },
        required: ["amount"],
      },
      run({ amount, currency, category, note }, { data, context }) {
        const value = Math.round(Number(amount) * 100) / 100;
        if (!Number.isFinite(value) || value <= 0) return say("Not saved: I need an amount above zero.");
        const day = context?.today ?? "";
        const item = {
          id: newId(),
          amount: value,
          currency: String(currency ?? "").toUpperCase().slice(0, 3),
          category: String(category ?? "").toLowerCase().slice(0, 24),
          note: String(note ?? "").slice(0, 100),
          at: context?.nowISO ?? new Date().toISOString(),
          day,
        };
        // Work out today's total as it will be once this is saved.
        const after = { ...data, expenses: [...data.expenses, item] };
        return {
          text: `Saved ${value.toFixed(2)} ${item.currency}${item.category ? ` for ${item.category}` : ""}. Spending today is now: ${describeDay(after, day)}.`,
          ops: [{ op: "add_expense", item }],
        };
      },
    },
    {
      name: "add_to_list",
      description: "Add an item to the to-do list or the to-visit list.",
      parameters: {
        type: "object",
        properties: { list: listEnum, item: { type: "string", description: "The item." } },
        required: ["list", "item"],
      },
      run({ list, item }, { data }) {
        if (!LISTS.includes(list)) return say("Not saved: the list must be todo or visit.");
        if (!item || typeof item !== "string") return say("Not saved: there was nothing to add.");
        if (findByText(openItems(data, list), item, { openOnly: true })) return say(`That's already on the ${LIST_NAMES[list]}.`);
        const count = openItems(data, list).length + 1;
        return {
          text: `Added to the ${LIST_NAMES[list]}. It now has ${count} open item${count === 1 ? "" : "s"}.`,
          ops: [{ op: "add_item", list, item: { id: newId(), text: item, at: new Date().toISOString() } }],
        };
      },
    },
    {
      name: "update_list_item",
      description: "Tick off or remove an item on the to-do or to-visit list.",
      parameters: {
        type: "object",
        properties: {
          list: listEnum,
          item: { type: "string", description: "Which item." },
          action: { type: "string", enum: ["done", "remove"], description: "done = tick off; remove = delete." },
        },
        required: ["list", "item", "action"],
      },
      run({ list, item, action }, { data }) {
        if (!LISTS.includes(list)) return say("The list must be todo or visit.");
        const found = findByText(openItems(data, list), item, { openOnly: true });
        if (!found) {
          const names = openItems(data, list).map((i) => i.text).join(", ");
          return say(names ? `I couldn't find that. The open items are: ${names}.` : `The ${LIST_NAMES[list]} has no open items.`);
        }
        return {
          text: action === "remove" ? `Removed: ${found.text}.` : `Done: ${found.text}.`,
          ops: [{ op: action === "remove" ? "remove_item" : "complete_item", list, id: found.id }],
        };
      },
    },
    {
      name: "set_reminder",
      description:
        "Set a reminder that Nion will speak aloud when the time comes (only while Nion is open and turned on). " +
        "Give minutes_from_now for 'in 20 minutes', or at_local for a clock time.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind them of, in a few words." },
          minutes_from_now: { type: "number", description: "How many minutes from now." },
          at_local: { type: "string", description: "The time on the person's own clock as YYYY-MM-DD HH:MM, 24-hour, in their time zone." },
        },
        required: ["text"],
      },
      run({ text, minutes_from_now, at_local }, { data, context }) {
        const what = typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, 120) : "";
        if (!what) return say("Not set: there was nothing to remind them of.");
        const zone = isTimeZone(context?.timeZone) ? context.timeZone : "UTC";
        const now = Date.parse(context?.nowISO) || Date.now();

        let due;
        if (minutes_from_now !== undefined && minutes_from_now !== null && minutes_from_now !== "" && Number.isFinite(Number(minutes_from_now))) {
          due = now + Number(minutes_from_now) * 60_000;
        } else if (at_local) {
          due = localToUtc(at_local, zone);
          if (due === null) return say("Not set: that is not a time I can use. Ask the person what time they mean.");
        } else {
          return say("Not set: I need to know when. Ask the person what time they want.");
        }

        if (due <= now + 20_000) return say("Not set: that time has already passed. Ask the person for a later time.");
        if (due > now + 366 * 86_400_000) return say("Not set: that is more than a year away. Ask the person for a nearer time.");
        const open = data.reminders.filter((r) => !r.done);
        if (open.length >= LIMITS.reminders) return say("Not set: there are too many reminders already. Ask the person to cancel one.");
        const dueAt = new Date(due).toISOString();
        if (open.some((r) => r.text.toLowerCase() === what.toLowerCase() && Math.abs(Date.parse(r.dueAt) - due) < 60_000)) {
          return say("That reminder is already set.");
        }
        return {
          text: `Reminder set for ${describeWhen(due, now, zone)}: ${what}. Say the time back in a few words, and say it will only be spoken while Nion is still open.`,
          ops: [{ op: "add_reminder", item: { id: newId(), text: what, dueAt, at: new Date(now).toISOString() } }],
        };
      },
    },
    {
      name: "cancel_reminder",
      description: "Cancel a reminder that has not been spoken yet.",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Which reminder, in a few words." } },
        required: ["text"],
      },
      run({ text }, { data }) {
        const open = data.reminders.filter((r) => !r.done);
        const found = findByText(open, text);
        if (!found) {
          return say(open.length ? `I couldn't find that. The reminders are: ${open.map((r) => r.text).join(", ")}.` : "There are no reminders to cancel.");
        }
        return { text: `Cancelled: ${found.text}.`, ops: [{ op: "remove_reminder", id: found.id }] };
      },
    },
    {
      name: "show_panel",
      description:
        "Show part of the notebook in a panel on the person's screen. It stays open and updates as things are added or removed. " +
        "Use it when they ask to see something. Also say briefly what is on it.",
      parameters: {
        type: "object",
        properties: { panel: { type: "string", enum: PANELS, description: "todo, visit, reminders, expenses, drafts, memories, or all." } },
        required: ["panel"],
      },
      run({ panel }) {
        if (!PANELS.includes(panel)) return say("Not shown: that is not a panel I have.");
        return { text: `The ${panel} panel is open. Say briefly what is on it, up to five items.`, ops: [], ui: [{ ui: "show", panel }] };
      },
    },
    {
      name: "hide_panel",
      description: "Close the panel that is showing, when the person asks.",
      parameters: { type: "object", properties: {} },
      run() {
        return { text: "The panel is closed.", ops: [], ui: [{ ui: "hide" }] };
      },
    },
    {
      name: "save_draft",
      description:
        "Save an email draft (never sent): a short, polite email in the person's voice, with a subject.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Who it is for, if said." },
          subject: { type: "string", description: "Subject line." },
          body: { type: "string", description: "The email text." },
        },
        required: ["body"],
      },
      run({ to, subject, body }) {
        if (!body || typeof body !== "string") return say("Not saved: the draft was empty.");
        return {
          text: "Draft saved. Nion cannot send email, so tell the person it is only saved, and offer to read it back to them.",
          ops: [{ op: "save_draft", item: { id: newId(), to: String(to ?? ""), subject: String(subject ?? ""), body, at: new Date().toISOString() } }],
        };
      },
    },
  ];
}
