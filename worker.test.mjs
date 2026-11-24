import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.mjs";

const question = { stem: "Which protocol uses port 443?", choices: ["HTTP", "HTTPS", "FTP"], multiple: false, mark: true };

function setup(modelResponse, { allowed = true } = {}) {
  const calls = [];
  const env = {
    BETA_INVITE: "test-invite",
    LIMIT: { async limit(options) { calls.push({ type: "rate", ...options }); return { success: allowed }; } },
    AI: { async run(model, input) {
      calls.push({ type: "ai", model, input });
      if (modelResponse instanceof Error) throw modelResponse;
      return modelResponse;
    } }
  };
  const request = (body = question, path = "/public/answer", headers = {}) =>
    new Request("https://example.workers.dev" + path, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  return { env, calls, request };
}

test("public answers return exact option positions and an explanation", async () => {
  const { env, calls, request } = setup({ response: { selected: ["HTTPS"], explanation: "TLS is used." } });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { positions: [2], explanation: "TLS is used." });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.filter(c => c.type === "ai").length, 1);
});

test("JSON in a model code fence is accepted without guessing choice text", async () => {
  const { env, request } = setup({ response: '```json\n{"selected":["HTTPS"],"explanation":"Encrypted web traffic."}\n```' });
  const response = await worker.fetch(request(), env);
  assert.deepEqual(await response.json(), { positions: [2], explanation: "Encrypted web traffic." });
});

test("falls back to another response field if the first one is invalid", async () => {
  const { env, request } = setup({
    response: { selected: ["Made-up option"] },
    choices: [{ message: { content: '{"selected":["HTTP"],"explanation":"Model explanation."}' } }]
  });
  const response = await worker.fetch(request(), env);
  assert.deepEqual(await response.json(), { positions: [1], explanation: "Model explanation." });
});

test("unlisted and duplicate choice labels are never treated as valid matches", async () => {
  const first = setup({ response: { selected: ["SMTP"] } });
  assert.equal((await worker.fetch(first.request(), first.env)).status, 502);
  const second = setup({ response: { selected: ["Same"] } });
  const duplicateQuestion = { ...question, choices: ["Same", "Same"] };
  assert.equal((await worker.fetch(second.request(duplicateQuestion), second.env)).status, 502);
});

test("multiple-choice selections are deduplicated and validated", async () => {
  const { env, request } = setup({ response: { selected: ["HTTP", "HTTPS", "HTTP"] } });
  const response = await worker.fetch(request({ ...question, multiple: true }), env);
  assert.deepEqual(await response.json(), { positions: [1, 2], explanation: "" });
});

test("empty choice selection signals uncertainty instead of pretending success", async () => {
  const { env, request } = setup({ response: { selected: [] } });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /could not identify/i);
});

test("input errors and limits are returned before requesting AI", async () => {
  const invalid = setup({ response: { selected: ["HTTPS"] } });
  assert.equal((await worker.fetch(invalid.request({ ...question, choices: "HTTPS" }), invalid.env)).status, 400);
  assert.equal(invalid.calls.filter(c => c.type === "ai").length, 0);
  const limited = setup(null, { allowed: false });
  assert.equal((await worker.fetch(limited.request(), limited.env)).status, 429);
  assert.equal(limited.calls.filter(c => c.type === "ai").length, 0);
});

test("private endpoints require the correct invite", async () => {
  const { env, request } = setup({ response: { selected: ["HTTPS"] } });
  assert.equal((await worker.fetch(request(question, "/answer"), env)).status, 401);
  assert.equal((await worker.fetch(request(question, "/answer", { Authorization: "Bearer test-invite" }), env)).status, 200);
});

test("model outages return a service error rather than a fake answer", async () => {
  const { env, request } = setup(new Error("temporary failure"));
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable|allowance/i);
});
