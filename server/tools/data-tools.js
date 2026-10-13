// The notebook tools: what lets Nion actually DO things for you, by voice.
//
// A tool never saves anything itself. It returns { text, ops }: `text` goes back to
// the AI (so it can confirm in a few words), and `ops` are the changes for the
// notebook (see shared/store.js). The browser applies them and keeps them on your
// device. While answering one question, the provider also applies them to its own
// working copy, so a second tool in the same turn sees the first one's result.

import { randomUUID } from "node:crypto";
import { LISTS, LIST_NAMES, LIMITS, describeDay, findByText } from "../../shared/store.js";

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
          text: "Draft saved in the notebook. Nion cannot send email, so tell the person it is only saved, and that they can read and copy it on the Notebook page.",
          ops: [{ op: "save_draft", item: { id: newId(), to: String(to ?? ""), subject: String(subject ?? ""), body, at: new Date().toISOString() } }],
        };
      },
    },
  ];
}
