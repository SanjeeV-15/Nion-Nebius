---
doc: checklist
status: approved
---

# Build Checklist

Build mode: learn

## Slices

- [x] **1. You say "Hey Nion, what is today's date?" and hear Nion answer aloud**
  Becomes usable: A running app in Chrome. You tap once, say the wake phrase plus a question, and Nion speaks a short answer from Claude. A line on screen shows what Chrome heard. This is the kernel loop: hear, think, speak.
  Why now: It proves the riskiest, most important path first (can Chrome hear "Nion," can Claude answer, can the page speak back) and leaves every later slice a working place to land. Project setup is part of this slice.
  PRD ref: `prd.md > The Core Journey` (steps 1-4), `prd.md > Voice conversation`
  Spec ref: `spec.md > How This Works, In Plain Language`, `spec.md > Stack`, `spec.md > Components > Hearing`, `spec.md > Components > Speaking`, `spec.md > Components > Wake phrase and commands`, `spec.md > Components > The brain (server)`, `spec.md > File Structure`, `spec.md > Where It Runs and How Someone Tries It`
  Build: Scaffold the project per the spec's file structure (`package.json` with `express` and `@anthropic-ai/sdk`, `server/`, `public/`, `tests/`), add the MIT `LICENSE` and a short `README.md`, and read the API key from `.env`. Add the wake-phrase matcher that accepts several spellings, hearing, speaking, a tap-to-start page that shows what Chrome heard, and a server endpoint that asks Claude (Sonnet 5.5, low effort, with the device date, time and time zone in the prompt) for a short spoken-style reply.
  Verify (mechanical): `npm install` succeeds. `npm test` passes the wake-phrase tests (including "hey neon", "hey nyan" and "hey nion"). `npm start` boots, and a test request to `/api/chat` with a date question returns a non-empty reply containing today's date.
  Learner check: Open `http://localhost:3000` in Chrome, tap once, allow the microphone, say "Hey Nion, what is today's date?" and confirm you hear the answer without touching the screen. Tell me what the "heard" line showed when you said "Nion."
  Commit: `Add voice loop: hear Hey Nion, ask Claude, speak the answer`

- [x] **2. Nion learns your name and keeps a conversation going by voice**
  Becomes usable: On first use Nion asks your name and remembers it. "Hey Nion, let's start a conversation" lets you keep talking without the wake phrase until you say "End the conversation." Nion greets you by name once per conversation.
  Why now: The "like a phone call" feeling depends on follow-ups without repeating the wake phrase, and it is the heart of the kernel. Moved up to second place after your first hands-on try, because saying "Hey Nion" every time was the biggest friction you felt.
  PRD ref: `prd.md > Voice conversation`, `prd.md > A partner with a point of view`, `prd.md > States and Boundaries` (first use, what persists)
  Spec ref: `spec.md > Components > State machine (the conversation controller)`, `spec.md > Components > Wake phrase and commands`, `spec.md > Components > Name and conversations (browser storage)`, `spec.md > Data Model`
  Build: Add name storage and the first-use question, the start and end commands, conversation mode, sending the conversation so far to the server, and the "new conversation" flag so the greeting happens once.
  Verify (mechanical): Tests pass for the start and end commands and the conversation state changes. A two-turn test request shows the name greeting in the first reply and not in the second.
  Learner check: Clear Nion's saved name, open it, answer the name question, then start a conversation, ask two follow-up questions without the wake phrase, and end it. Confirm it stops answering after "End the conversation."
  Commit: `Add first-use name and voice-controlled conversations`

- [x] **3. Phone check: open Nion on your phone through a temporary secure link**
  Becomes usable: A temporary secure web address that opens your laptop's Nion on your phone, so you find out early whether the phone version works. This is a time-boxed experiment with one honest attempt.
  Why now: The spec says to test the phone early. If it fails (for example on an iPhone), we find out now and keep the laptop demo as the plan, with no time lost later.
  PRD ref: `prd.md > Open Questions` (carried from the spec's phone goal)
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Decisions and Open Issues`
  Build: Add a short README section and a helper command for a temporary tunnel. I will ask before installing or downloading any tunnel tool. The link is public while it runs, so it is only run during testing and stopped afterwards.
  Verify (mechanical): The temporary link returns a healthy response from the app's health check and serves the page.
  Learner check: Open the link on your phone in Chrome, tap once, allow the microphone, say "Hey Nion, what is today's date?" and tell me exactly what happens (nothing heard, wrong words, or it works).
  Commit: `Add phone check instructions`

- [x] **4. Nion looks like Nion: a glass state icon that shows waiting, listening, thinking and speaking**
  Becomes usable: The same voice loop, now with the monotone glass look and one medium icon that changes shape and motion for each of the four states.
  Why now: Conversation mode and the phone check are in place, so now the screen gets its real look. Everything after this slice (search, location, History) shows up in that look.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Look and Feel`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Look and Feel`, `spec.md > Components > Main screen`, `spec.md > Components > State machine (the conversation controller)`
  Build: Add the page layout (wordmark, medium glass icon, one-line status caption), the four icons and their motion (respecting "reduce motion"), the monotone palette, and wire the icon to the conversation controller so it follows listening, thinking and speaking.
  Verify (mechanical): Tests still pass. Load the page in a browser, switch the icon through all four states from the page's script, and confirm each state changes the icon and its label. Take a screenshot to confirm the glass layout renders.
  Learner check: Open the page and say "Hey Nion, what time is it in Denver?" Watch the icon change as it listens, thinks and speaks. Say whether it feels sleek and monotone, and whether you can tell the four states apart.
  Commit: `Add monotone glass look and four-state icon`

- [x] **5. Designed for ears: short spoken answers, five items at most, and it handles rambling**
  Becomes usable: Nion answers the way a person would on a call: short, no lists or links, at most five items before asking whether to continue, narrow or go deeper, one clarifying question for broad questions, a one-sentence "here's what I understood" after a long ramble, and an opinion plus a follow-up on decisions.
  Why now: This is Nion's difference from Siri and ChatGPT, so it has to be right before the features that depend on it (search, location).
  PRD ref: `prd.md > Designed for ears, not screens`, `prd.md > A partner with a point of view`
  Spec ref: `spec.md > Components > The brain (server)`
  Build: Write Nion's spoken-style rules into the prompt and add a small reply-check script with sample questions.
  Verify (mechanical): The reply-check script runs about six sample questions (a many-items question, a broad Nobel Prize question, a rambling message, the cake decision) and confirms replies have no markdown or links, list at most five items, ask a follow-up question where expected, and restate a long ramble.
  Learner check: Ask the four sample questions aloud and say whether Nion sounds like a thoughtful person or a search engine, and what you would change.
  Commit: `Add spoken-answer rules for Nion`

- [x] **6. Current events with sources spoken aloud**
  Becomes usable: Nion answers news and markets questions using web search, says which source each point comes from, says so when it finds nothing, and summarizes markets without telling you what to buy or sell.
  Why now: It is the riskiest outside dependency after the voice loop (search tool shape, slower replies, cost), so we find problems before the location slice builds on it.
  PRD ref: `prd.md > Current events and sources`, `prd.md > Questions Nion can answer`, `prd.md > Non-Goals`
  Spec ref: `spec.md > External Services and Dependencies > Claude API (Anthropic)`, `spec.md > Components > The brain (server)`, `spec.md > Important Failure Modes`
  Build: Turn on Claude's web search in the server call, handle a search that pauses mid-reply, return the sources with the reply, and add the rules about naming sources, saying when nothing is found, and not giving investment advice.
  Verify (mechanical): A news question returns a reply that names a source and includes a sources list. A deliberately obscure question returns a "couldn't find any source" reply. A markets question contains no buy or sell advice. The Console's usage page, or the server's log, shows how many searches were used.
  Learner check: Ask "What's the latest world news?" and "How is the stock market doing today?" and tell me whether the sources are named aloud and how long the wait feels.
  Commit: `Add web search with spoken sources`

- [x] **7. Where am I: Nion asks by voice when it doesn't know your location**
  Becomes usable: "What are some places to eat around me, ranked by price?" works: with location allowed, or by you saying "I'm in Brickell, Miami." If Nion has no location, it asks aloud instead of using a pop-up.
  Why now: Local suggestions are one of the demo moments, and passing location to web search is an unproven piece we want to learn about while there is still time.
  PRD ref: `prd.md > Where am I`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Components > Location`, `spec.md > Decisions and Open Issues`
  Build: Add the browser location request (only when needed), the spoken fallback marker, the spoken-place handling that is remembered for the conversation, and pass the location to web search.
  Verify (mechanical): A request with no location returns the "needs location" marker. A request with a spoken place returns places in that city. Tests cover the spoken-place parsing.
  Learner check: Block location, ask for places to eat around you, hear Nion ask, say your city, and hear up to five places with price and cuisine and a question. Then allow location and ask again.
  Commit: `Add location handling with spoken fallback`

- [x] **8. History: past conversations as transcripts you can copy**
  Becomes usable: Every conversation is saved on the device. A History screen lists them, and opening one shows the transcript with a Copy button.
  Why now: It is the least important piece for proving the idea, so it comes last among the features and is the first to drop if time runs short.
  PRD ref: `prd.md > History and transcripts`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Components > History screen`, `spec.md > Components > Name and conversations (browser storage)`, `spec.md > Data Model`
  Build: Save each conversation's turns and sources in browser storage as they happen, add `history.html` and `history.js`, and link them from the main screen.
  Verify (mechanical): Tests confirm the saved data shape. Load the History page with sample saved data in a browser and confirm the list, an opened transcript and the Copy button work.
  Learner check: Have a short conversation, open History, open it, press Copy, and paste it somewhere to confirm the text.
  Commit: `Add conversation history with copyable transcripts`

- [ ] **9. When things go wrong, and how fast it feels**
  Becomes usable: Nion handles the realistic failures gracefully (unsupported browser, Claude or search failing, missing key), and we measure how fast it responds so we can decide on the model.
  Why now: The demo must survive a bad moment, and your "change the model if it feels slow" decision needs real numbers.
  PRD ref: `prd.md > States and Boundaries`, `prd.md > Product Decisions`
  Spec ref: `spec.md > Important Failure Modes`, `spec.md > Decisions and Open Issues` (the speed question), `spec.md > Where It Runs and How Someone Tries It`
  Build: Add the "use Chrome" screen, the spoken "trouble reaching my sources" message with a time limit, the clear startup message for a missing key, a timing script for five sample questions, and finish the README with run steps.
  Verify (mechanical): Starting without a key prints a clear message. A request with a deliberately wrong key makes the page speak the trouble message. The timing script reports the time for five questions on Sonnet 5.5 and Haiku 5.5. All tests pass.
  Learner check: Temporarily break the key in `.env` and hear Nion's trouble message, restore it, and tell me which model's speed feels better once you see the numbers.
  Commit: `Add failure fallbacks, speed check and README`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 2 (name and voice-controlled conversations)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not yet done
Route and stops: not yet done
Edit outcome: not yet done
Reflection: not yet done
Activity mode: not yet done

## Revisions
- Conversation mode (name, start and end by voice) moved ahead of the glass look — the first hands-on try of slice 1 showed that repeating "Hey Nion" on every question was the biggest friction, and the conversation feel is the kernel.
- Conversation decisions (what to do with each thing Nion hears) live in a small testable `public/js/conversation.js` that `app.js` calls, instead of all inside `app.js` — an internal change that keeps the same behavior and makes it checkable with `npm test`.
- Interrupting moved into the first version: Nion keeps listening while it thinks and speaks, and stops the moment the person talks (with a guard against hearing its own voice). The plan had said "no interrupting" and "stop listening while speaking". The learner's first hands-on try of slice 2 showed that Nion talking over them broke the phone-call feeling. Updated `prd.md` (Voice conversation, Product Decisions, Open Questions) and `spec.md` (Hearing, State machine, Simplified, Decisions).
- The "end the conversation" command now tolerates mishearing and close variants ("goodbye", "I'm done", "and the conversation" when it is the whole phrase) because Chrome did not reliably write the phrase.
- Phone check result: on an iPhone, through a temporary Cloudflare tunnel, speech recognition, the first-use name question, spoken answers and interrupting all worked, so the phone is a viable demo path (the spec had expected iPhones to be the weak case). It still needs a permanent secure address (hosting) for a real phone demo, the screen must stay on, and speech recognition on the phone mis-wrote "Hey Nion" in several ways, so the wake phrase now accepts them.
- A 15 second follow-up window was added after each answer: the learner said twice that repeating "Hey Nion" before every question broke the phone-call feeling, and in the iPhone test every question was a one-shot. Added to `prd.md` (Voice conversation, Product Decisions) and `spec.md` (Decisions, Data Model), with tests.
- A short "one moment" is spoken when an answer takes more than about 2 seconds (mostly web searches): the learner liked the idea after trying search, which takes 3 to 6 seconds. Added to `prd.md` (Current events and sources, Product Decisions) and `spec.md` (Decisions), with tests.
- Location uses a free OpenStreetMap lookup in addition to Claude, so "near me" means the neighbourhood and not the whole city. The spec had Claude as the only outside service; testing showed Claude gets the city right but guesses neighbourhoods wrongly. Recorded in `spec.md` (External Services, Decisions) and `prd.md` (Product Decisions). The learner should know the person's coordinates go to OpenStreetMap for this lookup.
- While testing slice 7, an echo-filter bug was found and fixed: when Nion asks "say use my location", the natural answer repeats those words and was being discarded as Nion's own voice. Short answers are now let through while Nion is waiting for one.
- Replies are now limited to about 60 words: a real location test produced a 38 second spoken answer, and measuring showed local and news answers ran 60 to 120 words (25 to 45 seconds). Recorded in `prd.md` and `spec.md`.
- "End the conversation, thank you" (heard as "and the conversation thank you") now ends the conversation.

