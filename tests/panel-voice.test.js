// Checks voice-controlled panels end to end below the browser: the voice decision, the tools
// the AI can call, and how screen actions travel from the tool to the page. (The page itself is
// checked in app.test.js.) Everything is pretend; nothing is spent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../public/js/conversation.js";
import { createDataTools } from "../server/tools/data-tools.js";
import { createNebiusProvider } from "../server/providers/nebius.js";
import { askNion } from "../server/brain.js";
import { createTypedChat } from "../public/js/typed.js";
import { buildSystemPrompt } from "../server/prompt.js";
import { emptyData } from "../shared/store.js";

const idle = { active: false, followUp: false, awaiting: null };
const tools = Object.fromEntries(createDataTools().map((t) => [t.name, t]));

// ---- the voice decision ----

test("'Hey Nion, show my to-do list' opens a panel, with no question sent to the AI", () => {
  assert.deepEqual(decide(idle, "hey nion show my to-do list"), { type: "panel", command: { type: "open", panel: "todo" } });
});

test("panel requests work after a lone wake phrase, in a conversation, and in the follow-up window", () => {
  const open = (panel) => ({ type: "panel", command: { type: "open", panel } });
  assert.deepEqual(decide({ ...idle, awaiting: "question" }, "show my reminders"), open("reminders"));
  assert.deepEqual(decide({ active: true, awaiting: null }, "open my expenses"), open("expenses"));
  assert.deepEqual(decide({ active: false, followUp: true, awaiting: null }, "can you show me my to-visit list"), open("visit"));
});

test("closing is a 'panel' decision, but 'remove that' and 'clear the list' still go to the AI", () => {
  const close = { type: "panel", command: { type: "close" } };
  assert.deepEqual(decide({ active: true, awaiting: null }, "close it"), close);
  assert.deepEqual(decide({ active: false, followUp: true, awaiting: null }, "please hide the list"), close);
  for (const said of ["remove that", "remove buy milk", "clear the list", "add buy milk", "tick off the bank"]) {
    assert.equal(decide({ active: true, awaiting: null }, said).type, "ask", said);
  }
});

test("without the wake phrase, a panel request is ignored like anything else when idle", () => {
  assert.deepEqual(decide(idle, "show my to-do list"), { type: "ignore" });
});

test("'close the conversation' still ends the conversation, not a panel", () => {
  assert.deepEqual(decide({ active: true, awaiting: null }, "close the conversation"), { type: "end" });
});

// ---- the tools ----

test("show_panel asks the page to open a panel, and hide_panel to close it", () => {
  const shown = tools.show_panel.run({ panel: "todo" }, {});
  assert.deepEqual(shown.ui, [{ ui: "show", panel: "todo" }]);
  assert.deepEqual(shown.ops, []);
  assert.match(shown.text, /Say briefly what is on it/);
  assert.deepEqual(tools.hide_panel.run({}, {}).ui, [{ ui: "hide" }]);
  assert.deepEqual(tools.show_panel.run({ panel: "bank-account" }, {}).ui, undefined, "an unknown panel opens nothing");
  assert.match(tools.show_panel.run({ panel: "bank-account" }, {}).text, /Not shown/);
});

test("the tool replies never tell the listener to look at anything", () => {
  for (const text of [tools.show_panel.run({ panel: "all" }, {}).text, tools.hide_panel.run({}, {}).text]) {
    assert.doesNotMatch(text, /look at|screen|Notebook page|open the/i, text);
  }
});

// ---- from the AI, through the server, to the page ----

const call = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
function scripted(replies) {
  let n = 0;
  return async () => ({ ok: true, status: 200, json: async () => replies[Math.min(n++, replies.length - 1)], text: async () => "" });
}

test("a panel the AI opens travels back with the answer", async () => {
  const fetchImpl = scripted([
    { choices: [{ message: { content: null, tool_calls: [call("c1", "show_panel", { panel: "reminders" })] } }], usage: {} },
    { choices: [{ message: { content: "Here are your reminders. There are none." } }], usage: {} },
  ]);
  const provider = createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: createDataTools() });
  const result = await askNion({ messages: [{ role: "user", content: "what reminders do I have, on screen" }], context: {}, provider, data: emptyData() });
  assert.deepEqual(result.ui, [{ ui: "show", panel: "reminders" }]);
  assert.equal(result.reply, "Here are your reminders. There are none.");
});

test("an answer with no screen action says so with an empty list", async () => {
  const fetchImpl = scripted([{ choices: [{ message: { content: "Hello." } }], usage: {} }]);
  const provider = createNebiusProvider({ apiKey: "k", model: "m", fetchImpl, tools: createDataTools() });
  assert.deepEqual((await askNion({ messages: [{ role: "user", content: "hi" }], context: {}, provider })).ui, []);
});

test("typing carries a screen action through to the page", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ reply: "Here you go.", ui: [{ ui: "show", panel: "todo" }] }) });
  const chat = createTypedChat({ known: {}, fetchImpl, getContext: () => ({}), loadData: () => ({}), applyChanges: () => {}, recordExchange: () => "c" });
  assert.deepEqual((await chat.send("show my tasks please, on screen")).ui, [{ ui: "show", panel: "todo" }]);
});

test("Nion is told how panels work and not to send the listener to look at them", () => {
  const prompt = buildSystemPrompt({}, { search: true, data: true }, emptyData());
  assert.match(prompt, /show_panel \(todo, visit, reminders, expenses, drafts, memories or all\)/);
  assert.match(prompt, /say briefly what is on it \(up to five items\), because they may not be looking/);
  assert.match(prompt, /hide_panel/);
  assert.match(prompt, /Don't tell them to look at it/);
});
