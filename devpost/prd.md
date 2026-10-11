---
doc: prd
status: approved
---

# Nion — Product Requirements

Nion is a voice-first companion for travelers and anyone on the move. You talk to it and it talks back, so you can get answers and think things through without looking at a screen. It is designed for ears, not screens.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`, `scope.md > The Core Loop`.

## The Core Journey

1. **Open the app.** The person opens Nion on their phone, puts in earphones, and puts the phone away. For the proof of concept the app stays open and the screen stays on, but they never need to touch it. (`scope.md > The POC Boundary`)
2. **Wake Nion by voice.** They say "Hey Nion" followed by a question, for example "Hey Nion, what is today's date?", or "Hey Nion, let's start a conversation."
3. **Nion shows it is listening.** A small state icon changes to show it is listening, then thinking, then speaking.
4. **Nion answers aloud.** It speaks a short answer designed to be heard, not read. It never says "see the link" or "here's what I found, go look at it."
5. **Nion offers a next step by voice.** When an answer has several parts, it speaks up to five items, then stops and asks whether to continue, narrow down, or go deeper.
6. **The conversation continues by voice.** In a started conversation, the person just keeps talking, without saying "Hey Nion" each turn. Nion can follow up, ask a clarifying question, or offer an opinion.
7. **End by voice.** The person says "End the conversation" and Nion stops listening.
8. **Look back later (optional).** The person can open the history screen to see past conversations as transcripts and copy the text.

Success: the person asks several different questions and gets spoken answers, and never has to look at or touch the screen to get them.

## Screens and Layout

Two surfaces, both simple.

- **Main screen.** One central state icon, medium size (not a large button), shows what Nion is doing. A small label or title says "Nion." A way to reach History sits unobtrusively. Nothing else.
- **History screen.** A list of past conversations. Opening one shows its full transcript, which the person can copy.

Navigation: Main screen to History and back. There is no other screen.

## Look and Feel

- Modern, sleek, stylish, and realistic.
- Monotone: shades between black and white, not colorful.
- Glass-like feel (frosted, translucent surfaces), suited to a phone.
- Because there are no state colors, the four states must look different through **icon shape and motion**, not color.
- Easy to use at a glance. Nothing busy.
- Avoid: bright color palettes, large chunky buttons, generic colorful AI-app styling.

## Features and Behavior

### Voice conversation

- As a traveler with my hands full, I want to talk to Nion and hear it answer so that I don't have to look at my phone.
  - [ ] Saying "Hey Nion" plus a question gets a spoken answer without touching the screen.
  - [ ] The state icon visibly differs for waiting, listening, thinking, and speaking.
  - [ ] Saying "Hey Nion, let's start a conversation" starts a conversation where I can keep talking without repeating "Hey Nion."
  - [ ] Saying "End the conversation" ends it, and Nion stops listening. Close variants work too (for example "goodbye" or "I'm done"), and Nion copes when Chrome mishears the phrase.
  - [ ] After Nion answers, I can ask a follow-up within 15 seconds without saying "Hey Nion" again, and Nion remembers what we just said. After 15 quiet seconds Nion goes back to waiting for the wake phrase.
  - [ ] If I start talking while Nion is thinking or speaking, Nion stops at once and listens to me, and what I say next is treated as my new question.

### Designed for ears, not screens

- As a traveler, I want answers I can listen to so that I never need to read a list or open a link.
  - [ ] Spoken answers are short.
  - [ ] When an answer has several items, Nion speaks at most five, then stops and asks whether I want more, want it narrowed down, or want it to go deeper.
  - [ ] Nion never tells me to look at a screen, a link, or a list.
  - [ ] When a question is too broad (for example, "who won the Nobel Prize?"), Nion asks one short clarifying question first (for example, which field).
  - [ ] When I ramble, with filler words, false starts or several questions in one breath, Nion gets the point and answers it. For a long or messy message, it first says back in one sentence what it understood.

### Questions Nion can answer

- As a traveler, I want to ask about my surroundings, the time, getting around, current events, and general knowledge.
  - [ ] "What is today's date?" gets a spoken answer in the form "Today's date is October 11, Sunday."
  - [ ] "What is the time in Denver?" gets the correct current time spoken aloud.
  - [ ] "What are some places to eat around me, ranked by price?" gets up to five places with price and cuisine, then a question about narrowing down or continuing.
  - [ ] "How do I get from Denver International Airport to Union Station?" gets a spoken answer with a few options.
  - [ ] General knowledge and world questions (for example, Nobel or Oscar winners, "why do octopuses have three hearts?") get a spoken answer.

### Current events and sources

- As a traveler, I want to hear what's going on in the world so that I stay informed without reading.
  - [ ] For news and current-events questions, Nion uses multiple sources and says aloud which source each point comes from (for example, "according to Reuters...").
  - [ ] Stock and market questions get a short spoken summary of how the market and well-known stocks are doing. Nion summarizes; it does not tell the person what to buy or sell.
  - [ ] If an answer takes more than about two seconds (usually because Nion is searching), Nion says a short "one moment" first so I know it hasn't stalled. Quick answers don't get one.
  - [ ] If no source covers the question, Nion says it couldn't find any source that mentioned it.

### Where am I

- As a traveler, I want local suggestions so that I can find food and places near me.
  - [ ] If Nion doesn't have the person's location, it says aloud that they can either allow location services or just tell it where they are.
  - [ ] If the person says where they are (for example, "I'm in Miami"), Nion continues the earlier question using that place.
  - [ ] The person can give a city, a state, or a specific street address.

### A partner with a point of view

- As a person facing a small decision, I want Nion to talk it through with me so that it feels like a call with a thoughtful person.
  - [ ] When I describe a decision (for example, the cake example), Nion gives an opinion and asks a follow-up question.
  - [ ] The first time I use Nion, it asks my name by voice and remembers it.
  - [ ] Nion greets me by name at the start of each new conversation, not on every turn within a conversation.

### History and transcripts

- As a person, I want to look back at what I asked.
  - [ ] After a conversation, it appears in History with its transcript.
  - [ ] I can open a past conversation and copy its transcript text.

## States and Boundaries

- **First use** — Nion needs microphone access to hear the person. (Assumption: asked at first launch with a short explanation. Location access is requested only when a local question needs it, by voice as described above.) Nion then asks the person's name once, by voice.
- **Waiting** — Nion is ready and listening for "Hey Nion." The icon shows an idle state.
- **Listening** — Nion is hearing the question. The icon shows listening.
- **Thinking** — Nion is looking something up and may take a moment. The icon shows thinking.
- **Speaking** — Nion is talking. The icon shows speaking.
- **Not found** — Nion says it couldn't find a source for the question.
- **No location** — Nion asks aloud whether to allow location or have the person say where they are.
- **What persists** — Past conversations and their transcripts, and the person's name, persist between sessions on the device.
- **Privacy boundary** — Transcripts are the person's own; nothing is shared with others.

## Product Decisions

- **Voice only, screen on for the proof of concept.** The learner decided the demo is "we talk to it and it talks back." Screen-off and background listening are Later because they are the hardest part and not needed to prove the idea.
- **Designed for ears, not screens is the differentiator.** The learner chose this as the main target because it's the whole reason Nion exists, and it separates Nion from general assistants that show links and lists.
- **Up to five items, then ask.** The learner chose five as the point where Nion stops and asks whether to continue, narrow, or go deeper.
- **Replies stay under about 60 words.** In the first real location test, a places answer ran 38 seconds of speech, far too long to listen to. Measured replies were 60 to 120 words (25 to 45 seconds). With a stated limit, each list item gets only a short phrase (name, price level, cuisine) and replies now run 44 to 61 words (17 to 23 seconds).
- **Five is a hard cap for open-ended lists, even if you ask for more.** Places, ideas and results are capped at five, then Nion offers more. A short fixed set everyone knows (the planets, days of the week) may be said in full. Found while testing: asked for "all" or "ten", Nion sometimes said more than five, so the rule now says it holds even then, and includes teasers.
- **Clarify broad questions first.** For example, asking which Nobel field.
- **A short "one moment" when an answer is slow.** Web searches take 3 to 6 seconds, longer than the 1 to 2 seconds of a normal answer. The learner liked the idea of Nion saying something while it searches, so after about two seconds Nion says "One moment," "Let me check," and similar (varying them). The real answer waits for it to finish.
- **Understands rambling speech.** The learner wants Nion to cope with messy, long speech (like Wispr Flow's cleanup), so it understands the point and says back what it understood in one sentence when the message is long. Showing a tidied-up version of what the person said in History is Later.
- **Name sources aloud for news.** If nothing is found, say so.
- **Location precision.** "Near me" uses the person's neighbourhood, not just their city, because the learner's main example is walking through an airport looking for food. GPS numbers are looked up with OpenStreetMap's free service; the coordinates are not stored.
- **Fix for missing location is spoken.** The learner wants Nion to say "allow location, or tell me where you are" instead of relying on a pop-up.
- **Monotone glass look.** Modern, sleek, between black and white, so state is shown by icons.
- **History and transcripts together.** Transcripts live inside history; the person can copy them.
- **Called Nion**, taken from the last letters of "Companion."
- **A 15 second follow-up window after every answer.** After trying it, the learner said twice that having to say "Hey Nion" before every question broke the phone-call feeling. Nion now stays attentive for 15 seconds after answering, restarting while the person is talking, then returns to waiting for the wake phrase. Tradeoff: in a noisy place, people talking nearby could be heard as questions during the window, so it is kept short. The length is one setting that can be changed. "Start a conversation" still stays open with no time limit.
- **A backup button starts and ends a conversation.** In testing, Chrome often wrote "Hey Nion" as "Indian" or "anyone", so the wake phrase missed. The button keeps the demo reliable; the voice commands remain the main path.
- **Interrupting is in the first version.** After trying it, the learner found that Nion talking over them broke the "like a phone call" feeling. Nion keeps listening while it thinks and speaks and stops the moment the person talks. Tradeoff: on laptop speakers the microphone can hear Nion's own voice, so Nion filters out anything that is mostly what it is saying; earphones avoid the problem.
- **Name asked once by voice, greeting once per conversation.** Nion asks the person's name the first time it is used. It greets them by name when a new conversation starts, not every turn, so it feels natural and not repetitive.

## What We're Building

- The main screen with a medium state icon showing waiting, listening, thinking, and speaking.
- Voice in and voice out: "Hey Nion" plus a question, and spoken answers.
- Conversation mode started and ended by voice.
- Short spoken answers: up to five items, then ask whether to continue or narrow down.
- Clarifying questions for broad questions.
- Questions about the date, time in other cities, local suggestions, getting around, general knowledge, and current events with named sources.
- The spoken fallback when location is unavailable.
- Opinions and follow-up questions for small decisions, and addressing the person by name.
- History with transcripts that can be copied.
- Monotone glass look.

## Deferred From the POC

- **Screen-off and background listening, the floating dot widget.** Phones restrict apps from listening when the screen is off. Hardest piece, not needed for the proof.
- **Settings for speed, tone, and voice.** A single default is enough to prove the idea.
- **Learning from past conversations.** Needs stored memory and added complexity.
- **Your own stocks and portfolio.** Needs access to personal accounts.
- **Checking messages and email, to-do lists, reminders, booking.** Needs account access and actions on the person's behalf.
- **Custom catchphrase.** "Hey Nion" only for now.
- **A tidied-up transcript of what the person said.** History shows what was heard; a cleaned-up, Wispr Flow-style version is a separate feature and isn't needed to prove the idea.
- **Watch and other devices.**

## Possible Later Enhancements

Added after the learner explored the finished proof of concept. These are ideas, not commitments, and none are built. They point at the same goal: turning Nion from a tool people try into something they use every day.

- **Memory across conversations.** Today each conversation starts fresh (History keeps transcripts that Nion cannot read). The learner's design: the person says "Can you pick up from yesterday's conversation?" (or names the conversation as it appears in History), Nion says "Give me a minute," reads that conversation from History, gives a short recap ("Okay, this is what we talked about. Shall we continue?"), and carries on from there. This would reuse what History already saves, so it is mostly a matter of letting Nion look up a saved conversation by name or date and recap it briefly.
- **To-do lists and notes.** "What's on my list today?", "add this task." A web page cannot write to Apple Reminders or Notes directly, so this needs a service with an open API (for example Todoist, Google Tasks or Notion), iPhone Shortcuts, or a native app.
- **Email drafts saved for review.** "Draft an email to so-and-so, here's the context" would create a draft in Gmail or Outlook for the person to review and send themselves. Nion should only draft, never send, without a clear spoken confirmation, and should treat the contents of emails as information, not instructions.
- **Think-out-loud summaries.** After talking something through, Nion says a short "here's what you decided" and saves it as a note or tasks. This is where Nion differs from dictation tools like Wispr Flow, which transcribe but do not talk back.
- **A daily habit loop.** A morning "plan my day" and an evening "wrap up" conversation that leave behind tasks, notes and drafts, with memory so tomorrow continues today. The learner's view: depth beats breadth, so a few integrations that serve this loop matter more than connecting to many apps.
- Wearable and ambient context (for example, a Bee wearable or watch).
- Travel-specific help such as flight and gate awareness and "when should I leave for the airport?"
- Memory of a trip across conversations.

## Non-Goals

- Nion will not give investment advice. It summarizes markets only.
- Nion will not show lists or links as its answer. It is voice-first.
- Nion will not act on the person's accounts in this version.

## Open Questions

- **Delete a conversation from History?** The learner mentioned deleting early on but did not reconfirm. (Can wait; default is Later.)
- **Nion's voice:** a single default voice and a friendly, warm tone are assumed, since settings are Later. (Assumption; can wait.)
- **Pronunciation and the wake phrase:** "Nion" may be heard as "Neon" or similar. Decide how it is pronounced and that the wake phrase tolerates variants. (Must be answered in `4-spec`.)
- **Where current information comes from** (news, local places, directions). (Technical; `4-spec`.)
