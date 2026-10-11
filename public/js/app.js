// The conversation controller: the one place that decides what Nion is doing.
//
//   waiting   -> listening for "Hey Nion"
//   listening -> heard "Hey Nion" on its own, now waiting for the question
//   thinking  -> asking Claude (we stop listening so Nion never hears itself)
//   speaking  -> reading the answer aloud
//
// After speaking, Nion goes back to waiting.

import { parseUtterance } from "./wake.js";
import { createListener, speechInSupported } from "./speech-in.js";
import { speak, speechOutSupported } from "./speech-out.js";

const el = {
  start: document.getElementById("start"),
  status: document.getElementById("status"),
  heard: document.getElementById("heard"),
  problem: document.getElementById("problem"),
};

const STATUS_TEXT = {
  off: "Tap the button to turn Nion on.",
  waiting: "Waiting. Say “Hey Nion.”",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

let state = "off";
let waitingForQuestion = false; // true after a lone "Hey Nion"
let questionTimer = null;

function setState(next) {
  state = next;
  el.status.textContent = STATUS_TEXT[next];
}

function showProblem(message) {
  el.problem.textContent = message;
  el.problem.hidden = !message;
}

const listener = createListener({ onText: handleHeard, onProblem: handleProblem });

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

function handleHeard(text) {
  if (!text) return;
  el.heard.textContent = `Heard: “${text}”`;

  // Ignore anything heard while Nion is busy.
  if (state !== "waiting" && state !== "listening") return;

  // After a lone "Hey Nion", whatever comes next is the question.
  if (waitingForQuestion) {
    waitingForQuestion = false;
    clearTimeout(questionTimer);
    ask(text);
    return;
  }

  const result = parseUtterance(text);
  if (!result.woke) return; // not for Nion: ignore it

  if (result.question) {
    ask(result.question);
  } else {
    waitingForQuestion = true;
    setState("listening");
    // If nothing follows, give up and go back to waiting.
    questionTimer = setTimeout(() => {
      waitingForQuestion = false;
      setState("waiting");
    }, 8000);
  }
}

// Details about the person's moment, so Nion can answer "what is today's date?".
function currentContext() {
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
  };
}

async function ask(question) {
  setState("thinking");
  listener.stop(); // don't listen while thinking or speaking
  showProblem("");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
        context: currentContext(),
      }),
    });
    if (!response.ok) throw new Error(`Server said ${response.status}`);
    const { reply } = await response.json();

    setState("speaking");
    await speak(reply);
  } catch (error) {
    console.error(error);
    showProblem("Nion couldn't get an answer. Check the terminal where npm start is running.");
  }

  setState("waiting");
  // A short pause so the end of Nion's own voice isn't picked up as a new question.
  setTimeout(() => listener.start(), 300);
}

el.start.addEventListener("click", () => {
  if (!speechInSupported || !speechOutSupported) {
    showProblem("This browser can't do speech. Please open Nion in Chrome.");
    return;
  }
  el.start.hidden = true;
  showProblem("");
  setState("waiting");
  listener.start();
});

if (!speechInSupported || !speechOutSupported) {
  el.start.hidden = true;
  showProblem("This browser can't do speech. Please open Nion in Chrome.");
}
