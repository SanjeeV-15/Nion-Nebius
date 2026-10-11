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

Run the tests with `npm test`.

## How it is built

The planning documents are in the [`devpost/`](devpost/) folder: `scope.md`,
`prd.md`, `spec.md` and the build `checklist.md`.

## License

MIT. See [LICENSE](LICENSE).
