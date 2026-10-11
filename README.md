# Nion

A hands-free voice companion, designed for ears, not screens. You say "Hey Nion",
ask something out loud, and Nion answers out loud, like a person on a phone call.
Built for the Devpost *Build With AI: Basics* hackathon.

> Work in progress. This README grows as Nion does.

## What you need

- **Node.js 22 or newer**
- **Google Chrome** (Nion uses Chrome's built-in speech features)
- **A Claude API key** from the Anthropic Console (https://platform.claude.com)

## Run it

1. Install the dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and put your own Claude API key after
   `ANTHROPIC_API_KEY=`. The `.env` file is private and is never committed.
3. Start Nion:
   ```
   npm start
   ```
4. Open http://localhost:3000 in Chrome, tap **Turn on Nion** once, and allow the
   microphone. Then say, "Hey Nion, what is today's date?"

**Use earphones.** Nion keeps listening while it talks so you can interrupt it. With
earphones that works well. On laptop speakers the microphone hears Nion's own voice,
so interrupting is less reliable. Chrome sometimes writes "Hey Nion" as "Indian" or
"anyone", so there is also a **Start conversation** button as a backup.

Open http://localhost:3000/?debug to see a log of what Nion hears and decides.

Run the tests with `npm test`.

## Try it on a phone (experimental)

Phones only allow the microphone on secure (https) pages, so Nion needs a secure
address. A free Cloudflare "quick tunnel" gives your laptop one for a while:

1. Download `cloudflared` for your computer from
   https://github.com/cloudflare/cloudflared/releases and put it at `.tools/cloudflared`
   (the `.tools/` folder is ignored by git).
2. With Nion running (`npm start`), run `npm run tunnel` in a second terminal.
3. Open the `https://....trycloudflare.com` address it prints on your phone.

**While the tunnel runs, anyone with that address can use your Nion and your API
credit.** Stop it (Ctrl+C) when you are done. Speech recognition on iPhones is much
less reliable than in Chrome on a computer or an Android phone.

## How it is built

The planning documents are in the [`devpost/`](devpost/) folder: `scope.md`,
`prd.md`, `spec.md` and the build `checklist.md`.

## License

MIT. See [LICENSE](LICENSE).
