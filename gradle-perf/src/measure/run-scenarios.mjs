import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./gradle-process.mjs";
import { buildScenarios } from "./scenario-suite.mjs";
import { parseGradleLog, tailText } from "../report/parse-gradle-log.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const heapArgs = "-Xms256m -Xmx2g -XX:MaxMetaspaceSize=384m -XX:+UseG1GC -Dfile.encoding=UTF-8";

const options = parseArgs(process.argv.slice(2));
const servicetalkDir = options.servicetalk ?? "/tmp/servicetalk";
const gradleUserHome = options.gradleUserHome ?? "/tmp/gradle-perf-home";
const outFile = options.out ?? path.join(repoRoot, "gradle-perf/results/runs.json");
const logDir = path.join(path.dirname(outFile), "logs");

const environment = await collectEnvironment();
let preservedMeasuredAt = null;
await mkdir(logDir, { recursive: true });
await mkdir(gradleUserHome, { recursive: true });
await writeFile(
  path.join(gradleUserHome, "gradle.properties"),
  [
    `org.gradle.jvmargs=${heapArgs}`,
    "org.gradle.vfs.watch=false",
    "org.gradle.daemon.idletimeout=600000",
    "",
  ].join("\n"),
);
await runCommand({
  cwd: servicetalkDir,
  args: ["./gradlew", "--stop", "--console=plain"],
  env: gradleEnv(),
});

const selectedIds = new Set(options.only ?? []);
const scenarios = buildScenarios().filter((scenario) => selectedIds.size === 0 || selectedIds.has(scenario.id));
const runs = selectedIds.size === 0 ? [] : await loadExistingRuns(selectedIds);
for (const scenario of scenarios) {
  if (scenario.stopDaemonBefore) {
    await runCommand({
      cwd: servicetalkDir,
      args: ["./gradlew", "--stop", "--console=plain"],
      env: gradleEnv(),
    });
  }
  const total = scenario.warmupIterations + scenario.measuredIterations;
  for (let index = 0; index < total; index += 1) {
    const role = index < scenario.warmupIterations ? "warmup" : "measured";
    const iteration = role === "warmup" ? index + 1 : index - scenario.warmupIterations + 1;
    const run = await measureOnce(scenario, role, iteration);
    runs.push(run);
    await persist(runs);
    console.log(
      `${scenario.id} ${role}#${iteration} exit=${run.exitCode} wall=${run.wallClockMs}ms gradle=${run.gradleReportedMs}ms cache=${run.configurationCache}`,
    );
    if (run.exitCode !== 0) {
      break;
    }
  }
}

runs.sort(compareRuns);
await persist(runs);
console.log(`Wrote ${outFile}`);

async function measureOnce(scenario, role, iteration) {
  const logFile = path.join(logDir, `${scenario.id}-${role}-${iteration}.log`);
  const result = await runCommand({
    cwd: servicetalkDir,
    args: ["./gradlew", ...scenario.tasks, ...scenario.args],
    env: gradleEnv(),
    logFile,
  });
  const parsed = parseGradleLog(result.log);
  return {
    scenarioId: scenario.id,
    group: scenario.group,
    title: scenario.title,
    mvnAnalogue: scenario.mvnAnalogue,
    tasks: scenario.tasks,
    args: scenario.args,
    role,
    iteration,
    exitCode: result.exitCode,
    wallClockMs: result.wallClockMs,
    ...parsed,
    logExcerpt: result.exitCode === 0 ? "" : tailText(result.log, 2500),
  };
}

async function persist(currentRuns) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(
    outFile,
    `${JSON.stringify({ measuredAt: preservedMeasuredAt ?? environment.measuredAt, environment, runs: currentRuns }, null, 2)}\n`,
  );
}

function compareRuns(left, right) {
  const order = new Map(buildScenarios().map((scenario, index) => [scenario.id, index]));
  const scenarioOrder = (order.get(left.scenarioId) ?? 0) - (order.get(right.scenarioId) ?? 0);
  if (scenarioOrder !== 0) {
    return scenarioOrder;
  }
  if (left.role !== right.role) {
    return left.role === "warmup" ? -1 : 1;
  }
  return left.iteration - right.iteration;
}

function gradleEnv() {
  return { ...process.env, GRADLE_USER_HOME: gradleUserHome };
}

async function collectEnvironment() {
  const [commit, subject, javaVersion, gradleVersion] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["log", "-1", "--format=%s"]),
    readJavaVersion(),
    readGradleVersion(),
  ]);
  return {
    measuredAt: new Date().toISOString(),
    servicetalkDir,
    servicetalkCommit: commit,
    servicetalkSubject: subject,
    gradleVersion,
    javaVersion,
    os: `${os.type()} ${os.release()}`,
    cpus: os.cpus().length,
    memTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
    gradleUserHome,
    gradleJvmArgs: heapArgs,
    heapNote:
      "gradle.properties của ServiceTalk xin -Xms2g -Xmx4g. Máy đo chỉ còn khoảng 5GB trống, nên GRADLE_USER_HOME ghi đè heap daemon xuống 2GB. User-home properties đứng trước project properties.",
  };
}

function git(args) {
  return runCommand({ cwd: servicetalkDir, args: ["git", ...args], env: process.env }).then((result) =>
    result.exitCode === 0 ? result.log.trim() : "unknown",
  );
}

async function readJavaVersion() {
  const result = await runCommand({ cwd: servicetalkDir, args: ["java", "-version"], env: process.env });
  const line = result.log.split(/\r?\n/).find((entry) => entry.includes("version")) ?? result.log.trim();
  return line.trim();
}

async function readGradleVersion() {
  try {
    const properties = await readFile(path.join(servicetalkDir, "gradle/wrapper/gradle-wrapper.properties"), "utf8");
    const match = properties.match(/gradle-([0-9.]+)-/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--servicetalk") {
      parsed.servicetalk = argv[index + 1];
      index += 1;
    } else if (key === "--gradle-user-home") {
      parsed.gradleUserHome = argv[index + 1];
      index += 1;
    } else if (key === "--out") {
      parsed.out = argv[index + 1];
      index += 1;
    } else if (key === "--only") {
      parsed.only = [...(parsed.only ?? []), argv[index + 1]];
      index += 1;
    }
  }
  return parsed;
}

async function loadExistingRuns(selectedIds) {
  try {
    const existing = JSON.parse(await readFile(outFile, "utf8"));
    preservedMeasuredAt = existing.measuredAt ?? null;
    return existing.runs.filter((run) => !selectedIds.has(run.scenarioId));
  } catch {
    return [];
  }
}
