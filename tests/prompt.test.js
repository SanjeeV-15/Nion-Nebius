import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../server/prompt.js";

test("a new conversation tells Nion to greet the person by name", () => {
  const prompt = buildSystemPrompt({ userName: "Sanjeev", isNewConversation: true });
  assert.match(prompt, /name is Sanjeev/);
  assert.match(prompt, /first reply of a new conversation/);
  assert.match(prompt, /Hey Sanjeev,/);
});

test("later replies in the same conversation do not greet again", () => {
  const prompt = buildSystemPrompt({ userName: "Sanjeev", isNewConversation: false });
  assert.match(prompt, /already greeted/);
  assert.doesNotMatch(prompt, /first reply of a new conversation/);
});

test("with no name, there is no greeting instruction", () => {
  const prompt = buildSystemPrompt({ isNewConversation: true });
  assert.doesNotMatch(prompt, /greeting/);
});

test("the current date and time are included when given", () => {
  const prompt = buildSystemPrompt({
    localDateTime: "Sunday, October 11, 2026 at 3:12 PM",
    timeZone: "America/New_York",
  });
  assert.match(prompt, /Sunday, October 11, 2026/);
  assert.match(prompt, /America\/New_York/);
});
