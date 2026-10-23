// The conversation controller: carries out what Nion decides to do.
//
// conversation.js decides ("ask this question", "end the conversation"...).
// This file does the doing: listening, asking the server, speaking, and keeping
// the screen's status line up to date.
//
//   waiting   -> listening for "Hey Nion" (or, in a conversation, for anything you say)
//   listening -> waiting for your question or your name
//   thinking  -> asking the AI
//   speaking  -> reading something aloud
//
// Nion keeps listening in every state. If you start talking while it is thinking
// or speaking, it stops at once and listens to you, like a person would.

import { decide } from "./conversation.js";
import { parseUtterance } from "./wake.js";
import { isEcho, isInterruption, stripLeadingEcho, stripPhrase } from "./echo.js";
import { createListener, speechInSupported } from "./speech-in.js";
import { watchEarphones } from "./earphones.js";
import { speak, stopSpeaking, speechOutSupported, voiceName, speechText } from "./speech-out.js";
import { getName, setName, clearName, clearConversations, recordExchange, hasToured, setToured } from "./storage.js";
import { loadData, applyChanges as saveChanges, clearData } from "./data.js";
import { formatPanel, spokenPanel, matchPanelCommand, PANELS } from "../../shared/panels.js";
import { describeAnswer } from "../../shared/models.js";
import { sampleOps, hasSample, removeSampleOps } from "../../shared/sample.js";
import { localToday } from "../../shared/store.js";
import { voiceLikelyWorks } from "./browser.js";
import { createTypedChat } from "./typed.js";
import { createWakeLock } from "./wakelock.js";
import { visitorId, judgePass } from "./visitor.js";
import { createReminderScheduler } from "./reminders.js";
import { showState } from "./ui.js";
import { geolocationPermission, getDevicePosition } from "./location.js";

const el = {
  start: document.getElementById("start"),
  convo: document.getElementById("convo"),
  stop: document.getElementById("stop"),
  status: document.getElementById("status"),
  heard: document.getElementById("heard"),
  problem: document.getElementById("problem"),
  debug: document.getElementById("debug"),
  orb: document.getElementById("orb"),
  copylog: document.getElementById("copylog"),
  exchange: document.getElementById("exchange"),
  exQ: document.getElementById("ex-q"),
  exA: document.getElementById("ex-a"),
  exSources: document.getElementById("ex-sources"),
  exMeta: document.getElementById("ex-meta"),
  typedForm: document.getElementById("typed"),
  typedInput: document.getElementById("typed-input"),
  tryStrip: document.getElementById("try"),
  tour: document.getElementById("tour"),
  tourOpen: document.getElementById("tour-open"),
  tourClose: document.getElementById("tour-close"),
  tourSample: document.getElementById("tour-sample"),
  tourSteps: document.getElementById("tour-steps"),
  tourNote: document.getElementById("tour-note"),
  panel: document.getElementById("panel"),
  panelTitle: document.getElementById("panel-title"),
  panelBody: document.getElementById("panel-body"),
  panelClose: document.getElementById("panel-close"),
};

const params = new URLSearchParams(location.search);

// Opening the page with ?reset starts completely fresh: it forgets the saved name and
// all saved conversations and notebook (useful before recording a demo).
if (params.has("reset")) {
  clearName();
  clearConversations();
  clearData();
  setToured(false);
}

// "How to try Nion": a short card for a first visit (what to say, what to look for). It closes
// when dismissed or when Nion is turned on, and the Tips link brings it back.
function closeTour() {
  el.tour.hidden = true;
  setToured();
}
// Voice needs Chrome-style speech recognition. Elsewhere (Safari, say) Nion offers typing instead.
const voiceOk = speechInSupported && speechOutSupported && voiceLikelyWorks(globalThis.navigator?.userAgent);
el.tour.hidden = hasToured();
if (!voiceOk) {
  el.tourSteps.innerHTML =
    "<li>Type <b>“What's the latest world news?”</b> in the box above, or tap an example. It searches the web and answers.</li>" +
    "<li>Tap <b>Load a sample trip</b>, then type <b>“show my expenses”</b>.</li>" +
    "<li>Type <b>“I just spent 12 dollars on lunch.”</b> and then <b>“show my expenses”</b> again.</li>";
  el.tourNote.textContent = "Voice (saying “Hey Nion”) works in Google Chrome. Under every answer you'll see which NVIDIA Nemotron model on Nebius Token Factory answered, how fast, and how many web searches it used.";
}
el.tourClose.addEventListener("click", closeTour);
el.tourOpen.addEventListener("click", () => {
  el.tour.hidden = false;
  refreshSampleButton();
});

// "Load a sample trip": fills the notebook with a few example entries (marked as a sample, and
// removed again with one tap) and opens it, so there is something to look at without talking first.
function refreshSampleButton() {
  el.tourSample.textContent = hasSample(loadData()) ? "Remove the sample trip" : "Load a sample trip";
}
el.tourSample.addEventListener("click", () => {
  if (hasSample(loadData())) {
    applyChanges(removeSampleOps(loadData()));
  } else {
    const now = new Date();
    applyChanges(sampleOps({ now: now.getTime(), today: localToday(now) }));
    showPanel("all");
  }
  refreshSampleButton();
});
refreshSampleButton();

// Opening the page with ?debug shows a log of what Nion hears and decides, which
// helps when something doesn't work the way it should.
const debugOn = params.has("debug");
el.heard.hidden = !debugOn; // the live "what Chrome heard" line is for debugging, not for viewers
const traceLines = [];
function trace(kind, detail = "") {
  const t = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${pad(t.getMinutes())}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}`;
  const line = `${stamp} ${kind} ${detail}`.trim();
  console.log("[nion]", line);
  if (!debugOn) return;
  traceLines.push(line);
  if (traceLines.length > 150) traceLines.shift();
  el.debug.hidden = false;
  el.copylog.hidden = false;
  el.debug.textContent = traceLines.join("\n");
  el.debug.scrollTop = el.debug.scrollHeight;
}
el.copylog.addEventListener("click", () => navigator.clipboard?.writeText(traceLines.join("\n")));

let state = "off"; // off | waiting | listening | thinking | speaking
let sayingGoodbye = false; // Nion is saying goodbye after "End conversation"
const session = {
  active: false, // is a conversation running?
  followUp: false, // is the follow-up window open? (see below)
  awaiting: null, // null | "name" | "question"
};

// After Nion answers, you can ask a follow-up for this long without saying
// "Hey Nion" again. If you stay quiet for this long, Nion goes back to waiting
// for the wake phrase. A shorter window means fewer accidental questions from
// background talk; a longer one is more relaxed.
const FOLLOW_UP_MS = 15000;
let followUpTimer = null;

// If the AI takes longer than this to answer (usually because it is searching the
// web), Nion says a short "one moment" so you know it hasn't stalled. Ordinary
// answers arrive in about 1 to 2 seconds, so they don't trigger it.
const FILLER_AFTER_MS = 2200;

// If there is still no answer after this long, give up and say so, instead of
// sitting on "thinking" for ever. A web search normally takes under 10 seconds.
const ASK_TIMEOUT_MS = 25000;
const TROUBLE = "I'm having trouble reaching my sources. Please try again in a moment.";

// What to show on screen for the person running Nion, by the reason the server gives.
const PROBLEM_TEXT = {
  credit: "The AI service says the account's credit has run out. Check the credit balance (Nebius Token Factory), then try again.",
  key: "The AI service rejected the API key. Check the key in your .env file (NEBIUS_API_KEY).",
  busy: "The AI service is busy right now. Try again in a moment.",
  visitor: "You've asked a lot in a short time. Please wait a little while and try again.",
  daily: "Nion has reached its limit for today, which keeps the demo free for everyone. Please try again tomorrow.",
};
// What Nion says when a fair-use limit is hit (instead of "trouble reaching my sources").
const BREAK = "I'm taking a short break right now. Please try again a little later.";
const FILLERS = ["One moment.", "Let me check.", "Checking on that.", "Just a second."];
let lastFiller = -1;
function nextFiller() {
  let i;
  do {
    i = Math.floor(Math.random() * FILLERS.length);
  } while (i === lastFiller);
  lastFiller = i;
  return FILLERS[i];
}
let messages = []; // the conversation so far, sent to the AI each time
let historyId = null; // the History entry for this sitting: everything since Nion was opened joins it, voice or typed
let nameTries = 0;

// Where the person is, once we know. It is remembered until the page is closed,
// so Nion doesn't ask again. `pending` is the question that was waiting for a
// location, asked again as soon as we have one.
const known = { place: null };
let pending = null;
// True while the browser's "Allow location?" pop-up is open. Anything heard then is
// Nion's own voice or the person talking to the pop-up, not a new question.
let locating = false;
// The last "one moment" Nion said, so it is never mistaken for the person.
const filler = { text: "", until: 0 };
let placeTries = 0;
let questionTimer = null;

// Interrupting: every spoken line or question gets a "turn" number. If you
// interrupt, the number moves on, and anything still finishing from the old turn
// notices and quietly stops.
let turn = 0;
let abortAsk = null; // lets us cancel a question that is still waiting for the AI
// What Nion said last, and until when its voice may still be coming back through
// the microphone. Chrome reports words a moment late, so this keeps going for a
// few seconds after Nion stops.
const ECHO_TAIL_MS = 3500;
// A "one moment" is only a second or two long. If the voice never reports that it
// finished, the real answer must not wait for it for ever.
const FILLER_WAIT_MS = 3000;
const echo = { text: "", until: 0 };

function statusText() {
  switch (state) {
    case "off": return "Tap the button to talk to Nion, or type below.";
    case "waiting":
      if (session.active) return "In a conversation. Just talk, or say “End the conversation.”";
      if (session.followUp) return "Go ahead, I'm still listening for a follow-up.";
      return "Waiting. Say “Hey Nion.”";
    case "listening":
      if (session.awaiting === "name") return "Listening for your name…";
      if (session.awaiting === "place") return "Listening for where you are…";
      return "Listening…";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking…";
  }
}

function setState(next) {
  if (next !== state) trace("state", `${state} -> ${next}`);
  state = next;
  el.status.textContent = statusText();
  showState(next); // the icon
  refreshConvoButton();
}

function showProblem(message) {
  el.problem.textContent = message;
  el.problem.hidden = !message;
}

// Keeps the screen awake while Nion is on, so a phone doesn't dim, lock and quietly
// stop listening. (It can't listen in the background: that needs a native app.)
const wakeLock = createWakeLock();

// With earphones on, Nion's own voice can't leak into the microphone, so it can stop talking the
// moment you start, instead of waiting for Chrome to write down two whole words. (See earphones.js:
// anything unclear counts as speakers, where this stays off.)
let earphones = false;
const earphoneWatch = watchEarphones(({ on, label }) => {
  if (on !== earphones) trace("earphones", on ? `detected (${label})` : "not detected");
  earphones = on;
});

function handleSpeechStart() {
  if (!earphones || locating) return;
  if (state === "speaking" || state === "thinking") {
    trace("interrupt", "speech started (earphones)");
    interrupt();
  }
}

const listener = createListener({
  onText: handleHeard,
  onInterim: handleInterim,
  onProblem: handleProblem,
  onSpeechStart: handleSpeechStart,
  onEvent: (name) => {
    trace("mic", name);
    if (name === "recogniser started") earphoneWatch.check(); // device names are visible once the microphone is allowed
  },
});

function handleProblem(reason) {
  if (reason === "mic-blocked") {
    listener.stop();
    wakeLock.disable();
    setState("off");
    el.start.hidden = false;
    showProblem("Nion can't use the microphone. Allow it in Chrome's address bar, then tap the button again.");
  } else if (reason === "network") {
    showProblem("Chrome's speech recognition needs an internet connection.");
  }
}

let voiceLogged = false;

// Say something. Listening stays on, so you can interrupt.
async function say(text, { then = "waiting" } = {}) {
  const mine = ++turn;
  echo.text = speechText(text); // what is actually said, so Nion still knows its own voice when it hears it
  echo.until = Infinity; // its voice is coming through the speakers right now
  setState("speaking");
  await speak(text);
  if (!voiceLogged && voiceName()) {
    voiceLogged = true;
    trace("voice", `speaking with: ${voiceName()}`); // visible with ?debug: tells you which voice to improve
  }
  if (mine !== turn) return false; // you interrupted: the new turn has taken over
  echo.until = Date.now() + ECHO_TAIL_MS;
  setState(then);
  return true;
}

// Open (or restart) the follow-up window.
function openFollowUp() {
  if (session.active) return; // a started conversation has no time limit
  const wasOpen = session.followUp;
  session.followUp = true;
  clearTimeout(followUpTimer);
  followUpTimer = setTimeout(closeFollowUp, FOLLOW_UP_MS);
  if (!wasOpen) trace("follow-up window", `open for ${FOLLOW_UP_MS / 1000}s`);
  if (state === "waiting") setState("waiting"); // refresh the status line
}

function closeFollowUp() {
  clearTimeout(followUpTimer);
  if (!session.followUp) return;
  session.followUp = false;
  if (!session.active) {
    messages = []; // that conversation is over
  }
  trace("follow-up window", "closed");
  refreshConvoButton();
  if (state === "waiting") setState("waiting");
}

// Stop whatever Nion is doing, because you started talking.
function interrupt() {
  trace("interrupt", `was ${state}`);
  turn += 1;
  if (locating) {
    locating = false; // stopped while the pop-up was open: forget the waiting question
    pending = null;
  }
  stopSpeaking();
  abortAsk?.abort();
  echo.until = Date.now() + ECHO_TAIL_MS; // what we cut off may still arrive
  // Outside a started conversation, what you say next is a follow-up to this one.
  if (!session.active && session.awaiting === null) openFollowUp();
  setState("listening");
}

function armQuestionWait() {
  session.awaiting = "question";
  clearTimeout(questionTimer);
  questionTimer = setTimeout(() => {
    if (session.awaiting === "question") session.awaiting = null;
    if (state === "listening") setState("waiting");
  }, 8000);
}

// Words arrive while someone is still speaking. If Nion is busy and it isn't
// just its own voice, stop at once.
let lastInterim = "";
function handleInterim(text) {
  if (session.followUp) openFollowUp(); // you are talking: keep the window open
  // Show what Chrome is hearing right now, before it has finished the phrase.
  if (debugOn) el.heard.textContent = `Hearing: “${text}”`;
  const busy = state === "speaking" || state === "thinking";
  if (locating) return; // waiting for the browser's location pop-up
  const interrupting = busy && isInterruption(text, echo.text);
  if (text !== lastInterim) {
    lastInterim = text;
    trace("interim", `“${text}”${busy ? (interrupting ? " (someone is talking)" : " (Nion's own voice, ignored)") : ""}`);
  }
  if (interrupting) interrupt();

  // Someone is talking to Nion: show the listening icon right away, not only when
  // Chrome has finished the sentence. In wake mode that means the wake phrase was
  // heard; in a conversation or the follow-up window, any speech counts.
  if (!busy && state === "waiting") {
    const forNion = session.active || session.followUp || parseUtterance(text).woke;
    const ownVoice = Date.now() < echo.until && isEcho(text, echo.text);
    if (forNion && !ownVoice) setState("listening");
  }
}

function handleHeard(text) {
  if (!text || state === "off") return;
  if (debugOn) el.heard.textContent = `Heard: “${text}”`;
  lastInterim = "";
  trace("final", `“${text}” (state ${state}, conversation ${session.active ? "on" : "off"}, awaiting ${session.awaiting ?? "nothing"})`);

  // When Nion has just asked you something (your name, where you are), a short
  // answer is expected. It may repeat words from the question ("use my location"),
  // so it must not be mistaken for Nion's own voice. Only a long phrase that is
  // mostly Nion's words is treated as an echo then.
  if (locating) {
    trace("ignored", "waiting for the location pop-up (press Escape to cancel)");
    return;
  }

  // Chrome can write Nion's "one moment" into the same phrase as the person's words.
  if (Date.now() < filler.until) {
    const rest = stripPhrase(text, filler.text);
    if (rest !== text) {
      trace("trimmed", `“${rest}” (took out Nion's "${filler.text}")`);
      if (!rest) return;
      text = rest;
    }
  }

  const expectingAnswer = session.awaiting === "name" || session.awaiting === "place";
  const shortAnswer = expectingAnswer && text.split(/\s+/).filter(Boolean).length < 6;

  // Nion's own voice, coming back through the microphone, is not you talking.
  if (Date.now() < echo.until && !shortAnswer) {
    if (isEcho(text, echo.text)) {
      trace("ignored", "Nion's own voice");
      return;
    }
    const trimmed = stripLeadingEcho(text, echo.text);
    if (trimmed !== text) {
      trace("trimmed", `“${trimmed}”`);
      text = trimmed;
    }
  }

  if (state === "speaking" || state === "thinking") {
    // On laptop speakers Chrome often mishears one word of Nion's own voice (a stray
    // "Brett" in the middle of a list). One odd word is far more likely that than you
    // interrupting, so it is ignored. A stop word ("wait") or a real phrase still counts.
    if (!shortAnswer && !isInterruption(text, echo.text)) {
      trace("ignored", "one stray word while Nion was talking");
      return;
    }
    interrupt();
  }

  const action = decide(session, text);
  trace("decided", JSON.stringify(action));

  switch (action.type) {
    case "ignore":
      // It turned out not to be for Nion: stop showing the listening icon.
      if (state === "listening" && session.awaiting === null) setState("waiting");
      return;

    case "setName":
      return rememberName(action.name);

    case "nameRetry":
      return retryName();

    case "setPlace":
      return rememberPlace(action.place);

    case "useDeviceLocation":
      return useDeviceLocation();

    case "placeRetry":
      return retryPlace();

    case "awaitQuestion":
      armQuestionWait();
      setState("listening");
      return;

    case "start":
      return startConversation();

    case "end":
      return endConversation();

    case "panel":
      session.awaiting = null;
      clearTimeout(questionTimer);
      return handlePanel(action.command);

    case "ask":
      session.awaiting = null;
      clearTimeout(questionTimer);
      return ask(action.question, action.oneShot);
  }
}

async function rememberName(name) {
  const first = session.awaiting === "name";
  setName(name);
  session.awaiting = null;
  nameTries = 0;
  await say(
    first
      ? `Nice to meet you, ${name}. Just say “Hey Nion” whenever you want me.`
      : `Okay, I'll call you ${name}.`
  );
}

async function retryName() {
  nameTries += 1;
  if (nameTries >= 2) {
    session.awaiting = null;
    nameTries = 0;
    return say("No problem, we can do names later. Just say “Hey Nion” whenever you want me.");
  }
  await say("Sorry, I didn't catch your name. What should I call you?", { then: "listening" });
}

// A question needs to know where the person is, and we don't. Ask out loud.
async function askForLocation(question, oneShot, lookupFailed = false) {
  pending = { question, oneShot };
  placeTries = 0;

  // If the person already allowed location for this site, just use it quietly.
  if (!lookupFailed && (await geolocationPermission()) === "granted") return useDeviceLocation();

  session.awaiting = "place";
  await say(
    lookupFailed
      ? "I couldn't work out where that is. Just tell me which city you're in."
      : "I can't tell where you are yet. You can say “use my location” and allow it when asked, or just tell me where you are.",
    { then: "listening" }
  );
}

// The person said where they are: remember it and ask the waiting question again.
async function rememberPlace(place) {
  known.place = place;
  session.awaiting = null;
  const waiting = pending;
  pending = null;
  if (waiting) return ask(waiting.question, waiting.oneShot);
  await say(`Okay, I'll remember you're in ${place}.`);
}

// The person said to use their device's location.
async function useDeviceLocation() {
  session.awaiting = null;
  if (!pending) return;
  const mine = ++turn;
  locating = true;
  setState("thinking");
  try {
    const gps = await getDevicePosition();
    if (mine !== turn) return; // stopped while the pop-up was open
    locating = false;
    const waiting = pending;
    pending = null;
    return ask(waiting.question, waiting.oneShot, gps);
  } catch (error) {
    if (mine !== turn) return;
    locating = false;
    trace("location", `couldn't get it: ${error?.message ?? error}`);
    session.awaiting = "place";
    placeTries = 0;
    await say("I couldn't get your location. Just tell me which city you're in.", { then: "listening" });
  }
}

async function retryPlace() {
  placeTries += 1;
  if (placeTries >= 2) {
    session.awaiting = null;
    pending = null;
    placeTries = 0;
    return say("No problem, we can skip the location.");
  }
  await say("Sorry, I didn't catch that. Which city are you in?", { then: "listening" });
}

// The backup button: starts or ends a conversation without needing the wake phrase.
// It says "End conversation" whenever you are in the middle of talking with Nion: a conversation
// you started, the follow-up window after "hey Nion", or Nion listening, thinking or answering.
// (Not while it says goodbye, or it would flip back to "End" the moment you tapped it.)
function inConversation() {
  if (sayingGoodbye) return false;
  return session.active || session.followUp || state === "listening" || state === "thinking" || state === "speaking";
}

function refreshConvoButton() {
  el.convo.textContent = inConversation() ? "End conversation" : "Start conversation";
  el.stop.hidden = !(state === "speaking" || state === "thinking"); // Stop only while there is something to stop
}

async function startConversation() {
  clearTimeout(followUpTimer);
  session.followUp = false;
  session.active = true;
  refreshConvoButton();
  session.awaiting = null;
  messages = [];
  const name = getName();
  await say(name ? `Hey ${name}, I'm listening. Go ahead.` : "I'm listening. Go ahead.");
}

async function endConversation() {
  pending = null;
  clearTimeout(followUpTimer);
  session.followUp = false;
  session.active = false;
  sayingGoodbye = true;
  refreshConvoButton();
  session.awaiting = null;
  messages = [];
  try {
    await say("Great, talk soon. Take care");
  } finally {
    sayingGoodbye = false;
    refreshConvoButton();
  }
}

// Details about the person's moment, so Nion can answer "what is today's date?".
function currentContext(isNewConversation) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    nowISO: now.toISOString(),
    // The person's own calendar date, so expenses are filed under the right day.
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localDateTime: now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    userName: getName() || undefined,
    isNewConversation,
  };
}

async function ask(question, oneShot, gps) {
  const mine = ++turn;
  setState("thinking");
  showProblem("");

  // A question outside any conversation starts a new one (and gets a greeting).
  // Otherwise the AI gets everything said so far, so follow-ups make sense.
  if (oneShot) {
    messages = [];
  }
  const thread = messages;
  thread.push({ role: "user", content: question });

  const controller = new AbortController();
  abortAsk = controller;
  const askTimeout = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
  // Waits for a "one moment" to finish, but not for ever.
  const fillerFinished = () =>
    Promise.race([fillerDone, new Promise((resolve) => setTimeout(resolve, FILLER_WAIT_MS))]);

  // If the answer is slow, say a short "one moment". The real answer then waits
  // until that has finished, so the two never overlap.
  let fillerDone = Promise.resolve();
  const fillerTimer = setTimeout(() => {
    if (mine !== turn || state !== "thinking") return; // already answered or interrupted
    const phrase = nextFiller();
    trace("filler", phrase);
    echo.text = phrase;
    echo.until = Infinity;
    filler.text = phrase;
    filler.until = Infinity;
    fillerDone = speak(phrase).then(() => {
      filler.until = Date.now() + ECHO_TAIL_MS;
    });
  }, FILLER_AFTER_MS);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nion-Visitor": visitorId() ?? "", "X-Nion-Pass": judgePass() ?? "" },
      signal: controller.signal,
      body: JSON.stringify({
        // Keep only the most recent turns so the request stays small.
        messages: thread.slice(-20),
        // In a started conversation Nion has already greeted you, so only a
        // one-shot question counts as "new" (and gets a greeting by name).
        context: currentContext(oneShot),
        // Fresh GPS numbers, or the place we already know, or nothing.
        location: gps ?? (known.place ? { text: known.place } : undefined),
        // A copy of the notebook: the server reads it, and answers with changes.
        data: loadData(),
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(`Server said ${response.status}`), { reason: body.reason });
    }
    const data = await response.json();

    clearTimeout(askTimeout);
    clearTimeout(fillerTimer);
    await fillerFinished(); // let "one moment" finish before the answer starts

    if (mine !== turn) {
      thread.pop(); // you interrupted while the AI was answering: drop that question
      return;
    }

    // The question depends on where the person is, and we don't know yet.
    if (data.needsLocation) {
      thread.pop(); // it'll be asked again once we know
      return askForLocation(question, oneShot, data.locationFailed);
    }

    const { reply } = data;
    showExchange(question, reply, data.sources, data);
    if (data.place) known.place = data.place; // worked out from GPS: remember it
    // Notebook changes (an expense, a list item...) are kept only for an answer we accept.
    if (data.changes?.length) applyChanges(data.changes);
    if (data.ui?.length) applyUi(data.ui); // the AI opened or closed a panel
    thread.push({ role: "assistant", content: reply });
    // Save it for the History screen (only questions that got an answer).
    historyId = recordExchange(historyId, question, reply, data.sources);
    const finished = await say(reply);
    // After an answer, leave the follow-up window open for a moment.
    if (finished && !session.active) openFollowUp();
  } catch (error) {
    clearTimeout(askTimeout);
    clearTimeout(fillerTimer);
    echo.until = Date.now() + ECHO_TAIL_MS; // a "one moment" may have been spoken
    thread.pop(); // the question got no answer, so take it back out
    if (mine !== turn) return; // that was us cancelling because you interrupted
    console.error(error);
    showProblem(
      PROBLEM_TEXT[error?.reason] ??
        "Nion couldn't get an answer. If this keeps happening, check the terminal where npm start is running."
    );
    await fillerFinished(); // let a "one moment" finish before saying this
    await say(error?.reason === "visitor" || error?.reason === "daily" ? BREAK : TROUBLE);
  }
}

// The last question and answer, shown quietly as text: for people who can't hear Nion
// well, for a noisy place, and so a viewer can see what Nion found and where from.
function showExchange(question, reply, sources = [], meta) {
  el.exchange.hidden = false;
  el.exQ.textContent = question ? `You: ${question}` : "";
  el.exA.textContent = reply ? `Nion: ${reply}` : "";
  const names = [...new Set(sources.map((source) => source.title || source.url))].slice(0, 4);
  el.exSources.textContent = names.length ? `Sources: ${names.join("; ")}` : "";
  el.exMeta.textContent = describeAnswer(meta); // which model answered, how fast, any search
}

// ---------- Notebook panels, opened by voice ----------
//
// "Show my to-do list" opens a panel on the page, and it stays open while you talk: add or
// remove things and it changes as you speak. Everything on it is also said aloud, so it is
// an extra, not something you have to look at. Closing it is "close it".

let activePanel = null;

function panelOptions() {
  return { now: Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, today: currentContext(false).today };
}

function renderPanel() {
  if (!activePanel) {
    el.panel.hidden = true;
    return;
  }
  const { title, text } = formatPanel(loadData(), activePanel, panelOptions());
  el.panelTitle.textContent = title;
  el.panelBody.textContent = text;
  el.panel.hidden = false;
}

function showPanel(name) {
  if (!PANELS.includes(name)) return false;
  activePanel = name;
  trace("panel", `open ${name}`);
  renderPanel();
  return true;
}

function hidePanel() {
  if (!activePanel) return false;
  activePanel = null;
  trace("panel", "closed");
  renderPanel();
  return true;
}

// Notebook changes are saved, and an open panel shows them straight away.
function applyChanges(ops) {
  const next = saveChanges(ops);
  if (activePanel) renderPanel();
  return next;
}

// Screen actions the AI asked for (open or close a panel).
function applyUi(actions = []) {
  for (const action of actions) {
    if (action?.ui === "show") showPanel(action.panel);
    else if (action?.ui === "hide") hidePanel();
  }
}

// Carries out a spoken or typed "show ..." / "close it", and returns what to say about it.
function runPanelCommand(command) {
  if (command.type === "open") {
    showPanel(command.panel);
    return spokenPanel(loadData(), command.panel, panelOptions());
  }
  return hidePanel() ? "Closed." : "Nothing is open right now.";
}

async function handlePanel(command) {
  const finished = await say(runPanelCommand(command));
  if (finished && !session.active) openFollowUp(); // so "add buy milk" needs no wake phrase
}
el.panelClose.addEventListener("click", () => hidePanel());

// Typing instead of talking. It shares where you are and your notebook with the voice
// side, but keeps its own conversation (see typed.js).
const typed = createTypedChat({
  known,
  getContext: currentContext,
  loadData,
  applyChanges,
  // Typed exchanges join the same History entry as spoken ones (this sitting's).
  recordExchange: (_ignored, question, reply, sources) => (historyId = recordExchange(historyId, question, reply, sources)),
});
let typing = false;
async function sendTyped(text) {
  if (!text || typing) return;
  typing = true;
  el.typedInput.value = "";
  // "Show my to-do list" / "close it": done at once, with no AI round trip, and shown as text.
  const panelCommand = matchPanelCommand(text);
  if (panelCommand) {
    showProblem("");
    showExchange(text, runPanelCommand(panelCommand));
    typing = false;
    return;
  }
  showProblem("");
  if (state === "speaking" || state === "thinking") interrupt(); // typing counts as speaking up
  showExchange(text, "Thinking…");
  const result = await typed.send(text);
  typing = false;
  if (result.needsPlace) showExchange(text, "Which city are you in? Type it and press Send.");
  else if (result.error) {
    showExchange(text, "");
    showProblem(PROBLEM_TEXT[result.reason] ?? "Nion couldn't get an answer. Please try again in a moment.");
  } else {
    showExchange(text, result.reply, result.sources, result.meta);
    if (result.ui?.length) applyUi(result.ui);
  }
}
el.typedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  return sendTyped(el.typedInput.value.trim());
});

// "Try saying": a few example requests, one tap each, for a first visit or a quiet place.
el.tryStrip.addEventListener("click", (event) => {
  const example = event.target?.dataset?.text;
  if (example) return sendTyped(example);
});

// Reminders: spoken aloud when their time comes, if Nion is open and idle. (If Nion was
// closed at the time, they are spoken the next time it is opened.) Saying one also keeps it
// in the conversation, so "remind me again in ten minutes" knows what it is about.
const reminders = createReminderScheduler({
  loadData,
  applyChanges,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  canSpeak: () => state === "waiting" && session.awaiting === null && !locating && pending === null,
  announce: async (text) => {
    trace("reminder", text);
    messages.push({ role: "assistant", content: text });
    showExchange("", text);
    const finished = await say(text);
    if (finished && !session.active) openFollowUp(); // leave room for "again in ten minutes"
  },
});
reminders.start();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reminders.check();
});

// A manual way to stop Nion, for when your voice can't be heard over its own (on
// laptop speakers the microphone hears Nion too): press Escape, or tap the circle.
function stopNion() {
  if (state !== "speaking" && state !== "thinking") return;
  const goodbye = sayingGoodbye;
  interrupt();
  if (goodbye) {
    // Cutting the goodbye short: the conversation is over, so wait for "Hey Nion" again.
    sayingGoodbye = false;
    session.followUp = false;
    clearTimeout(followUpTimer);
    setState("waiting");
  }
}
el.orb.addEventListener("click", stopNion);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") stopNion();
});

// Stop: cuts Nion off (its voice, or an answer it is still working on) and listens right away.
el.stop.addEventListener("click", stopNion);

el.convo.addEventListener("click", () => {
  if (state === "off") return;
  if (state === "speaking" || state === "thinking") interrupt();
  return inConversation() ? endConversation() : startConversation();
});

el.start.addEventListener("click", async () => {
  if (!voiceOk) {
    showProblem("This browser can't do hands-free voice. Please open Nion in Chrome, or type below.");
    return;
  }
  el.start.hidden = true;
  closeTour();
  el.convo.hidden = false;
  showProblem("");
  listener.start();
  wakeLock.enable();

  // First use: Nion asks your name once.
  if (!getName()) {
    session.awaiting = "name";
    await say("Hi, I'm Nion. What should I call you?", { then: "listening" });
  } else {
    setState("waiting");
    reminders.check(); // anything that came due while Nion was closed is said now
  }
});

if (!voiceOk) {
  el.start.hidden = true;
  el.status.textContent = "Voice works best in Chrome. You can type to Nion below.";
  showProblem("Hands-free voice needs Google Chrome (this browser can't do it reliably). You can still type to Nion below.");
}
