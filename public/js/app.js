// The conversation controller: carries out what Nion decides to do.
//
// conversation.js decides ("ask this question", "end the conversation"...).
// This file does the doing: listening, asking the server, speaking, and keeping
// the screen's status line up to date.
//
//   waiting   -> listening for "Hey Nion" (or, in a conversation, for anything you say)
//   listening -> waiting for your question or your name
//   thinking  -> asking Claude
//   speaking  -> reading something aloud
//
// Nion keeps listening in every state. If you start talking while it is thinking
// or speaking, it stops at once and listens to you, like a person would.

import { decide } from "./conversation.js";
import { parseUtterance } from "./wake.js";
import { isEcho, isInterruption, stripLeadingEcho } from "./echo.js";
import { createListener, speechInSupported } from "./speech-in.js";
import { speak, stopSpeaking, speechOutSupported } from "./speech-out.js";
import { getName, setName, clearName } from "./storage.js";
import { showState } from "./ui.js";

const el = {
  start: document.getElementById("start"),
  convo: document.getElementById("convo"),
  status: document.getElementById("status"),
  heard: document.getElementById("heard"),
  problem: document.getElementById("problem"),
  debug: document.getElementById("debug"),
  copylog: document.getElementById("copylog"),
};

const params = new URLSearchParams(location.search);

// Opening the page with ?reset forgets the saved name, to try first use again.
if (params.has("reset")) clearName();

// Opening the page with ?debug shows a log of what Nion hears and decides, which
// helps when something doesn't work the way it should.
const debugOn = params.has("debug");
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
let messages = []; // the conversation so far, sent to Claude each time
let nameTries = 0;
let questionTimer = null;

// Interrupting: every spoken line or question gets a "turn" number. If you
// interrupt, the number moves on, and anything still finishing from the old turn
// notices and quietly stops.
let turn = 0;
let abortAsk = null; // lets us cancel a question that is still waiting for Claude
// What Nion said last, and until when its voice may still be coming back through
// the microphone. Chrome reports words a moment late, so this keeps going for a
// few seconds after Nion stops.
const ECHO_TAIL_MS = 3500;
const echo = { text: "", until: 0 };

function statusText() {
  switch (state) {
    case "off": return "Tap the button to turn Nion on.";
    case "waiting":
      if (session.active) return "In a conversation. Just talk, or say “End the conversation.”";
      if (session.followUp) return "Go ahead, I'm still listening for a follow-up.";
      return "Waiting. Say “Hey Nion.”";
    case "listening":
      return session.awaiting === "name" ? "Listening for your name…" : "Listening…";
    case "thinking": return "Thinking…";
    case "speaking": return "Speaking…";
  }
}

function setState(next) {
  if (next !== state) trace("state", `${state} -> ${next}`);
  state = next;
  el.status.textContent = statusText();
  showState(next); // the icon
}

function showProblem(message) {
  el.problem.textContent = message;
  el.problem.hidden = !message;
}

const listener = createListener({
  onText: handleHeard,
  onInterim: handleInterim,
  onProblem: handleProblem,
  onEvent: (name) => trace("mic", name),
});

function handleProblem(reason) {
  if (reason === "mic-blocked") {
    listener.stop();
    setState("off");
    el.start.hidden = false;
    showProblem("Nion can't use the microphone. Allow it in Chrome's address bar, then tap the button again.");
  } else if (reason === "network") {
    showProblem("Chrome's speech recognition needs an internet connection.");
  }
}

// Say something. Listening stays on, so you can interrupt.
async function say(text, { then = "waiting" } = {}) {
  const mine = ++turn;
  echo.text = text;
  echo.until = Infinity; // its voice is coming through the speakers right now
  setState("speaking");
  await speak(text);
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
  if (!session.active) messages = []; // that conversation is over
  trace("follow-up window", "closed");
  if (state === "waiting") setState("waiting");
}

// Stop whatever Nion is doing, because you started talking.
function interrupt() {
  trace("interrupt", `was ${state}`);
  turn += 1;
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
  el.heard.textContent = `Hearing: “${text}”`;
  const busy = state === "speaking" || state === "thinking";
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
  el.heard.textContent = `Heard: “${text}”`;
  lastInterim = "";
  trace("final", `“${text}” (state ${state}, conversation ${session.active ? "on" : "off"}, awaiting ${session.awaiting ?? "nothing"})`);

  // Nion's own voice, coming back through the microphone, is not you talking.
  if (Date.now() < echo.until) {
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

  if (state === "speaking" || state === "thinking") interrupt();

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

    case "awaitQuestion":
      armQuestionWait();
      setState("listening");
      return;

    case "start":
      return startConversation();

    case "end":
      return endConversation();

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

// The backup button: starts or ends a conversation without needing the wake phrase.
function refreshConvoButton() {
  el.convo.textContent = session.active ? "End conversation" : "Start conversation";
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
  clearTimeout(followUpTimer);
  session.followUp = false;
  session.active = false;
  refreshConvoButton();
  session.awaiting = null;
  messages = [];
  await say("Okay, talk soon.");
}

// Details about the person's moment, so Nion can answer "what is today's date?".
function currentContext(isNewConversation) {
  const now = new Date();
  return {
    nowISO: now.toISOString(),
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

async function ask(question, oneShot) {
  const mine = ++turn;
  setState("thinking");
  showProblem("");

  // A question outside any conversation starts a new one (and gets a greeting).
  // Otherwise Claude gets everything said so far, so follow-ups make sense.
  if (oneShot) messages = [];
  const thread = messages;
  thread.push({ role: "user", content: question });

  abortAsk = new AbortController();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortAsk.signal,
      body: JSON.stringify({
        // Keep only the most recent turns so the request stays small.
        messages: thread.slice(-20),
        // In a started conversation Nion has already greeted you, so only a
        // one-shot question counts as "new" (and gets a greeting by name).
        context: currentContext(oneShot),
      }),
    });
    if (!response.ok) throw new Error(`Server said ${response.status}`);
    const { reply } = await response.json();

    if (mine !== turn) {
      thread.pop(); // you interrupted while Claude was answering: drop that question
      return;
    }
    thread.push({ role: "assistant", content: reply });
    const finished = await say(reply);
    // After an answer, leave the follow-up window open for a moment.
    if (finished && !session.active) openFollowUp();
  } catch (error) {
    thread.pop(); // the question got no answer, so take it back out
    if (mine !== turn) return; // that was us cancelling because you interrupted
    console.error(error);
    showProblem("Nion couldn't get an answer. Check the terminal where npm start is running.");
    setState("waiting");
  }
}

el.convo.addEventListener("click", () => {
  if (state === "off") return;
  if (state === "speaking" || state === "thinking") interrupt();
  return session.active ? endConversation() : startConversation();
});

el.start.addEventListener("click", async () => {
  if (!speechInSupported || !speechOutSupported) {
    showProblem("This browser can't do speech. Please open Nion in Chrome.");
    return;
  }
  el.start.hidden = true;
  el.convo.hidden = false;
  showProblem("");
  listener.start();

  // First use: Nion asks your name once.
  if (!getName()) {
    session.awaiting = "name";
    await say("Hi, I'm Nion. What should I call you?", { then: "listening" });
  } else {
    setState("waiting");
  }
});

if (!speechInSupported || !speechOutSupported) {
  el.start.hidden = true;
  showProblem("This browser can't do speech. Please open Nion in Chrome.");
}
