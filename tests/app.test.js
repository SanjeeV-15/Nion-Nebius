// Tests the controller (public/js/app.js) with a pretend microphone, a pretend
// voice and a pretend server, so we can check conversations without audio.

import { test } from "node:test";
import assert from "node:assert/strict";

// --- Pretend browser pieces ---------------------------------------------------

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
// The app waits in places (8 seconds for a question, 15 for a follow-up). These
// timers don't hold the test process open, and a test can fire one on demand.
const scheduled = new Set();
globalThis.setTimeout = (fn, ms, ...args) => {
  const entry = { fn, ms };
  entry.timer = realSetTimeout(() => {
    scheduled.delete(entry);
    fn(...args);
  }, ms);
  entry.timer.unref();
  scheduled.add(entry);
  return entry.timer;
};
globalThis.clearTimeout = (timer) => {
  for (const entry of scheduled) if (entry.timer === timer) scheduled.delete(entry);
  realClearTimeout(timer);
};
// Pretend `ms` milliseconds have passed for any timer waiting that long.
function firePending(ms) {
  for (const entry of [...scheduled]) {
    if (entry.ms !== ms) continue;
    scheduled.delete(entry);
    realClearTimeout(entry.timer);
    entry.fn();
  }
}
const tick = () => new Promise((resolve) => realSetTimeout(resolve, 5));

class FakeRecognition {
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  abort() {}
}

let storage, elements, spoken, pending, fetches;

globalThis.window = globalThis;
globalThis.SpeechRecognition = FakeRecognition;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.speechSynthesis = {
  getVoices: () => [],
  speak(utterance) {
    spoken.push(utterance.text);
    pending.push(utterance);
  },
  cancel() {
    const cancelled = pending;
    pending = [];
    cancelled.forEach((u) => u.onerror?.({}));
  },
};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.fetch = (url, options) =>
  new Promise((resolve, reject) => {
    const call = {
      body: JSON.parse(options.body),
      aborted: false,
      reply: (text) => resolve({ ok: true, json: async () => ({ reply: text }) }),
    };
    options.signal?.addEventListener("abort", () => {
      call.aborted = true;
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
    fetches.push(call);
  });

function makeElement() {
  return {
    textContent: "",
    hidden: false,
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    click() {
      return this.handlers.click();
    },
  };
}

let appVersion = 0;
async function startApp({ name } = {}) {
  storage = new Map();
  if (name) storage.set("nion.name", name);
  elements = {};
  spoken = [];
  pending = [];
  fetches = [];
  globalThis.location = { search: "" };
  globalThis.document = { getElementById: (id) => (elements[id] ??= makeElement()) };
  // A fresh copy of the app each time (the ?number makes Node load it again).
  await import(`../public/js/app.js?run=${++appVersion}`);
  // Don't wait for the click to finish: Nion starts speaking, and the pretend
  // voice only finishes when a test says so.
  elements.start.click();
  await tick();
}

// Pretend the person said something. Chrome reports half-heard words (interim)
// first, then the finished phrase (final).
async function hear(text, { final = true } = {}) {
  const result = [{ transcript: text }];
  result.isFinal = final;
  FakeRecognition.last.onresult({ resultIndex: 0, results: [result] });
  await tick();
}

// Pretend the voice finished reading everything it was given.
async function finishSpeaking() {
  const finished = pending;
  pending = [];
  finished.forEach((u) => u.onend?.());
  await tick();
}

const status = () => elements.status.textContent;
// Nion reads one sentence at a time, so check everything said so far as one text.
const saidSoFar = () => spoken.join(" ");

// --- The tests ----------------------------------------------------------------

test("first use: Nion asks for a name and remembers it", async () => {
  await startApp();
  assert.match(saidSoFar(), /What should I call you/);
  await finishSpeaking();
  assert.match(status(), /Listening for your name/);

  await hear("Sanjeev");
  assert.equal(storage.get("nion.name"), "Sanjeev");
  assert.match(saidSoFar(), /Nice to meet you, Sanjeev/);
});

test("a question gets a spoken answer, greeting the person by name", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what time is it in Denver");

  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].body.context.userName, "Sanjeev");
  assert.equal(fetches[0].body.context.isNewConversation, true);

  fetches[0].reply("Hey Sanjeev, it's one seventeen in Denver right now.");
  await tick();
  assert.match(spoken.at(-1), /one seventeen/);
  assert.match(status(), /Speaking/);
});

test("interrupting while Nion speaks stops it and listens", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what time is it in Denver");
  fetches[0].reply("It's one seventeen in Denver right now.");
  await tick();
  assert.equal(pending.length, 1, "Nion is speaking");

  // Nion's own voice coming back through the microphone is not an interruption.
  await hear("one seventeen in Denver", { final: false });
  assert.equal(pending.length, 1, "still speaking after hearing its own voice");

  // Someone actually talking is.
  await hear("wait actually", { final: false });
  assert.equal(pending.length, 0, "Nion stopped talking");
  assert.match(status(), /Listening/);

  // What they say next is treated as the question, with no wake phrase needed.
  await hear("what about Mumbai");
  assert.equal(fetches.length, 2);
  assert.equal(fetches[1].body.messages.at(-1).content, "what about Mumbai");
});

test("interrupting while Nion is thinking cancels the request", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the weather like");
  assert.match(status(), /Thinking/);

  await hear("never mind", { final: false });
  assert.equal(fetches[0].aborted, true, "the request was cancelled");
  assert.match(status(), /Listening/);

  // The answer to the cancelled question must not be spoken.
  const spokenBefore = spoken.length;
  fetches[0].reply("It's sunny.");
  await tick();
  assert.equal(spoken.length, spokenBefore);
});

test("in a conversation, follow-ups need no wake phrase and it can be ended by voice", async () => {
  await startApp({ name: "Sanjeev" });

  await hear("hey nion let's start a conversation");
  assert.match(saidSoFar(), /Hey Sanjeev, I'm listening/);
  await finishSpeaking();
  assert.match(status(), /In a conversation/);

  await hear("what is the time in Denver");
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].body.context.isNewConversation, false, "already greeted, so no new greeting");
  fetches[0].reply("It's one seventeen in the afternoon.");
  await tick();
  await finishSpeaking();

  await hear("and in Mumbai");
  assert.equal(fetches.length, 2);
  assert.equal(fetches[1].body.messages.length, 3, "Claude gets the earlier turns too");
  fetches[1].reply("It's just before one in the morning.");
  await tick();
  await finishSpeaking();

  await hear("I just want to end the conversation");
  assert.match(spoken.at(-1), /talk soon/);
  await finishSpeaking();
  assert.match(status(), /Waiting\. Say/);

  // Outside a conversation, speech without the wake phrase is ignored again.
  await hear("what time is it");
  assert.equal(fetches.length, 2);
});

test("after an answer there is a 15 second window for a follow-up with no wake phrase", async () => {
  await startApp({ name: "Sanjeev" });

  await hear("hey nion what is the time in Denver");
  fetches[0].reply("Hey Sanjeev, it's one seventeen in Denver right now.");
  await tick();
  await finishSpeaking();
  assert.match(status(), /follow-up/i);

  // No "Hey Nion" this time, and Claude gets the earlier turns too.
  await hear("and in Mumbai");
  assert.equal(fetches.length, 2);
  assert.equal(fetches[1].body.messages.length, 3);
  assert.equal(fetches[1].body.context.isNewConversation, false, "no second greeting");
  fetches[1].reply("It's just before one in the morning.");
  await tick();
  await finishSpeaking();

  // After 15 quiet seconds the window closes and the wake phrase is needed again.
  firePending(15000);
  await tick();
  assert.match(status(), /Waiting\. Say/);
  await hear("what time is it");
  assert.equal(fetches.length, 2, "ignored, because the window had closed");

  // And a fresh question after that is a new conversation with a greeting.
  await hear("hey nion what is the date");
  assert.equal(fetches.length, 3);
  assert.equal(fetches[2].body.context.isNewConversation, true);
  assert.equal(fetches[2].body.messages.length, 1, "starts again with no earlier turns");
});

test("talking during the window keeps it open", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the time in Denver");
  fetches[0].reply("It's one seventeen in Denver right now.");
  await tick();
  await finishSpeaking();

  const waitingForClose = () => [...scheduled].filter((e) => e.ms === 15000).length;
  assert.equal(waitingForClose(), 1, "one 15 second timer is running");
  await hear("and in", { final: false }); // you start talking
  assert.equal(waitingForClose(), 1, "restarted, not duplicated");
});
