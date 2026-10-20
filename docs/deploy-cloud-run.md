# Deploying Nion on Google Cloud Run (a guide for Sanjeev)

**Status: written, not yet run.** The commands and menu names come from my knowledge of Google Cloud
and have not been tried. Google's screens change, so if a name differs, look for the closest one and tell me
what you see. Nothing here is run for you: you do each step, so your account and card stay yours.

## Why this way
- **No installs.** Google Cloud Shell is a terminal that runs in your browser, with the `gcloud` tool already
  there. You don't need Homebrew, the CLI or Docker on your Mac.
- **Keys never go in a file or a command.** You paste them into Google's Secret Manager, and Cloud Run hands
  them to Nion when it starts.
- **Cost should be about $0**: Cloud Run is billed only while it handles requests and scales to zero when idle.
  I could not read Google's own pricing page, so check the free allowance yourself (step 2).
- **Use a PERSONAL Google account**, not your company one. A company account may block public access, and this
  is a personal project.
- **Sign-in is the normal browser one.** Never use any "device code" or `--no-launch-browser` option.

## Before you start (on your Mac)
1. `cd /Users/sanjeev.kumar/Projects/nion-nebius`
2. `npm test` (all tests pass) and `npm run preflight` (must say PASS, with no secrets found).
3. Make the upload file from what is committed (so your `.env` can never be inside it):
   ```bash
   git archive --format=tar.gz --output="$HOME/Desktop/nion-deploy.tar.gz" HEAD
   ```
4. Have these ready: your Nebius key and Tavily key (in `.env`), and a judge pass. Make one with
   `openssl rand -hex 12` and keep it somewhere private.

## Step 1: a Google Cloud project
1. Go to **console.cloud.google.com**, signed in with your personal account.
2. Create a new project, for example `nion-demo`. Note its **project ID** (it has numbers added).
3. **Billing:** link a billing account (this is where the card goes). Cloud Run needs one even when you stay in
   the free allowance.

## Step 2: protect your wallet
1. **Billing > Budgets & alerts > Create budget.** Set it to **$5**, with alerts at 50%, 90% and 100%.
   A budget only **warns** you; it does not stop spending. (Our real limits are in step 5.)
2. Read Cloud Run's **pricing page** and confirm the free monthly allowance. I expected roughly 2 million requests
   and 180,000 vCPU-seconds, but that is unverified.

## Step 3: put your keys in Secret Manager (no typing secrets into a terminal)
In the console, open **Secret Manager** (enable it if asked) and **Create secret** three times:

| Secret name | Value |
|---|---|
| `nebius-api-key` | your Nebius Token Factory key |
| `tavily-api-key` | your Tavily key |
| `nion-judge-pass` | the judge pass you made |

Then allow Cloud Run to read them. In **Cloud Shell** (step 4) run, replacing the two placeholders:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```
(The project number is on the project's home page. If that service account doesn't exist yet, do this after the first
deploy attempt tells you which account runs the service.)

## Step 4: deploy from Cloud Shell
1. In the console click **Activate Cloud Shell** (the terminal icon, top right).
2. In Cloud Shell, use the **three-dot menu > Upload** and choose `nion-deploy.tar.gz` from your Desktop.
3. Run:
   ```bash
   mkdir nion && tar xzf nion-deploy.tar.gz -C nion && cd nion
   gcloud config set project PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   gcloud run deploy nion \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --min-instances 0 --max-instances 1 \
     --memory 512Mi --cpu 1 \
     --set-secrets NEBIUS_API_KEY=nebius-api-key:latest,TAVILY_API_KEY=tavily-api-key:latest,NION_JUDGE_PASS=nion-judge-pass:latest \
     --set-env-vars NION_DAILY_CAP=3000,NION_JUDGE_DAILY_CAP=5000
   ```
4. If it asks to create an Artifact Registry repository, say **yes**. If it asks about unauthenticated access, say
   **yes** (the demo must be public). The first build takes a few minutes: it is also the first time our Dockerfile
   is ever built, so if it fails, copy me the error.
5. It ends by printing a **Service URL** like `https://nion-xxxxx-uc.a.run.app`.

What the settings mean: `--min-instances 0` scales to zero when idle (nothing to pay); `--max-instances 1` keeps one copy
so our usage counters stay in one place; `--allow-unauthenticated` lets anyone open the page; the caps are the usage
limits from `.env.example`.

## Step 5: test it
1. Open `SERVICE_URL/api/health`: it should say `{"ok":true}`.
2. Open the URL itself in Chrome. Allow the microphone (https is what makes this work). Ask something. The first
   request after idle takes a few seconds (a "cold start"); after that it is quick.
3. Open `SERVICE_URL/?pass=YOUR_JUDGE_PASS` once. That is the link judges use: it skips the normal limits (and the pass
   disappears from the address bar).
4. Look at the logs: `gcloud run services logs read nion --region us-central1 --limit 30`. You should see lines like
   `Answered: ... (today: 1 of 3000)`.
5. On your phone: open the URL, try the microphone, "Add to Home Screen", the share sheet and the email-app button.

## Your real limits, in order
1. **Your Token Factory balance** is the real ceiling. Look at it on tokenfactory.nebius.com now and then.
2. **The daily cap** (3,000 questions) and the **judge cap** (5,000) in the service settings. Raise them in the console
   if you need to (Edit & deploy new revision > Variables).
3. **Cancel a leaked judge pass** by changing the `nion-judge-pass` secret to a new value and deploying a new revision.
4. The usage counters live in memory and restart from zero whenever the service restarts or wakes from idle, so they are
   a speed bump, not a vault.

## Changing something later
Repeat "Before you start" (a fresh `nion-deploy.tar.gz`), upload it, and run the same `gcloud run deploy` again.

## Stopping everything
`gcloud run services delete nion --region us-central1` removes the service. The demo must stay up until the judging
period ends on **2026-12-15**, so only do this after that.

## If judges might open it when it is asleep
A cold start of a few seconds is normal and fine. If you want it always warm during judging (Dec 1 to 15), add
`--min-instances 1` to the deploy command; that costs money while idle (check the price first).

## What I could not verify
- Cloud Run's free allowance and whether it applies in `us-central1`.
- The exact flags, prompts and menu names above.
- That our Dockerfile builds: it has never been built (no Docker on your Mac), so the first cloud build is the test.
- The cold-start time, and that the microphone works on the Cloud Run address (it should, since it is https).
- That the default service account can read the secrets without the extra step.
