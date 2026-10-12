# Nion

**A hands-free voice companion, designed for ears, not screens.**
Say "Hey Nion", ask something out loud, and Nion answers out loud, like a person on a
phone call. It is built for the moments you can't, or don't want to, look at a screen:
walking through an airport, riding in a vehicle, resting your eyes.

Built for the Devpost *Build With AI: Basics* hackathon. The plan that produced it is in
[`devpost/`](devpost/): `scope.md`, `prd.md`, `spec.md` and the build `checklist.md`.

## What makes it different

Most assistants answer with a screen in mind: lists, links, "here's what I found."
Nion answers for the ear:

- **Short.** Replies stay under about 60 words, around 20 seconds of speech.
- **Five at most.** Places, ideas and headlines: five, then "want more, or should I narrow it down?"
- **One question when it's too broad.** "Who won the Nobel Prize?" gets "Which field, and which year?"
- **Gets the point of a ramble.** For a long, messy message it says what it understood first.
- **Has an opinion.** On a decision it says what it would do and why, then asks one question.
- **Names its sources aloud.** "According to Reuters..." It never reads out a web address, and
  it says "I couldn't find any source that mentioned this" when that is true.
- **Knows where you are, if you let it.** "Places to eat around me" works from your device
  location or a place you say, down to the neighbourhood.
- **You can interrupt it.** Start talking and it stops and listens.

## What you need

- **Node.js 22 or newer** and **Google Chrome**. Nion uses Chrome's built-in speech
  recognition and voice. (On an iPhone, it ran in testing too.)
- **A Claude API key** from the Anthropic Console (https://platform.claude.com). The API is
  billed separately from a Claude chat plan, and you add prepaid credit. A plain answer
  costs about a cent, and an answer that searches the web costs about 5 cents.
- **Earphones.** On laptop speakers the microphone hears Nion's own voice, which makes
  interrupting less reliable.

## Run it

```
npm install
cp .env.example .env        # then put your own API key after ANTHROPIC_API_KEY=
npm start
```

Open http://localhost:3000 in Chrome, tap **Turn on Nion** once (browsers need that tap
before they will use the microphone), and allow the microphone. The first time, Nion asks
what to call you.

The `.env` file is private: it is ignored by git and must never be committed or shared.

## Using it

| Say | What happens |
|---|---|
| "Hey Nion, what's the time in Denver?" | Nion answers out loud |
| *(then, within 15 seconds)* "and in Mumbai?" | A follow-up, no wake phrase needed |
| "Hey Nion, let's start a conversation" | Keeps listening, with no time limit, until you say "end the conversation" |
| "Hey Nion, what are some places to eat around me?" | Nion asks where you are: say "use my location" or say a place |
| "Hey Nion, what's the latest world news?" | Searches the web, names sources, says "one moment" if it takes a while |
| "call me Sam" | Changes your name |
| *(start talking while Nion talks)* | Nion stops and listens (works best with earphones) |
| *(press Escape, or tap the circle)* | Stops Nion at once, when your voice can't be heard over its own |

Chrome sometimes writes "Hey Nion" as "Indian", "anyone" or "any on". Nion accepts those,
and there is also a **Start conversation** button as a backup. The **History** link keeps
past conversations on your device, with a Copy button for each transcript.

Open http://localhost:3000/?debug to see a log of what Nion hears and decides, and
`?reset` to start fresh (it forgets your name and clears History). If Nion gets your name wrong, say "call me Sanjeev".

## Checks

```
npm test                # 100+ automated tests; no API key needed, nothing is spent
npm run check:replies   # asks Claude sample questions and checks Nion's replies (costs a few cents)
npm run check:speed     # compares how fast two Claude models answer (costs a few cents)
```

## Privacy

- **Your voice** is turned into text by Chrome's speech service, so the audio leaves your computer.
- **What you ask** goes to Claude (Anthropic) through your own server, along with your name,
  the date and time, and a place if you have shared one.
- **If you share your device location**, the coordinates go to OpenStreetMap's free lookup
  service to find the neighbourhood and city. Nion stores neither.
- **History and your name** are kept only in your browser's own storage, on your device.
- **Nion has no accounts and no database.**

## Try it on a phone (experimental)

Phones only allow the microphone on secure (https) pages, so the app needs a secure address.
A free Cloudflare "quick tunnel" can give your laptop one for a while:

1. Download `cloudflared` for your computer from
   https://github.com/cloudflare/cloudflared/releases and put it at `.tools/cloudflared`
   (the `.tools/` folder is ignored by git).
2. With Nion running (`npm start`), run `npm run tunnel` in a second terminal.
3. Open the `https://....trycloudflare.com` address it prints on your phone.

**While the tunnel runs, anyone with that address can use your Nion and your API credit.**
Stop it (Ctrl+C) when you are done.

## How it is built

```
server/   a small Node server that holds the API key and asks Claude (with web search)
public/   the page: hearing, speaking, the conversation logic, History, and the glass look
tests/    automated tests, including a pretend microphone, voice and server
scripts/  the reply check and the speed check
devpost/  the plan: scope, PRD, spec and build checklist
```

- **The brain:** Claude Sonnet 5.5 at low effort, with web search. Change `NION_MODEL` in
  `.env` to try another model. In a speed check, Sonnet 5.5 was as fast as or faster than Haiku 5.5.
- **Speech:** Chrome's built-in speech recognition and voice. On a Mac, downloading a
  "Premium" or "Enhanced" voice in System Settings makes Nion sound noticeably more natural.

## Known limits

- It runs while the page is open and the screen is on. A background or screen-off mode needs
  a native app, which this proof of concept does not include.
- Speech recognition is Chrome's, so it sometimes mishears. Nion works around the common cases.
- Replies that search the web take 3 to 6 seconds. Nion says "one moment" when that happens.
- Listing exactly five items is something Nion does nearly every time, not every time.

## License

MIT. See [LICENSE](LICENSE).
