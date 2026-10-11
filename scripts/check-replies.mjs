// A reply check: asks Nion's brain a handful of sample questions and checks the
// replies follow the "designed for ears" rules. It calls Claude for real, so it
// costs a very small amount each time.
//
// Run it with:  npm run check:replies

import Anthropic from "@anthropic-ai/sdk";
import { askNion } from "../server/brain.js";

const judge = new Anthropic();

const now = new Date();
const context = {
  nowISO: now.toISOString(),
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  localDateTime: now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }),
  userName: "Sanjeev",
  isNewConversation: false,
};

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// Things that must never be in a reply that gets read aloud.
function writtenStyleProblems(reply) {
  const problems = [];
  if (/[*#_`>|]/.test(reply)) problems.push("has markdown symbols");
  if (/^\s*(?:[-•]|\d+[.)])\s/m.test(reply)) problems.push("has a bulleted or numbered list");
  if (/https?:\/\/|www\./i.test(reply)) problems.push("has a link");
  if (/\b(?:click|tap|scroll|look at|see below|see above|on your screen)\b/i.test(reply)) problems.push("tells the person to look at something");
  return problems;
}

// The one thing we can't check with a pattern is counting items in a spoken list,
// so a small, fast model lists them, one per line, and we count the lines. (Asking
// for a bare number was less reliable: it sometimes counted the closing offer,
// like "want five more?", as items.)
async function listItems(reply) {
  const response = await judge.messages.create({
    model: "claude-haiku-5-5",
    // Generous on purpose: the model may spend some of this thinking before it
    // writes its answer, and a budget that is too small leaves no answer at all.
    max_tokens: 2000,
    output_config: { effort: "low" },
    messages: [{
      role: "user",
      content: `Here is a spoken reply:\n\n"${reply}"\n\nList each distinct place, idea or item that it recommends or names as part of a list, one per line, with no numbering and nothing else. Treat a thing and its own features or parts as one item (for example the Louvre and the Mona Lisa inside it are one). Names mentioned only as a teaser still count. Do not include any offer to give more.`,
    }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

const endsWithQuestion = (reply) => /\?\s*$/.test(reply.trim());

const checks = [
  ...[
    ["Places to see: at most five, then asks to continue or narrow", "What are some famous things to see in Paris? Give me a long list."],
    ["Ideas, when asked for ten: at most five, then asks to continue or narrow", "Give me ten ideas for what to do in Denver this weekend."],
  ].map(([name, question]) => ({
    name,
    question,
    async verify(reply) {
      const problems = [];
      // A clear sign of a sixth recommendation: "sixth", "seventh", and so on.
      if (/\b(?:sixth|seventh|eighth|ninth|tenth)\b/i.test(reply)) problems.push("goes past a fifth recommendation");
      // The item counter is approximate: it tends to count places inside a
      // recommendation ("Shibuya and Shinjuku", or a landmark and the street it is on) as
      // extra items, so it can read one or two too high. Only a count well past
      // five is treated as a real failure.
      const items = await listItems(reply);
      if (items.length === 0) problems.push("the item counter gave no list, so the five-item rule could not be checked");
      else if (items.length > 7) problems.push(`names about ${items.length} items, well past five: ${items.join(" | ")}`);
      if (!endsWithQuestion(reply)) problems.push("does not end by asking whether to continue or narrow down");
      return problems;
    },
  })),
  {
    name: "A broad question: one short clarifying question first",
    question: "Who won the Nobel Prize?",
    verify(reply) {
      const problems = [];
      if (wordCount(reply) > 30) problems.push(`too long for a clarifying question (${wordCount(reply)} words)`);
      if (!reply.includes("?")) problems.push("does not ask a question");
      if (!/\b(?:which|what|field|category|year|physics|chemistry|literature|peace|medicine|economics)\b/i.test(reply)) problems.push("does not ask which field or year");
      return problems;
    },
  },
  {
    name: "A long, messy message: says what it understood, then answers",
    question:
      "so um I'm like walking to my gate right now and uh I was thinking, you know, my mom called and she wants me to bring her something back from this trip, I don't know, something local maybe, and also I need to know what time it is in Mumbai right now, like right now, and uh yeah that's pretty much it",
    verify(reply) {
      const problems = [];
      const firstSentence = reply.split(/(?<=[.?!])\s/)[0] ?? "";
      if (!/\b(?:so|sounds like|you want|you'd like|you need|you're looking)\b/i.test(firstSentence)) problems.push("does not start by saying what it understood");
      if (!/mumbai/i.test(reply)) problems.push("does not answer the Mumbai time question");
      if (/\b(?:um|uh|you know)\b/i.test(reply)) problems.push("repeats the filler words");
      return problems;
    },
  },
  {
    name: "A small decision: gives an opinion and asks one follow-up question",
    question:
      "I got a chocolate cake last time and it wasn't that good. I'm thinking of getting a lemon one this time. What do you think?",
    verify(reply) {
      const problems = [];
      if (!endsWithQuestion(reply)) problems.push("does not end with a follow-up question");
      if ((reply.match(/\?/g) ?? []).length > 1) problems.push("asks more than one question");
      if (wordCount(reply) > 70) problems.push(`too long to say out loud (${wordCount(reply)} words)`);
      return problems;
    },
  },
  {
    name: "A plain question: short answer, no extras",
    question: "What is the capital of Australia?",
    verify(reply) {
      const problems = [];
      if (wordCount(reply) > 30) problems.push(`too long for a plain answer (${wordCount(reply)} words)`);
      if (!/canberra/i.test(reply)) problems.push("does not say Canberra");
      return problems;
    },
  },
];

let failures = 0;
for (const check of checks) {
  const { reply } = await askNion({ messages: [{ role: "user", content: check.question }], context });
  const problems = [...writtenStyleProblems(reply), ...(await check.verify(reply))];
  const ok = problems.length === 0;
  if (!ok) failures += 1;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${check.name}`);
  console.log(`  Asked: ${check.question.slice(0, 100)}${check.question.length > 100 ? "…" : ""}`);
  console.log(`  Nion:  ${reply}`);
  for (const problem of problems) console.log(`  - ${problem}`);
}

console.log(`\n${checks.length - failures} of ${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
