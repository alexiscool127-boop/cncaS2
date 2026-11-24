import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesVerifiedAnswer, summarizeAccuracy } from "./accuracy-eval.mjs";

test("evaluates single and multiple selections without order bias", () => {
  assert.equal(matchesVerifiedAnswer({ expectedPositions: [2] }, { positions: [2] }), true);
  assert.equal(matchesVerifiedAnswer({ expectedPositions: [1, 3] }, { positions: [3, 1] }), true);
  assert.equal(matchesVerifiedAnswer({ expectedPositions: [1, 3] }, { positions: [1, 2] }), false);
});

test("compares short written answers after harmless whitespace and case changes", () => {
  assert.equal(matchesVerifiedAnswer({ expectedAnswer: "IPv6" }, { answer: " ipv6 " }), true);
  assert.equal(matchesVerifiedAnswer({ expectedAnswer: "32" }, { answer: "16" }), false);
});

test("never counts errors or empty responses as correct", () => {
  const cases = [{ expectedPositions: [2] }, { expectedAnswer: "yes" }, { expectedPositions: [1] }];
  assert.deepEqual(summarizeAccuracy(cases, [{ positions: [2] }, null, { positions: [3] }]), {
    correct: 1, total: 3, percent: 33
  });
  assert.deepEqual(summarizeAccuracy([], []), { correct: 0, total: 0, percent: null });
});
