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

// A pretend location feature. Tests set what the browser says about permission,
// and whether getting the position works.
let locationPermission = "prompt"; // "granted" | "denied" | "prompt"
let locationWorks = true;
let locationRequests = 0;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    permissions: { query: async () => ({ state: locationPermission }) },
    geolocation: {
      getCurrentPosition(success, failure) {
        locationRequests += 1;
        if (locationWorks) success({ coords: { latitude: 25.7617, longitude: -80.1918 } });
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
    const respond = (data) => resolve({ ok: true, json: async () => data });
    const call = {
      body: JSON.parse(options.body),
      aborted: false,
      reply: (text) => respond({ reply: text }),
      respond,
      needLocation: () => respond({ needsLocation: true }),
      // The server had a problem (for example it could not reach Claude).
      serverError: () => resolve({ ok: false, status: 502, json: async () => ({ error: "trouble" }) }),
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
async function startApp({ name } = {}) {
  storage = new Map();
  if (name) storage.set("nion.name", name);
  elements = {};
  spoken = [];
  pending = [];
  fetches = [];
  locationPermission = "prompt";
  locationWorks = true;
  locationRequests = 0;
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

  // Two seconds pass and Claude is still searching.
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

test("answered questions are saved for History; follow-ups join the same conversation", async () => {
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

  // Once the window has closed, a new question starts a new conversation.
  firePending(15000);
  await tick();
  await hear("hey nion what is the date");
  fetches[2].reply("It's Sunday.");
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
