import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const question = { kind: "quizpilot-answer", stem: "Which is correct?", choices: ["A", "B"], multiple: false };

function extensionWithFetch(fetch) {
  const listeners = [];
  const addListener = () => {};
  const browser = {
    runtime: {
      id: "test-extension", getURL: path => "moz-extension://test/" + path,
      onConnect: { addListener }, onMessage: { addListener: fn => listeners.push(fn) }
    },
    tabs: { onRemoved: { addListener }, onUpdated: { addListener },
      create: () => { throw Error("Answering must not open a tab."); } },
    commands: { onCommand: { addListener } }
  };
  runInNewContext(readFileSync("extension/background.js", "utf8"), {
    browser, fetch: (url, options) => /https:\/\/(?:www\.google\.com\/search|html\.duckduckgo\.com\/html\/)/.test(String(url))
      ? Response.json({}, { status: 503 }) : fetch(url, options),
    QUIZPILOT_ORIGIN: "https://test.example", byteCalculation: () => null,
    referencesFor: () => [], parseGoogleSearchResults: () => [], AbortSignal, setTimeout, URL
  });
  return () => listeners.map(fn => fn(question, { tab: { id: 1 }, id: "test-extension" })).find(Boolean);
}

test("busy responses give a readable message without retrying the shared limit", async () => {
  let requests = 0;
  const send = extensionWithFetch(async () => {
    requests++;
    return Response.json({ error: "cncaS2 is busy" }, { status: 429 });
  });
  await assert.rejects(send(), /AI service busy.*minute/i);
  assert.equal(requests, 1);
});

test("one temporary connection failure retries and then succeeds", async () => {
  let requests = 0;
  const send = extensionWithFetch(async () => {
    if (++requests === 1) throw Object.assign(new Error("temporary network issue"), { name: "TypeError" });
    return Response.json({ positions: [2], explanation: "B is correct." });
  });
  const response = await send();
  assert.deepEqual(response.positions, [2]);
  assert.equal(requests, 2);
});

test("malformed responses are rejected and not cached", async () => {
  let requests = 0;
  const send = extensionWithFetch(async () => { requests++; return Response.json({ nonsense: true }); });
  await assert.rejects(send(), /did not return a clear answer/i);
  await assert.rejects(send(), /did not return a clear answer/i);
  assert.equal(requests, 2);
});

test("service outage is reported without an expensive automatic retry", async () => {
  let requests = 0;
  const send = extensionWithFetch(async () => {
    requests++;
    return Response.json({ error: "Model unavailable" }, { status: 503 });
  });
  await assert.rejects(send(), /Model unavailable/);
  assert.equal(requests, 1);
});
