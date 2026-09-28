import assert from "node:assert/strict";
import test from "node:test";
import { parseGradleDuration, parseGradleLog } from "./parse-gradle-log.mjs";
import { median, summarizeRuns } from "./summarize-runs.mjs";

test("parse gradle durations used in build output", () => {
  assert.equal(parseGradleDuration("41s"), 41_000);
  assert.equal(parseGradleDuration("1m 2s"), 62_000);
  assert.equal(parseGradleDuration("500ms"), 500);
  assert.equal(parseGradleDuration("1m 200ms"), 60_200);
});

test("parse a cached successful build", () => {
  const parsed = parseGradleLog(`
Configuration cache entry reused.
BUILD SUCCESSFUL in 1m 2s
12 actionable tasks: 2 executed, 9 from cache, 1 up-to-date
`);
  assert.equal(parsed.outcome, "SUCCESSFUL");
  assert.equal(parsed.gradleReportedMs, 62_000);
  assert.equal(parsed.executedTasks, 2);
  assert.equal(parsed.fromCacheTasks, 9);
  assert.equal(parsed.upToDateTasks, 1);
  assert.equal(parsed.configurationCache, "reused");
});

test("median ignores warmup runs", () => {
  const summary = summarizeRuns({
    measuredAt: "2026-09-28T00:00:00.000Z",
    environment: {},
    runs: [
      run("config-daemon", "warmup", 1, 9_000),
      run("config-daemon", "measured", 1, 4_000),
      run("config-daemon", "measured", 2, 6_000),
      run("config-daemon", "measured", 3, 5_000),
    ],
  });
  assert.equal(summary.scenarios[0].medianWallClockMs, 5_000);
  assert.equal(median([4, 1, 3]), 3);
});

function run(scenarioId, role, iteration, wallClockMs) {
  return {
    scenarioId,
    group: "configuration",
    title: scenarioId,
    mvnAnalogue: "mvnd",
    tasks: ["help"],
    args: [],
    role,
    iteration,
    exitCode: 0,
    wallClockMs,
    gradleReportedMs: wallClockMs,
    configurationCache: "not-used",
    taskSummary: "1 actionable task: 1 up-to-date",
    fromCacheTasks: 0,
    upToDateTasks: 1,
    executedTasks: 0,
  };
}
