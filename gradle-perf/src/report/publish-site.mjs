import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeRuns } from "./summarize-runs.mjs";
import { renderHtml } from "./render-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const resultsFile = process.argv[2] ?? path.join(repoRoot, "gradle-perf/results/runs.json");
const siteDir = process.argv[3] ?? path.join(repoRoot, "gradle-perf/site");

const report = JSON.parse(await readFile(resultsFile, "utf8"));
const summary = summarizeRuns(report);
await mkdir(siteDir, { recursive: true });
await writeFile(path.join(siteDir, "index.html"), renderHtml(summary));
await writeFile(path.join(siteDir, "results.json"), `${JSON.stringify(summary, null, 2)}\n`);
await copyFile(path.join(here, "styles.css"), path.join(siteDir, "styles.css"));
await writeFile(path.join(siteDir, ".nojekyll"), "");
console.log(`Published ${siteDir}`);
