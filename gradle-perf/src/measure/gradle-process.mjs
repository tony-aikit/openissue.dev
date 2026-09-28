import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

export function runCommand({ cwd, args, env, logFile }) {
  return new Promise((resolve) => {
    const startedAt = process.hrtime.bigint();
    const child = spawn(args[0], args.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => {
      const wallClockMs = elapsedMs(startedAt);
      resolve({
        exitCode: 1,
        wallClockMs,
        log: `${error.message}\n`,
      });
    });
    child.on("close", (code) => {
      const wallClockMs = elapsedMs(startedAt);
      const log = Buffer.concat(chunks).toString("utf8");
      const finished = { exitCode: code ?? 1, wallClockMs, log };
      if (!logFile) {
        resolve(finished);
        return;
      }
      writeFile(logFile, log)
        .then(() => resolve(finished))
        .catch((error) => {
          finished.log += `\nFailed to write log: ${error.message}\n`;
          resolve(finished);
        });
    });
  });
}

function elapsedMs(startedAt) {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}
