---
doc: spec
status: approved
---

# Nion — Technical Spec

## How This Works, In Plain Language

Nion is a **web app**: a page you open in the Chrome browser. Four pieces work together.

1. **The page (in your browser).** It does the listening and the talking. Chrome has built-in speech features: one turns your voice into text ("speech recognition"), and one reads text aloud ("speech synthesis"). The page also shows the small state icon, and it keeps your name and your past conversations in the browser's own storage, like a sticky note the browser keeps for one site.
2. **A small server (a program running on your laptop).** It exists for one reason: to hold your Claude API key safely. The page never sees the key. The page sends the server what you said, and the server passes it on.
3. **Claude (the brain).** The server asks Claude to answer. Claude can search the web for current things (news, places, directions) and tells us which sources it used. It is told to answer the way a person would on a phone call: short, spoken, no lists, no links.
4. **Your Chrome speaks the answer.** The page reads Claude's reply aloud, then goes back to listening.

Why this shape: it needs only one outside service (Claude). There is no database, no sign-in, and no framework to learn. Everything you need to read and debug is plain JavaScript in a handful of files.

The one thing a browser requires: you must **tap once** to turn Nion on, because browsers won't open the microphone or speak without a deliberate tap. After that tap everything is by voice, and the phone can go in a pocket.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

Example: first use, then "Hey Nion, what is today's date?"

1. **Open and tap.** You open `http://localhost:3000` in Chrome and tap the icon once. The page asks for microphone access. *(`public/js/app.js`, `speech-in.js`)*
2. **First-use name.** There's no name saved yet, so Nion says "Hi, I'm Nion. What should I call you?" aloud. You answer, and the name is saved in the browser. *(`storage.js`)*
3. **Waiting.** The icon shows the waiting state. The page keeps listening and ignores anything that doesn't contain the wake phrase. *(`wake.js`)*
4. **You say "Hey Nion, what is today's date?"** The page hears the text, sees the wake phrase, and keeps "what is today's date?". The icon changes to listening, then thinking. *(`app.js`, `ui.js`)*
5. **Ask the server.** The page sends the conversation so far, your name, the device's current date, time and time zone, and your location if it has one, to `POST /api/chat`. *(`public/js/app.js`)*
6. **Ask Claude.** The server builds the prompt (Nion's spoken-style rules plus your details) and calls Claude, allowing web search. It returns the short reply and any sources. *(`server/index.js`, `server/brain.js`, `server/prompt.js`)*
7. **Speak.** The page reads the reply aloud and the icon shows speaking. Listening stays on while it speaks: if you start talking, Nion stops at once (unless what it hears is just its own voice) and listens to you. *(`speech-out.js`)*
8. **Save.** The exchange is added to the current conversation in the browser's storage. *(`storage.js`)*
9. **Later.** Open the History screen to see the conversation as a transcript you can copy. *(`history.html`, `history.js`)*

**Conversation mode:** saying "Hey Nion, let's start a conversation" sets a flag, and from then on the wake phrase isn't needed until you say "End the conversation."

## Stack

| Piece | Choice | Why |
|---|---|---|
| Front end | Plain HTML, CSS and JavaScript (no framework) | Easiest to read and debug for a beginner. Fewer moving parts. |
| Server | Node.js (v22 is installed on this laptop) with Express | One small file serves the page and one endpoint. Express docs: https://expressjs.com |
| Brain | Claude API via the official `@anthropic-ai/sdk` package | Learner's choice. Web search with sources is built in, so no separate news or places service. Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview |
| Model | `claude-sonnet-5-5`, effort `low`, read from a setting so it can be swapped | Learner agreed to start here and change later if it feels slow. Faster and cheaper than Opus; `claude-haiku-5-5` is the faster fallback to try. Model list and pricing: https://platform.claude.com/docs/en/about-claude/models/overview |
| Hearing | The browser's speech recognition (Web Speech API) | No extra service or key. Docs: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition |
| Speaking | The browser's speech synthesis | Same reason. Docs: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis |
| Location | The browser's Geolocation API | Docs: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API |
| Storage | The browser's `localStorage` | Name and history stay on the device. Docs: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage |

Dependencies to install: `express` and `@anthropic-ai/sdk`. The `.env` file is loaded by Node's own `--env-file` option, so no extra package is needed.

**Unverified, check early in the build:**
- The exact shape of the web search tool's location field and the model's reply blocks (sources). Check the current Claude web search docs before writing the call.
- Whether Chrome's speech recognition reliably hears "Nion" (see Decisions and Open Issues).
- Current web search pricing per search (not looked up yet).
- Safari, Firefox and phone browsers: speech recognition is unreliable there, so Chrome is the supported browser for the proof of concept.

## Where It Runs and How Someone Tries It

- **Runs on:** your laptop, in Chrome. Needs Node.js 22 or newer and a Claude API key.
- **Setup:**
  1. `npm install`
  2. Copy `.env.example` to `.env` and put your own Claude API key in it. `.env` is ignored by git and never goes in the repo or chat.
  3. `npm start`
  4. Open `http://localhost:3000` in Chrome, tap the icon once, and allow the microphone.
- **For the demo recording:** screen-record Chrome on the laptop (earphones in) and talk through the four demo moments from `scope.md > What "Working" Looks Like`. Upload to YouTube or Vimeo.
- **Phone demo (stretch goal):** deploy to a free host connected to the GitHub repo so the app has a secure web address, put the API key in the host's settings, and open it on the phone in Chrome. Not required. Record the choice during `6-ship`.
- **Repository:** public on GitHub with an open-source license (MIT), a README with these steps, `.env.example`, and the planning docs in `devpost/`.

## Look and Feel

Carried from `prd.md > Look and Feel`. Dark, monotone glass.

- **Colors:** greys only, from near-black to near-white. Background a deep charcoal gradient (around #0b0c10 to #1a1c24). Glass panels are translucent white (about 8% opacity) with a soft 1px light border and background blur. Text near-white with a dimmer grey for secondary text. No accent colors.
- **Type:** the system sans-serif font (no web font download). The word "Nion" in small capitals with wide letter spacing. Calm and readable, nothing busy.
- **The state icon:** one medium circle of frosted glass in the center. Four icons, distinguished by shape and motion, not color: waiting (a quiet ring that slowly "breathes"), listening (a microphone with a soft pulse), thinking (three dots that bounce in turn), speaking (speaker waves that animate). Motion is turned off for people who set "reduce motion."
- **Density:** spacious and calm. The main screen has only the name, the icon, a quiet History link, and a short line of status text.
- **Tone of copy:** warm and brief, like a person.
- **Limit:** the browser's glass blur effect works in Chrome. Visuals are the same on laptop and phone widths.

## Components

### Main screen
Shows the wordmark, the state icon, a one-line status caption, a backup Start conversation / End conversation button, and a link to History. The first tap on the icon turns Nion on. After that, no taps are needed.
PRD ref: `prd.md > Screens and Layout`, `prd.md > Voice conversation`.
Files: `public/index.html`, `public/css/styles.css`, `public/js/ui.js`, `public/js/app.js`.

### State machine (the conversation controller)
Decides what Nion is doing: waiting, listening, thinking, or speaking, and whether a conversation is active. It is the single place that says "now think, now speak, now stop because you were interrupted." The decisions about what each thing heard means live in `public/js/conversation.js`, which `app.js` carries out.
PRD ref: `prd.md > Voice conversation`, `prd.md > States and Boundaries`.
File: `public/js/app.js`.

### Hearing
Wraps the browser's speech recognition. Listens continuously in English. When the browser stops listening on its own (it does this regularly), it restarts. Keeps listening while Nion thinks or speaks, and reports half-heard words quickly so Nion can stop the moment you start talking. `public/js/echo.js` recognises Nion's own voice coming back through the microphone so it doesn't interrupt itself.
PRD ref: `prd.md > Voice conversation`.
File: `public/js/speech-in.js`.

### Wake phrase and commands
A small, testable function that looks at what was heard and decides: is this "Hey Nion ..."? What is the question after it? Is it "let's start a conversation" or "end the conversation"? It accepts several spellings of the name, because the browser may write "Neon", "Nyan" or "Ryan."
PRD ref: `prd.md > Voice conversation`.
File: `public/js/wake.js`. Unit tests in `tests/wake.test.js`.

### Speaking
Wraps the browser's speech synthesis. Picks the best English voice available on the machine, speaks the reply, and says when it has finished so listening can resume.
PRD ref: `prd.md > Voice conversation`, `prd.md > Designed for ears, not screens`.
File: `public/js/speech-out.js`.

### Location
Asks the browser for the device's location only when the brain says a question needs it (never at startup). If it's denied or unavailable, Nion asks by voice: allow location, or say where you are. A spoken place ("I'm in Miami") is remembered for the rest of the conversation.
PRD ref: `prd.md > Where am I`, `prd.md > States and Boundaries`.
File: `public/js/location.js`.

### The brain (server)
Receives the conversation, builds the prompt, calls Claude with web search turned on, and returns the spoken reply plus sources. Its prompt carries Nion's rules: short spoken answers, plain words with no lists, symbols or links, at most five items before asking whether to continue, narrow or go deeper, one clarifying question for broad questions, understand rambling or messy speech and, for a long message, say back in one sentence what it understood before answering, name news sources aloud, say so when nothing is found, summarize markets but never advise buying or selling, give an opinion and a follow-up question on decisions, greet by name only at the start of a new conversation. If a local question comes without a location, it replies with a marker (`[[NEED_LOCATION]]`) that the page turns into the spoken fallback.
PRD ref: `prd.md > Designed for ears, not screens` (including the rambling-speech criterion), `prd.md > Questions Nion can answer`, `prd.md > Current events and sources`, `prd.md > A partner with a point of view`.
Files: `server/index.js`, `server/brain.js`, `server/prompt.js`.

### Name and conversations (browser storage)
Saves your name once, and each conversation (its turns, times, and any sources) so History can show it.
PRD ref: `prd.md > History and transcripts`, `prd.md > States and Boundaries`.
File: `public/js/storage.js`.

### History screen
Lists past conversations, newest first. Opening one shows its transcript with a Copy button.
PRD ref: `prd.md > History and transcripts`.
Files: `public/history.html`, `public/js/history.js`.

## Data Model

| Data | Where it lives | Updated when | When you leave and come back |
|---|---|---|---|
| Your name | Browser storage, key `nion.name` | Saved once at first use | Still there |
| Conversations | Browser storage, key `nion.conversations`: a list of `{id, startedAt, turns: [{role, text, at, sources?}]}` | A turn is added after each exchange | Still there, shown in History |
| The current conversation's messages | In memory in the page | Each turn | Gone when you close the tab (the saved copy remains in History) |
| Location | In memory in the page: `{lat, lon}` or a spoken place | When allowed or spoken | Asked again next time |
| Conversation mode on/off | In memory in the page | By voice command | Resets to off |
| API key and model name | `.env` on the laptop, read by the server | You edit it | Same |

There is no database and no account.

## File Structure

```
voice-companion/
├── server/
│   ├── index.js          # Express server: serves public/ and handles POST /api/chat
│   ├── brain.js          # Calls the Claude API (web search on); returns reply + sources
│   └── prompt.js         # Nion's spoken-style rules and how the prompt is assembled
├── public/
│   ├── index.html        # Main screen
│   ├── history.html      # History screen
│   ├── css/
│   │   └── styles.css    # Monotone glass look, state icon animations
│   └── js/
│       ├── app.js        # State machine and wiring everything together
│       ├── speech-in.js  # Hearing (browser speech recognition wrapper)
│       ├── speech-out.js # Speaking (browser speech synthesis wrapper)
│       ├── wake.js       # Wake phrase and voice command matching
│       ├── location.js   # Geolocation and the spoken-place fallback
│       ├── storage.js    # Name and conversations in browser storage
│       ├── ui.js         # State icon and status line
│       └── history.js    # History list and transcript view
├── tests/
│   └── wake.test.js      # Checks the wake phrase and commands
├── devpost/              # Devpost learning workspace (scope, PRD, spec, checklist)
├── .env.example          # Shows the setting names without any secret
├── .gitignore
├── LICENSE               # MIT
├── package.json          # Dependencies and the start and test commands
└── README.md             # How to run it and what it does
```

## External Services and Dependencies

### Claude API (Anthropic)
- **What for:** Nion's answers, plus web search for current information.
- **Call:** one `messages.create` request per turn from `server/brain.js`, through the `@anthropic-ai/sdk` package. It sends the model name, the system prompt, the conversation messages, and the web search tool. The server also handles the case where a search pauses a reply and needs to be continued.
- **Key:** `ANTHROPIC_API_KEY` in `.env`. Never pasted in chat, never committed.
- **Cost:** per token (Sonnet 5.5 was listed at $2 in and $10 out per million tokens when looked up on 2026-10-06), plus a per-search fee for web search that has not been looked up. Check before the demo.
- **Docs:** https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview and https://platform.claude.com/docs/en/about-claude/pricing
- **Rate limits:** not looked up; a few test requests per minute is far below normal limits.

### Browser features
- Speech recognition, speech synthesis, geolocation, and browser storage. No key, no cost. Speech recognition in Chrome sends your audio to the browser maker's speech service to turn it into text, so it needs an internet connection and the audio leaves the laptop.

## Important Failure Modes

- **The wake phrase isn't recognized** (the browser writes a different word) → the matcher accepts several spellings. If it still fails in a live demo, tapping the icon starts a turn as a backup. This is a fallback, not the main path.
- **Claude or web search is slow or fails** → the icon stays in "thinking," and after a time limit Nion says "I'm having trouble reaching my sources. Please try again." Nothing is saved for that turn.
- **Location is denied or unavailable** → Nion asks by voice: allow location, or tell me where you are (as in the PRD). A spoken place is used instead.
- **Laptop speakers echo into the microphone** → Nion filters out its own words (`echo.js`), but this is imperfect. Interrupting works well with earphones and only partly on speakers, so the demo and README say to use earphones. Learner confirmed this in testing.
- **Chrome writes "Hey Nion" as "Indian" or "anyone"** → common mishearings are accepted when followed by a request word, and a **Start conversation / End conversation** button is a backup.
- **Unsupported browser** (Safari, Firefox) → a plain screen says to open Nion in Chrome.
- **Missing API key** → the server stops at startup with a clear message naming `.env`.

## What Was Simplified and Why

- **Browser speech** instead of a paid cloud voice service — keeps one outside service, no extra keys. The voices sound less natural and phone browsers are less reliable. The fuller version would swap in a cloud speech service behind `speech-in.js` and `speech-out.js`.
- **One tap to start** instead of fully hands-free from launch — browsers refuse to open the microphone or speak until a tap. After the tap everything is by voice. This is a small change from `prd.md > The Core Journey`, which doesn't mention the tap.
- **The wake phrase is text matching** on what the browser heard, instead of a dedicated wake-word engine. It works while the page is open; it can't work with the screen off.
- **Browser storage instead of a database** — history and name stay on the device. Fuller version: accounts and a database.
- **No streaming of the reply.** Replies are short, so waiting for the whole answer is simpler. A fuller version would start speaking while the answer is still arriving.
- **Chrome only** for the proof of concept.
- **Local first, hosted later** — the laptop demo is the safe path; a hosted phone version is optional.

## Decisions and Open Issues

### Changed during the build
- **Interrupting is in, and conversation decisions are in their own file.** After the first hands-on try, the learner needed Nion to stop and listen when interrupted, so Nion keeps listening while it thinks and speaks. This replaces the earlier "stop listening while speaking" simplification. The tradeoffs: laptop speakers can feed Nion's voice back into the microphone (guarded by `echo.js`, and earphones avoid it entirely), and on an iPhone an open microphone can lower playback quality (a known browser issue), which makes the phone attempt a little more fragile.

### Learner choices
- Web app, laptop first, phone as a stretch goal. The laptop version is the safe fallback and is built and recorded first. The phone version is also attempted: if it works well it becomes the headline demo; if not, the laptop recording is the submission. The phone attempt is time-boxed, and it is tested early. On an iPhone every browser (including Chrome) uses Apple's engine, which has weak speech support, so an Android phone with Chrome is the better bet.
- Claude as the brain, with the whole project on a single outside service.
- Start with Sonnet 5.5 at low effort and "change later if it feels unresponsive or slow."
- Public GitHub repo plus a recorded demo; deployment optional.
- Everything in the PRD stays in scope, with History last if time runs short.

### Derived by the agent from those choices (for you to confirm in review)
- Express as the server, plain JavaScript on the front end, Node's own `--env-file` for settings.
- The `[[NEED_LOCATION]]` marker, wake-phrase spellings, and the one-tap start.
- Browser storage key names and the data shapes above.
- A small automated test only for the wake-phrase matcher (the one piece of pure logic); everything else is checked by hand against the PRD criteria.

### The useful unknown
**"How will we know if it's too slow or unresponsive?"** (the learner's own concern). Plan: during the build, time five sample questions, from the end of speech to the first spoken word, for a plain question, a date, a time in another city, a place search, and a news question. Compare Sonnet 5.5 and Haiku 5.5, then decide together. This is checked with real numbers during `5-build`.

### Still open
- **Does Chrome hear "Nion" reliably?** Test with the matcher and real speech early (carried over from `prd.md > Open Questions`; pronunciation still to be chosen).
- **How is location passed to web search?** The browser gives coordinates, search may want a city. If needed, a small lookup is added in the build.
- **Where current information comes from** is settled: Claude's web search. Quality for places and directions will be judged in the build; if poor, the fallback is a narrower, clearly labeled demo set.
- **Delete a conversation in History** — still Later (carried from `prd.md > Open Questions`).
- **Nion's default voice** — can wait. (Interrupting moved into the first version; see "Changed during the build" above.)
