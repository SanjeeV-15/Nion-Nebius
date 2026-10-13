import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "../server/failure.js";

test("Nebius-style credit problems are recognised too (a 402, or an insufficient balance message)", () => {
  assert.equal(classifyFailure(Object.assign(new Error("Payment Required"), { status: 402 })), "credit");
  assert.equal(classifyFailure(Object.assign(new Error("Nebius request failed (400): insufficient credits"), { status: 400 })), "credit");
});

test("a rejected key, a busy service, and anything else", () => {
  assert.equal(classifyFailure(Object.assign(new Error("invalid x-api-key"), { status: 401 })), "key");
  assert.equal(classifyFailure(Object.assign(new Error("forbidden"), { status: 403 })), "key");
  assert.equal(classifyFailure(Object.assign(new Error("slow down"), { status: 429 })), "busy");
  assert.equal(classifyFailure(Object.assign(new Error("overloaded"), { status: 529 })), "busy");
  assert.equal(classifyFailure(new Error("connect ECONNREFUSED")), undefined);
  assert.equal(classifyFailure(undefined), undefined);
});
