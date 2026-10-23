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
let pageHandlers = {}; // things the page listens for, such as a key press

// A pretend location feature. Tests set what the browser says about permission,
// and whether getting the position works.
let locationPermission = "prompt"; // "granted" | "denied" | "prompt"
let locationWorks = true;
let locationRequests = 0;
let locationCallbacks = null; // set while the pretend browser is waiting for the person to click Allow
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    permissions: { query: async () => ({ state: locationPermission }) },
    geolocation: {
      getCurrentPosition(success, failure) {
        locationRequests += 1;
        if (locationWorks === "later") locationCallbacks = { success, failure };
        else if (locationWorks) success({ coords: { latitude: 25.7617, longitude: -80.1918 } });
        else failure(new Error("User denied Geolocation"));
      },
    },
  },
});

globalThis.window = globalThis;
globalThis.SpeechRecognition = FakeRecognition;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.speechSynthesis = {
  getVoices: () => [{ name: "Samantha", lang: "en-US", localService: true }],
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
    const respond = (data) => resolve({ ok: true, json: async () => data });
    const call = {
      body: JSON.parse(options.body),
      aborted: false,
      reply: (text) => respond({ reply: text }),
      respond,
      needLocation: () => respond({ needsLocation: true }),
      // The server had a problem (for example it could not reach the AI service).
      serverError: (reason) => resolve({ ok: false, status: 502, json: async () => ({ error: "trouble", reason }) }),
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
    dataset: {},
    setAttribute() {},
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
async function startApp({ name, search = "", stored = {} } = {}) {
  for (const entry of scheduled) realClearTimeout(entry.timer); // timers of an earlier test
  scheduled.clear();
  storage = new Map();
  if (name) storage.set("nion.name", name);
  for (const [key, value] of Object.entries(stored)) storage.set(key, JSON.stringify(value));
  elements = {};
  pageHandlers = {};
  spoken = [];
  pending = [];
  fetches = [];
  locationPermission = "prompt";
  locationWorks = true;
  locationRequests = 0;
  locationCallbacks = null;
  globalThis.location = { search };
  globalThis.document = {
    getElementById: (id) => (elements[id] ??= makeElement()),
    addEventListener: (type, handler) => (pageHandlers[type] = handler),
  };
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
  assert.equal(fetches[1].body.messages.length, 3, "the AI gets the earlier turns too");
  fetches[1].reply("It's just before one in the morning.");
  await tick();
  await finishSpeaking();

  await hear("I just want to end the conversation");
  // Check everything Nion said, not just its last sentence: a goodbye can be more than one.
  assert.match(saidSoFar(), /talk soon/);
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

  // No "Hey Nion" this time, and the AI gets the earlier turns too.
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

test("the listening icon shows as soon as someone talks to Nion, and goes away if it wasn't for Nion", async () => {
  await startApp({ name: "Sanjeev" });
  assert.match(status(), /Waiting\. Say/);

  // Chatter that isn't for Nion does not flash the listening icon.
  await hear("so anyway I told him that", { final: false });
  assert.match(status(), /Waiting\. Say/);

  // The wake phrase being heard does, even before the sentence is finished.
  await hear("hey nion what is", { final: false });
  assert.match(status(), /Listening/);

  // ...and if the finished sentence turns out not to be for Nion, it goes back to waiting.
  await hear("so anyway I was saying");
  assert.match(status(), /Waiting\. Say/);
  assert.equal(fetches.length, 0);
});

test("in the follow-up window, any speech shows the listening icon", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the time in Denver");
  fetches[0].reply("It's one seventeen in Denver right now.");
  await tick();
  await finishSpeaking();
  assert.match(status(), /follow-up/i);

  await hear("and in", { final: false });
  assert.match(status(), /Listening/);
});

const FILLER = /One moment|Let me check|Checking on that|Just a second/;

test("a slow answer gets a short 'one moment' first, and the answer waits for it to finish", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  assert.equal(fetches.length, 1);

  // Two seconds pass and the AI is still searching.
  firePending(2200);
  await tick();
  assert.match(saidSoFar(), FILLER);

  // The answer arrives while "one moment" is still being spoken: it must wait.
  fetches[0].reply("According to Reuters, talks resumed today.");
  await tick();
  assert.doesNotMatch(saidSoFar(), /Reuters/);

  await finishSpeaking(); // "one moment" ends
  await tick();
  assert.match(saidSoFar(), /According to Reuters/);
});

test("a quick answer gets no 'one moment'", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the capital of Australia");
  fetches[0].reply("It's Canberra.");
  await tick();
  assert.doesNotMatch(saidSoFar(), FILLER);
  assert.match(saidSoFar(), /Canberra/);

  // The "one moment" timer was cancelled, so it can't fire late.
  firePending(2200);
  await tick();
  assert.doesNotMatch(saidSoFar(), FILLER);
});

test("interrupting during 'one moment' cancels the request", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  firePending(2200);
  await tick();
  assert.match(saidSoFar(), FILLER);

  await hear("wait actually", { final: false });
  assert.equal(fetches[0].aborted, true);
  assert.equal(pending.length, 0, "the 'one moment' stopped too");
});

const PLACES_QUESTION = "hey nion what are some places to eat around me";

test("a question that needs a location: Nion asks out loud, then answers once told where", async () => {
  await startApp({ name: "Sanjeev" });
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();

  assert.match(saidSoFar(), /use my location/i);
  assert.match(saidSoFar(), /tell me where you are/i);
  await finishSpeaking();
  assert.match(status(), /where you are/i);

  await hear("I'm in Brickell, Miami");
  assert.equal(fetches.length, 2, "the question was asked again");
  assert.equal(fetches[1].body.messages.at(-1).content, "what are some places to eat around me");
  assert.deepEqual(fetches[1].body.location, { text: "Brickell, Miami" });
  assert.equal(fetches[1].body.messages.length, 1, "the unanswered question is not counted twice");

  fetches[1].reply("Here are five places, cheapest first.");
  await tick();
  assert.match(saidSoFar(), /five places/);
  await finishSpeaking();

  // The place is remembered, so the next question doesn't need asking again.
  await hear("and where is good for coffee");
  assert.deepEqual(fetches[2].body.location, { text: "Brickell, Miami" });
});

test("saying 'use my location' shares the device location, and the place it worked out is remembered", async () => {
  await startApp({ name: "Sanjeev" });
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();
  await finishSpeaking();

  await hear("use my location");
  await tick();
  assert.equal(locationRequests, 1);
  assert.equal(fetches.length, 2);
  assert.deepEqual(fetches[1].body.location, { lat: 25.7617, lon: -80.1918 });

  fetches[1].respond({ reply: "Here are five places.", place: "Brickell, Miami, Florida, US" });
  await tick();
  await finishSpeaking();

  await hear("and where is good for coffee");
  assert.deepEqual(fetches[2].body.location, { text: "Brickell, Miami, Florida, US" });
});

test("if the person has already allowed location, Nion just uses it without asking", async () => {
  await startApp({ name: "Sanjeev" });
  locationPermission = "granted";
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();

  assert.equal(locationRequests, 1);
  assert.equal(fetches.length, 2);
  assert.deepEqual(fetches[1].body.location, { lat: 25.7617, lon: -80.1918 });
  assert.doesNotMatch(saidSoFar(), /use my location/i, "it did not ask out loud");
});

test("if location is denied, Nion asks them to say where they are instead", async () => {
  await startApp({ name: "Sanjeev" });
  locationWorks = false;
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();
  await finishSpeaking();

  await hear("use my location");
  await tick();
  assert.match(saidSoFar(), /couldn't get your location/i);
  await finishSpeaking();

  await hear("Denver");
  assert.deepEqual(fetches[1].body.location, { text: "Denver" });
});

test("after two answers that aren't a place, Nion gives up on the location", async () => {
  await startApp({ name: "Sanjeev" });
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();
  await finishSpeaking();

  await hear("what time is it");
  assert.match(saidSoFar(), /Which city are you in/);
  await finishSpeaking();

  await hear("what time is it");
  assert.match(saidSoFar(), /skip the location/);
  assert.equal(fetches.length, 1, "the waiting question was dropped");
});

const saved = () => JSON.parse(storage.get("nion.conversations") ?? "[]");

test("answered questions are saved for History, and the whole sitting is one entry", async () => {
  await startApp({ name: "Sanjeev" });
  assert.equal(saved().length, 0);

  await hear("hey nion what is the time in Denver");
  assert.equal(saved().length, 0, "nothing is saved until the question is answered");
  fetches[0].respond({ reply: "It's one in Denver.", sources: [{ title: "Time.is", url: "https://time.is" }] });
  await tick();
  await finishSpeaking();
  assert.equal(saved().length, 1);
  assert.deepEqual(saved()[0].turns.map((t) => t.text), ["what is the time in Denver", "It's one in Denver."]);
  assert.equal(saved()[0].turns[1].sources[0].title, "Time.is");

  // A follow-up in the window is part of the same conversation.
  await hear("and in Mumbai");
  fetches[1].reply("It's midnight.");
  await tick();
  await finishSpeaking();
  assert.equal(saved().length, 1);
  assert.equal(saved()[0].turns.length, 4);

  // Even after the follow-up window has closed, a new question is part of the same sitting.
  firePending(15000);
  await tick();
  await hear("hey nion what is the date");
  fetches[2].reply("It's Sunday.");
  await tick();
  assert.equal(saved().length, 1, "one entry for the whole sitting");
  assert.equal(saved()[0].turns.length, 6);
});

test("typed questions and spoken ones in the same sitting are one History entry, in order", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the time in Denver");
  fetches[0].reply("It's one in Denver.");
  await tick();
  await finishSpeaking();

  elements["typed-input"].value = "add buy milk to my to-do list";
  const done = elements.typed.handlers.submit({ preventDefault() {} });
  await tick();
  fetches.at(-1).respond({ reply: "Added." });
  await done;

  await finishSpeaking();
  await hear("hey nion and what about Mumbai");
  fetches.at(-1).reply("It's midnight.");
  await tick();

  assert.equal(saved().length, 1);
  assert.deepEqual(saved()[0].turns.filter((t) => t.role === "user").map((t) => t.text), ["what is the time in Denver", "add buy milk to my to-do list", "and what about Mumbai"]);
});

test("opening Nion again later starts a new History entry", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the time in Denver");
  fetches[0].reply("It's one in Denver.");
  await tick();
  assert.equal(saved().length, 1);

  // A new page load is a new sitting: keep what was saved, and start the app again.
  const keep = storage;
  await startApp({ name: "Sanjeev" });
  storage = keep;
  await hear("hey nion what is the date");
  fetches.at(-1).reply("It's Sunday.");
  await tick();
  assert.equal(saved().length, 2);
});

test("a question that was interrupted before it was answered is not saved", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  await hear("wait actually", { final: false });
  assert.equal(fetches[0].aborted, true);
  assert.equal(saved().length, 0);
});

test("when the server has a problem, Nion says so out loud and nothing is saved", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  fetches[0].serverError();
  await tick();

  assert.match(saidSoFar(), /having trouble reaching my sources/i);
  assert.match(elements.problem.textContent, /couldn't get an answer/i);
  assert.equal(saved().length, 0);
  await finishSpeaking();
  assert.match(status(), /Waiting\. Say/, "back to waiting, not stuck on thinking");
});

test("an answer that takes more than 25 seconds is given up on, out loud", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  assert.match(status(), /Thinking/);

  firePending(25000);
  await tick();
  assert.equal(fetches[0].aborted, true, "the slow request was cancelled");
  assert.match(saidSoFar(), /having trouble reaching my sources/i);
});

test("a 'one moment' that was already being spoken finishes before the trouble message", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  firePending(2200);
  await tick();
  assert.match(saidSoFar(), FILLER);

  fetches[0].serverError();
  await tick();
  assert.doesNotMatch(saidSoFar(), /trouble/, "waits for the filler to end");
  await finishSpeaking();
  await tick();
  assert.match(saidSoFar(), /trouble/);
});

test("when the API credit has run out, the screen says so, and Nion still only says the short message", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  fetches[0].serverError("credit");
  await tick();

  assert.match(elements.problem.textContent, /credit has run out/i);
  assert.match(elements.problem.textContent, /Token Factory/);
  assert.match(saidSoFar(), /having trouble reaching my sources/i);
  assert.doesNotMatch(saidSoFar(), /credit/i, "billing details are not read out to a listener");
});

test("a rejected API key is explained on screen", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  fetches[0].serverError("key");
  await tick();
  assert.match(elements.problem.textContent, /NEBIUS_API_KEY/);
});

test("pressing Escape stops Nion while it is speaking, and then it listens", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what time is it in Denver");
  fetches[0].reply("It's one seventeen in Denver right now, and the weather there is clear.");
  await tick();
  assert.equal(pending.length, 1, "Nion is speaking");

  pageHandlers.keydown({ key: "Escape" });
  await tick();
  assert.equal(pending.length, 0, "stopped");
  assert.match(status(), /Listening/);
});

test("tapping the circle stops Nion, and Escape does nothing when Nion is idle", async () => {
  await startApp({ name: "Sanjeev" });
  pageHandlers.keydown({ key: "Escape" }); // nothing is happening: no effect
  await tick();
  assert.match(status(), /Waiting\. Say/);

  await hear("hey nion what is the latest news");
  assert.match(status(), /Thinking/);
  elements.orb.click();
  await tick();
  assert.equal(fetches[0].aborted, true, "the request was cancelled");
  assert.match(status(), /Listening/);
});

test("the live 'what Chrome heard' line is hidden unless ?debug is in the address", async () => {
  await startApp({ name: "Sanjeev" });
  assert.equal(elements.heard.hidden, true);
  await hear("hey nion what is the date", { final: false });
  assert.equal(elements.heard.textContent, "", "nothing is shown to viewers");

  await startApp({ name: "Sanjeev", search: "?debug" });
  assert.equal(elements.heard.hidden, false);
  await hear("hey nion what is the date", { final: false });
  assert.match(elements.heard.textContent, /what is the date/);
});

test("?reset forgets the name and clears History, so a demo starts fresh", async () => {
  storage = new Map([["nion.conversations", JSON.stringify([{ id: "c1", startedAt: 1, turns: [] }])]]);
  elements = {};
  pageHandlers = {};
  spoken = [];
  pending = [];
  fetches = [];
  globalThis.location = { search: "?reset" };
  storage.set("nion.name", "Sanjeev Neon");
  globalThis.document = { getElementById: (id) => (elements[id] ??= makeElement()), addEventListener: () => {} };
  await import(`../public/js/app.js?run=${++appVersion}`);
  assert.equal(storage.get("nion.name"), undefined);
  assert.equal(storage.get("nion.conversations"), undefined);
});

test("a single stray word heard while Nion is talking does not cut it off", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what are some places to eat near me");
  fetches[0].reply("Here are five places. Mizumi Ramen is affordable Japanese. Cafe Rio is cheap Mexican.");
  await tick();
  const speakingBefore = pending.length;
  assert.ok(speakingBefore > 0, "Nion is speaking");

  // Chrome mishears one word of Nion's own voice, as the finished phrase.
  await hear("Brett");
  assert.equal(pending.length, speakingBefore, "still speaking");
  assert.equal(fetches.length, 1, "nothing was asked");
  assert.match(status(), /Speaking/);

  // A real interruption (a stop word, or a real phrase) still works.
  await hear("what about Mumbai");
  assert.equal(pending.length, 0, "stopped");
  assert.equal(fetches.length, 2);
});

// The person clicks "Allow" in the browser's location pop-up.
const clickAllow = () => locationCallbacks.success({ coords: { latitude: 25.7617, longitude: -80.1918 } });

test("while the browser is asking for location permission, whatever is heard is ignored and the question is asked once", async () => {
  await startApp({ name: "Sanjeev" });
  locationWorks = "later"; // the pop-up is open and the person hasn't clicked yet
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();
  await finishSpeaking();

  await hear("use my location");
  await tick();
  assert.equal(locationRequests, 1);

  // The person talks while the pop-up is open (or Nion's own voice is heard).
  await hear("I turned on my location");
  await hear("sure one moment");
  assert.equal(fetches.length, 1, "nothing new was asked while waiting for the pop-up");

  clickAllow();
  await tick();
  assert.equal(fetches.length, 2, "the waiting question was asked, once");
  assert.deepEqual(fetches[1].body.location, { lat: 25.7617, lon: -80.1918 });
});

test("stopping Nion while the location pop-up is open drops the question", async () => {
  await startApp({ name: "Sanjeev" });
  locationWorks = "later";
  await hear(PLACES_QUESTION);
  fetches[0].needLocation();
  await tick();
  await finishSpeaking();
  await hear("use my location");
  await tick();

  pageHandlers.keydown({ key: "Escape" });
  await tick();
  clickAllow();
  await tick();
  assert.equal(fetches.length, 1, "the question was dropped, not asked after all");
});

test("an answer is not held up for ever if the 'one moment' never finishes", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  firePending(2200);
  await tick();
  assert.match(saidSoFar(), FILLER);
  // (the pretend voice never reports that "one moment" ended)

  fetches[0].reply("According to Reuters, talks resumed.");
  await tick();
  assert.doesNotMatch(saidSoFar(), /Reuters/, "still giving the filler a moment to finish");

  firePending(3000); // it has waited long enough
  await tick();
  assert.match(saidSoFar(), /According to Reuters/);
});

test("Nion's own 'one moment', written into the same phrase as yours, is not taken as input", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what is the latest news");
  firePending(2200);
  await tick();
  const filler = saidSoFar().match(FILLER)[0];

  await hear(`${filler.toLowerCase()} sure`);
  assert.equal(fetches.length, 1, "no new question, and the waiting one was not cancelled");
  fetches[0].reply("According to Reuters, talks resumed.");
  await tick();
  await finishSpeaking();
  await tick();
  assert.match(saidSoFar(), /According to Reuters/);
});

// --- The notebook (memories, expenses, lists, drafts) ---------------------------

const aMemory = { id: "m1", text: "avoids pork", at: "2026-10-12T10:00:00Z" };

test("each question carries a copy of the notebook and today's date", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": { memories: [aMemory] } } });
  await hear("hey nion what should I eat");
  assert.equal(fetches[0].body.data.memories[0].text, "avoids pork");
  assert.deepEqual(fetches[0].body.data.lists, { todo: [], visit: [] }, "missing parts are filled in");
  assert.match(fetches[0].body.context.today, /^\d{4}-\d{2}-\d{2}$/);
});

test("changes in an answer are saved on the device and sent with the next question", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion add buy milk to my to-do list");
  fetches[0].respond({
    reply: "Added.",
    changes: [{ op: "add_item", list: "todo", item: { id: "a1", text: "buy milk", at: "2026-10-13T10:00:00Z" } }],
  });
  await tick();
  assert.equal(JSON.parse(storage.get("nion.data")).lists.todo[0].text, "buy milk");

  await finishSpeaking();
  await hear("what's on my list");
  assert.equal(fetches[1].body.data.lists.todo[0].text, "buy milk");
});

test("a question that was interrupted does not change the notebook", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion add buy milk to my to-do list");
  await hear("never mind", { final: false });
  fetches[0].respond({
    reply: "Added.",
    changes: [{ op: "add_item", list: "todo", item: { id: "a1", text: "buy milk", at: "" } }],
  });
  await tick();
  assert.equal(storage.get("nion.data"), undefined);
});

test("opening the page with ?reset also empties the notebook", async () => {
  await startApp({ name: "Sanjeev", search: "?reset", stored: { "nion.data": { memories: [aMemory] } } });
  assert.equal(storage.get("nion.data"), undefined);
});

// --- Answers shown on screen, and typing -----------------------------------------

test("a spoken answer is also shown quietly as text, with where it came from", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what's the latest news");
  fetches[0].respond({ reply: "BBC reports a quiet day.", sources: [{ title: "BBC", url: "https://bbc.com/x" }, { title: "BBC", url: "https://bbc.com/y" }, { title: "Reuters", url: "https://reuters.com/z" }] });
  await tick();

  assert.equal(elements.exchange.hidden, false);
  assert.match(elements["ex-q"].textContent, /You: .*latest news/);
  assert.equal(elements["ex-a"].textContent, "Nion: BBC reports a quiet day.");
  assert.equal(elements["ex-sources"].textContent, "Sources: BBC; Reuters", "each site once");
});

test("typing to Nion works without speech: the answer appears on screen and is not spoken", async () => {
  await startApp({ name: "Sanjeev" });
  const before = spoken.length;
  elements["typed-input"].value = "add buy a SIM card to my to-do list";
  const done = elements.typed.handlers.submit({ preventDefault() {} });
  await tick();

  assert.equal(fetches.at(-1).body.messages.at(-1).content, "add buy a SIM card to my to-do list");
  assert.match(elements["ex-a"].textContent, /Thinking/);
  assert.equal(elements["typed-input"].value, "", "the box is cleared");

  fetches.at(-1).respond({ reply: "Added.", changes: [{ op: "add_item", list: "todo", item: { id: "t1", text: "buy a SIM card", at: "" } }] });
  await done;
  assert.equal(elements["ex-a"].textContent, "Nion: Added.");
  assert.equal(spoken.length, before, "typed answers are shown, not spoken");
  assert.equal(JSON.parse(storage.get("nion.data")).lists.todo[0].text, "buy a SIM card");
  assert.equal(JSON.parse(storage.get("nion.conversations")).length, 1, "it also appears in History");
});

test("a typed question that fails shows a problem on screen", async () => {
  await startApp({ name: "Sanjeev" });
  elements["typed-input"].value = "hello";
  const done = elements.typed.handlers.submit({ preventDefault() {} });
  await tick();
  fetches.at(-1).serverError("key");
  await done;
  assert.match(elements.problem.textContent, /rejected the API key/);
  assert.equal(elements["ex-a"].textContent, "");
});

test("typing while Nion is speaking stops Nion", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what time is it in Denver");
  fetches[0].reply("It's one seventeen in Denver right now.");
  await tick();
  assert.equal(pending.length, 1, "Nion is speaking");

  elements["typed-input"].value = "never mind";
  elements.typed.handlers.submit({ preventDefault() {} });
  await tick();
  assert.equal(pending.length, 0, "Nion stopped talking");
});

// --- Fair-use limits ----------------------------------------------------------------

test("each question carries this browser's visitor id, the same one every time", async () => {
  await startApp({ name: "Sanjeev" });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => (seen.push(options.headers["X-Nion-Visitor"]), realFetch(url, options));
  try {
    await hear("hey nion what time is it in Denver");
    fetches[0].reply("One seventeen.");
    await tick();
    await finishSpeaking();
    await hear("and in Mumbai");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(seen.length, 2);
  assert.match(seen[0], /^[0-9a-f-]{36}$/);
  assert.equal(seen[0], seen[1]);
  assert.equal(storage.get("nion.visitor"), seen[0], "kept on the device");
});

test("when the daily or hourly limit is hit, the screen explains and Nion says it is taking a break", async () => {
  for (const [reason, onScreen] of [["daily", /limit for today/], ["visitor", /asked a lot in a short time/]]) {
    await startApp({ name: "Sanjeev" });
    await hear("hey nion what is the latest news");
    fetches[0].serverError(reason);
    await tick();
    assert.match(elements.problem.textContent, onScreen);
    assert.match(saidSoFar(), /taking a short break/);
    assert.doesNotMatch(saidSoFar(), /trouble reaching/, "not mistaken for an outage");
  }
});

// --- Spoken reminders -------------------------------------------------------------------

const dueReminder = (id, text, msFromNow) => ({ id, text, dueAt: new Date(Date.now() + msFromNow).toISOString() });
const reminderNotebook = (...reminders) => ({ reminders });
const sleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

test("a reminder that came due while Nion was closed is said when Nion is turned on, with the time it was for", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": reminderNotebook(dueReminder("r1", "call the bank", -10 * 60_000)) } });
  assert.match(saidSoFar(), /You had a reminder: call the bank, which was for \d{1,2}:\d{2} (AM|PM)\./);
  assert.equal(JSON.parse(storage.get("nion.data")).reminders[0].done, true, "marked, so it is not said again");
  assert.match(elements["ex-a"].textContent, /Nion: You had a reminder: call the bank/);
});

test("a reminder that comes due while Nion is open and idle is said at the next check", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": reminderNotebook(dueReminder("r1", "buy milk", 60)) } });
  assert.doesNotMatch(saidSoFar(), /buy milk/, "not due yet");
  await sleep(120);
  firePending(5000); // the page looks for due reminders every five seconds
  await tick();
  assert.match(saidSoFar(), /Reminder: buy milk\./);
  assert.doesNotMatch(saidSoFar(), /You had a reminder/, "it is on time, so it is not called late");
  firePending(5000);
  await tick();
  assert.equal(spoken.filter((line) => /buy milk/.test(line)).length, 1, "said once");
});

test("a reminder never cuts across Nion's own answer: it waits until Nion is free", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what time is it in Denver");
  fetches[0].reply("It's one seventeen in Denver right now.");
  await tick();
  assert.equal(pending.length, 1, "Nion is speaking");

  storage.set("nion.data", JSON.stringify(reminderNotebook(dueReminder("r1", "buy milk", -1000))));
  firePending(5000);
  await tick();
  assert.doesNotMatch(saidSoFar(), /buy milk/, "not while Nion is talking");

  await finishSpeaking();
  firePending(5000);
  await tick();
  assert.match(saidSoFar(), /Reminder: buy milk\./);
});

test("after a reminder, the person can say 'again in ten minutes' with no wake phrase, and Nion knows what it was", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": reminderNotebook(dueReminder("r1", "call the bank", -1000)) } });
  assert.match(saidSoFar(), /Reminder: call the bank\./);
  await finishSpeaking();

  await hear("remind me again in ten minutes");
  assert.equal(fetches.length, 1, "no wake phrase needed");
  const sent = fetches[0].body.messages;
  assert.deepEqual(sent.map((m) => m.role), ["assistant", "user"]);
  assert.match(sent[0].content, /Reminder: call the bank\./);
  assert.equal(fetches[0].body.context.isNewConversation, false);
});

// --- "Try saying" examples ----------------------------------------------------------------

test("tapping an example sends it as a typed question, exactly as if it had been typed", async () => {
  await startApp({ name: "Sanjeev" });
  const done = elements.try.handlers.click({ target: { dataset: { text: "Remind me in 5 minutes to stretch." } } });
  await tick();
  assert.equal(fetches.at(-1).body.messages.at(-1).content, "Remind me in 5 minutes to stretch.");
  assert.match(elements["ex-q"].textContent, /You: Remind me in 5 minutes to stretch\./);

  fetches.at(-1).respond({ reply: "Okay, I'll remind you in 5 minutes, if I'm still open." });
  await done;
  assert.match(elements["ex-a"].textContent, /I'll remind you in 5 minutes/);
});

test("tapping anywhere else in the examples strip does nothing", async () => {
  await startApp({ name: "Sanjeev" });
  const before = fetches.length;
  await elements.try.handlers.click({ target: { dataset: {} } });
  await elements.try.handlers.click({ target: undefined });
  assert.equal(fetches.length, before);
});

// --- Voice-controlled panels ----------------------------------------------------------------

const todoNotebook = { lists: { todo: [{ id: "t1", text: "buy a SIM card" }, { id: "t2", text: "call the bank", done: true }], visit: [] } };

test("'Hey Nion, show my to-do list' opens a panel and reads it out, with no AI round trip", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": todoNotebook } });
  await hear("hey nion show my to-do list");
  assert.equal(fetches.length, 0, "handled on the spot");
  assert.equal(elements.panel.hidden, false);
  assert.equal(elements["panel-title"].textContent, "To-do list");
  assert.equal(elements["panel-body"].textContent, "☐ buy a SIM card\n☑ call the bank");
  assert.match(saidSoFar(), /Here's your to-do list\. You have 1 open item: buy a SIM card\./);
});

test("while the panel is open, adding something updates it as you speak, with no wake phrase", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": todoNotebook } });
  await hear("hey nion show my to-do list");
  await finishSpeaking();

  await hear("add buy milk");
  assert.equal(fetches.length, 1, "this one does go to the AI");
  fetches[0].respond({ reply: "Added.", changes: [{ op: "add_item", list: "todo", item: { id: "t3", text: "buy milk", at: "" } }] });
  await tick();
  assert.equal(elements["panel-body"].textContent, "☐ buy a SIM card\n☐ buy milk\n☑ call the bank", "the panel changed as soon as the answer arrived");
});

test("'close it' closes the panel at once; 'remove that' does not", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": todoNotebook } });
  await hear("hey nion show my to-do list");
  await finishSpeaking();

  await hear("remove that");
  assert.equal(fetches.length, 1, "'remove that' is for the AI, not a way to close the panel");
  assert.equal(elements.panel.hidden, false);
  fetches[0].respond({ reply: "Removed." });
  await tick();
  await finishSpeaking();

  await hear("close it");
  assert.equal(fetches.length, 1, "closing needs no AI");
  assert.equal(elements.panel.hidden, true);
  assert.match(saidSoFar(), /Closed\./);
});

test("'close it' with nothing open says so", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion close it");
  assert.match(saidSoFar(), /Nothing is open right now\./);
  assert.equal(fetches.length, 0);
});

test("a panel the AI opens appears on the page", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": { expenses: [{ id: "e1", amount: 12, currency: "USD", category: "food", note: "lunch", day: new Date().toLocaleDateString("en-CA") }] } } });
  await hear("hey nion what have I spent, put it on screen");
  fetches[0].respond({ reply: "You've spent 12 dollars today.", ui: [{ ui: "show", panel: "expenses" }] });
  await tick();
  assert.equal(elements.panel.hidden, false);
  assert.equal(elements["panel-title"].textContent, "Expenses");
  assert.match(elements["panel-body"].textContent, /12\.00 USD/);

  await finishSpeaking();
  await hear("hide it please");
  assert.equal(elements.panel.hidden, true);
});

test("a panel opened by the AI can be told to close by the AI too, and an unknown panel is ignored", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion show everything");
  await finishSpeaking();
  await hear("hey nion put the bank account on screen");
  fetches.at(-1).respond({ reply: "Done.", ui: [{ ui: "show", panel: "bank-account" }, { ui: "explode" }] });
  await tick();
  assert.equal(elements["panel-title"].textContent, "Notebook", "the earlier panel is untouched by an unknown one");
  await finishSpeaking();
  await hear("hey nion put it away");
  fetches.at(-1).respond({ reply: "Done.", ui: [{ ui: "hide" }] });
  await tick();
  assert.equal(elements.panel.hidden, true);
});

test("typing 'show my reminders' opens the panel at once, shows the words, and does not speak", async () => {
  await startApp({ name: "Sanjeev" });
  const before = spoken.length;
  elements["typed-input"].value = "show my reminders";
  await elements.typed.handlers.submit({ preventDefault() {} });
  assert.equal(fetches.length, 0);
  assert.equal(elements.panel.hidden, false);
  assert.equal(elements["panel-title"].textContent, "Reminders");
  assert.match(elements["ex-a"].textContent, /Nion: Here are your reminders\. There are none\./);
  assert.equal(spoken.length, before, "typed answers are shown, not spoken");

  elements["typed-input"].value = "close it";
  await elements.typed.handlers.submit({ preventDefault() {} });
  assert.equal(elements.panel.hidden, true);
});

test("the panel's Close button works for anyone who would rather tap", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion show my memories");
  assert.equal(elements.panel.hidden, false);
  elements["panel-close"].click();
  assert.equal(elements.panel.hidden, true);
});

test("a reminder spoken while a panel is open updates the reminders panel", async () => {
  await startApp({ name: "Sanjeev", stored: { "nion.data": reminderNotebook(dueReminder("r1", "buy milk", 60_000)) } });
  await hear("hey nion show my reminders");
  assert.match(elements["panel-body"].textContent, /buy milk/);
  await finishSpeaking();
  storage.set("nion.data", JSON.stringify(reminderNotebook(dueReminder("r1", "buy milk", -1000))));
  firePending(5000);
  await tick();
  assert.match(saidSoFar(), /Reminder: buy milk\./);
  assert.equal(elements["panel-body"].textContent, "No reminders.", "it was spoken, so it is no longer upcoming");
});

// --- Which model answered, shown under the answer ----------------------------------------------

test("an answer shows which model made it and how fast, and the page credits the stack", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion what's the latest news");
  fetches[0].respond({ reply: "BBC reports a quiet day.", model: "nvidia/nemotron-3-super-120b-a12b", ms: 4200, searches: 1 });
  await tick();
  assert.equal(elements["ex-meta"].textContent, "NVIDIA Nemotron 3 Super · Nebius Token Factory · 4.2 s · 1 web search (Tavily)");

  await finishSpeaking();
  await hear("and the weather");
  fetches[1].respond({ reply: "Sunny.", model: "nvidia/Nemotron-3-Ultra-550b-a55b", ms: 3300, escalated: true });
  await tick();
  assert.equal(elements["ex-meta"].textContent, "NVIDIA Nemotron 3 Ultra (stepped in) · Nebius Token Factory · 3.3 s", "the stronger model's help is visible");
});

test("a typed answer shows it too, and an answer with no model details shows nothing", async () => {
  await startApp({ name: "Sanjeev" });
  elements["typed-input"].value = "what is the date";
  const done = elements.typed.handlers.submit({ preventDefault() {} });
  await tick();
  fetches.at(-1).respond({ reply: "It's Tuesday.", model: "nvidia/nemotron-3-super-120b-a12b", ms: 900 });
  await done;
  assert.equal(elements["ex-meta"].textContent, "NVIDIA Nemotron 3 Super · Nebius Token Factory · 0.9 s");

  elements["typed-input"].value = "show my reminders";
  await elements.typed.handlers.submit({ preventDefault() {} });
  assert.equal(elements["ex-meta"].textContent, "", "a panel command involves no model");
});

test("the top of the main page credits NVIDIA Nemotron, Nebius Token Factory and Tavily", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /class="tagline">Powered by NVIDIA Nemotron · Nebius Token Factory · Tavily search</);
  assert.ok(html.indexOf('class="tagline"') < html.indexOf('id="orb"'), "visible in a screenshot, above the fold");
});

// --- Symbols are never read out ------------------------------------------------------------------

test("price symbols in an answer are spoken as words but still shown as written", async () => {
  await startApp({ name: "Sanjeev" });
  await hear("hey nion I'm hungry");
  fetches[0].reply("The Ponti downtown is $$$$ and PEMA is $$ and serves fusion food.");
  await tick();
  assert.match(saidSoFar(), /The Ponti downtown is very expensive and PEMA is mid-range and serves fusion food\./);
  assert.doesNotMatch(saidSoFar(), /\$/, "no dollar signs reach the voice");
  assert.match(elements["ex-a"].textContent, /\$\$\$\$/, "the screen keeps what was written");
});

// --- The conversation button follows the conversation ----------------------------------------------

test("the button says End conversation while you talk to Nion after the wake phrase, and Start again afterwards", async () => {
  await startApp({ name: "Sanjeev" });
  assert.equal(elements.convo.textContent, "Start conversation");

  await hear("hey nion what time is it in Denver");
  assert.equal(elements.convo.textContent, "End conversation"); // thinking
  fetches[0].reply("One.");
  await tick();
  assert.equal(elements.convo.textContent, "End conversation"); // speaking
  await finishSpeaking();
  assert.equal(elements.convo.textContent, "End conversation"); // the follow-up window is open

  elements.convo.click(); // tap End
  await tick();
  assert.match(saidSoFar(), /talk soon/);
  assert.equal(elements.convo.textContent, "Start conversation"); // not flipped back while saying goodbye
  await finishSpeaking();
  assert.equal(elements.convo.textContent, "Start conversation");
});

test("the button flips to End conversation when you tap Start, and back when you end it", async () => {
  await startApp({ name: "Sanjeev" });
  elements.convo.click(); // tap Start
  await tick();
  assert.equal(elements.convo.textContent, "End conversation");
  await finishSpeaking();
  assert.equal(elements.convo.textContent, "End conversation"); // a started conversation stays on

  await hear("end the conversation");
  assert.equal(elements.convo.textContent, "Start conversation");
  await finishSpeaking();
  assert.equal(elements.convo.textContent, "Start conversation");
});

test("a first visit shows the how-to-try card, and it stays gone once dismissed", async () => {
  await startApp({ name: "Sanjeev" });
  assert.equal(elements.tour.hidden, true, "turning Nion on closes it");
  assert.equal(storage.get("nion.toured"), "1", "and it is not shown again");

  await startApp({ name: "Sanjeev", stored: { "nion.toured": 1 } });
  assert.equal(elements.tour.hidden, true);
});

test("the how-to-try card can be dismissed, and reopened from the Tips link", async () => {
  await startApp({ name: "Sanjeev" });
  elements["tour-open"].click();
  assert.equal(elements.tour.hidden, false);
  elements["tour-close"].click();
  assert.equal(elements.tour.hidden, true);
  assert.equal(storage.get("nion.toured"), "1");
});
