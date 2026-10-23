# README facts: setup, running, and how the models are used

Plain facts and steps for the README, checked against the code on 2026-10-23. This is not the README itself: the story, the "why" and the wording are yours. Copy, cut or reorder what you need.

## What you need
- **Node.js 22 or newer** (`package.json` says `"node": ">=22"`).
- **A Nebius Token Factory API key** (required). Create it on tokenfactory.nebius.com.
- **A Tavily API key** (optional but recommended). Without it Nion says it can't look things up on the web.
- **Google Chrome** (or another Chromium browser such as Edge) for hands-free voice. Nion uses the browser's built-in speech recognition and speech voice, which sends audio to the browser vendor's speech service, so it needs an internet connection. In Safari, Nion hides the Turn on button and offers typing instead. Typing, the notebook and the sample trip work in every browser.
- Earphones are recommended: on laptop speakers the microphone hears Nion's own voice.

## Run it on your computer
```bash
git clone <repo-url> nion
cd nion
npm install
cp .env.example .env      # then fill in your own keys (see below)
npm start
```
Open http://localhost:3000. To use another port, start it with `PORT=3100 npm start`.

In Chrome: tap **Turn on Nion** once (browsers need a tap before they allow the microphone), allow the microphone, and say "Hey Nion, ..." Or type in the box and press Send.

`.env` is ignored by git. Never commit it or paste keys anywhere else.

### Settings in `.env`
| Setting | Meaning |
|---|---|
| `NEBIUS_API_KEY` | Your Nebius Token Factory key. Required. |
| `TAVILY_API_KEY` | Your Tavily key, for web search. Optional. |
| `NION_MODEL` | Everyday model. Default `nvidia/nemotron-3-super-120b-a12b`. |
| `NION_FALLBACK_MODEL` | Stronger model used when the everyday one is slow, busy or gives no answer. Default `nvidia/Nemotron-3-Ultra-550b-a55b`. `same` retries the everyday model, `none` turns the fallback off. |
| `NION_DAILY_CAP` | Questions per day for the whole site. Default 3000. |
| `NION_RATE_PER_HOUR` | Questions per visitor per hour. Default 200. |
| `NION_IP_RATE_PER_HOUR` | Questions per network address per hour. Default 1000. |
| `NION_JUDGE_PASS` | A secret of 8 or more characters. A link ending `?pass=THAT` skips the hourly limits and uses its own daily cap. |
| `NION_JUDGE_DAILY_CAP` | Daily cap for the judge pass. Default 5000. |
| `NION_TRUST_PROXY` | How many proxies sit in front of Nion on the host. Default 1. |
| `PORT` | Port the server listens on. Default 3000. |

## Check it works
```bash
npm test             # 360 tests, no network and no keys needed
npm run preflight    # scans for secrets before you push or upload anything
```
Open `/api/health` on the running server. It answers `{"ok":true}`.

`npm run bench` runs a live benchmark. By default it is a free dry run. `node --env-file=.env scripts/benchmark.mjs --live` makes real, paid requests to Token Factory and Tavily.

## How Nion uses NVIDIA Nemotron and Nebius Token Factory
- Every answer comes from an NVIDIA Nemotron model served by Nebius Token Factory. The server calls Token Factory's OpenAI-compatible API (`https://api.tokenfactory.nebius.com/v1/`) with plain `fetch`, in `server/providers/nebius.js`. No other model provider is used.
- **Everyday model:** `nvidia/nemotron-3-super-120b-a12b` (Nemotron 3 Super).
- **Stronger model:** `nvidia/Nemotron-3-Ultra-550b-a55b` (Nemotron 3 Ultra). It steps in when Super gives no answer, errors, or has not replied after **3 seconds** (the request to Ultra starts then, and whichever answers first is used). The line under each answer says "(stepped in)" when that happened.
- **Tools:** the model can call 11 tools in a loop of up to 4 rounds and 22 seconds: `web_search` (Tavily), `remember`, `forget`, `add_expense`, `add_to_list`, `update_list_item`, `set_reminder`, `cancel_reminder`, `show_panel`, `hide_panel`, `save_draft`.
- **What the page shows:** a banner under the title names the stack. Under each answer a line shows the model, Token Factory, the time taken and the number of web searches, for example `NVIDIA Nemotron 3 Super · Nebius Token Factory · 4.2 s · 1 web search (Tavily)`.
- **Measured speed and quality:** see [benchmark.md](benchmark.md) (live run on 2026-10-21: Super 19 of 20 checks passed, median 2.0 s; Ultra 20 of 20, median 2.4 s).

## Where your data lives
- The notebook (memories, expenses, to-do and to-visit lists, reminders, email drafts), your name and the History of conversations are saved **in your own browser** (`localStorage`). The server stores nothing and has no database.
- Each question carries a compact copy of the notebook so the model can use it. The server returns the changes, and the browser saves them.
- Clearing the browser's site data removes the notebook. The Notebook page has export and clear buttons.
- Nion never sends email. It saves drafts and can open your own email app or the share sheet.

## Deploy it
`Dockerfile` builds a small image (Node 22 Alpine, no keys inside). The host supplies `NEBIUS_API_KEY`, `TAVILY_API_KEY` and, optionally, `NION_JUDGE_PASS` as settings, and the port through `PORT`. The live demo runs on Google Cloud Run. Step by step: [deploy-cloud-run.md](deploy-cloud-run.md).

## Known limits (as they are today)
- Hands-free voice (the "Hey Nion" wake phrase) needs Chrome or another Chromium browser. Safari gets typing only.
- Nion works only while its page is open. Reminders are spoken only while the page is open (anything that came due while it was closed is spoken the next time it is opened). It cannot listen in the background.
- The notebook lives in one browser on one device. It does not sync between devices.
- Usage limits keep the public demo fair: a daily cap for everyone, an hourly cap per visitor and per network address, and a separate cap for the judge pass. The counters are in memory and reset when the host restarts or wakes from idle.
- The first request after the site has been idle can take a few extra seconds (cold start).

## Folders
| Folder | What is in it |
|---|---|
| `server/` | The Express server, the model provider (`providers/nebius.js`), the tools, the prompt and the fair-use limits |
| `shared/` | Code used by both the server and the browser: notebook rules, times, panels, model labels, sample trip |
| `public/` | The pages and the browser code (voice, notebook, History) |
| `tests/` | The automated tests (`npm test`) |
| `scripts/` | The benchmark, the secret check (`preflight`) and the icon maker |
| `docs/` | Notes: benchmark, hosting, facts for the submission |

## License
MIT. See `LICENSE`.
