import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function matchesVerifiedAnswer(testCase, response) {
  if (Array.isArray(testCase.expectedPositions)) {
    if (!Array.isArray(response?.positions)) return false;
    const sorted = positions => [...new Set(positions)].sort((a, b) => a - b);
    return JSON.stringify(sorted(testCase.expectedPositions)) === JSON.stringify(sorted(response.positions));
  }
  if (typeof testCase.expectedAnswer === "string") {
    return typeof response?.answer === "string" &&
      response.answer.trim().toLowerCase() === testCase.expectedAnswer.trim().toLowerCase();
  }
  return false;
}

export function summarizeAccuracy(cases, results) {
  const correct = cases.reduce((total, item, index) =>
    total + Number(matchesVerifiedAnswer(item, results[index])), 0);
  return { correct, total: cases.length, percent: cases.length ? Math.round(correct / cases.length * 100) : null };
}

async function run() {
  const [, , file, workerOrigin] = process.argv;
  if (!file || !workerOrigin) throw Error("Usage: node accuracy-eval.mjs verified-questions.json https://your-worker.workers.dev");
  const url = new URL(workerOrigin);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw Error("Enter a Worker HTTPS origin without a path.");
  const cases = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(cases) || !cases.length || cases.length > 10) throw Error("Provide 1 to 10 independently verified questions per run.");
  const results = [];
  for (const [index, item] of cases.entries()) {
    if (typeof item.stem !== "string" || !Array.isArray(item.choices) || typeof item.multiple !== "boolean" ||
      !item.choices.every(c => typeof c === "string") ||
      !(Array.isArray(item.expectedPositions) || typeof item.expectedAnswer === "string")) throw Error("Invalid case at index " + index);
    try {
      const response = await fetch(new URL("/public/answer", url), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stem: item.stem, choices: item.choices, multiple: item.multiple, mark: item.choices.length > 0 }),
        signal: AbortSignal.timeout(60000)
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "HTTP " + response.status);
      results.push(result);
      console.log((index + 1) + ". " + (matchesVerifiedAnswer(item, result) ? "correct" : "incorrect"));
    } catch (error) {
      results.push(null);
      console.log((index + 1) + ". request failed: " + error.message);
    }
  }
  const score = summarizeAccuracy(cases, results);
  console.log("Verified-question accuracy: " + score.correct + "/" + score.total + " (" + score.percent + "%). This is a small sample, not a guarantee.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
