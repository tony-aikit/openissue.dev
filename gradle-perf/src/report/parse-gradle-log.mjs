export function parseGradleDuration(raw) {
  const value = raw.trim().replace(/\.$/, "");
  if (!value) {
    return null;
  }
  const hours = readUnit(value, /(\d+)h\b/);
  const minutes = readUnit(value, /(\d+)m(?!s)/);
  const seconds = readUnit(value, /(\d+)s(?![\w])/);
  const millis = readUnit(value, /(\d+)ms\b/);
  if (hours == null && minutes == null && seconds == null && millis == null) {
    return null;
  }
  return (hours ?? 0) * 3_600_000 + (minutes ?? 0) * 60_000 + (seconds ?? 0) * 1_000 + (millis ?? 0);
}

export function parseGradleLog(log) {
  const outcomeMatch = log.match(/BUILD (SUCCESSFUL|FAILED) in ([^\r\n]+)/);
  const taskMatch = log.match(/(\d+) actionable tasks?: ([^\r\n]+)/);
  const taskSummary = taskMatch ? taskMatch[2].trim() : null;
  return {
    outcome: outcomeMatch ? outcomeMatch[1] : null,
    gradleReportedMs: outcomeMatch ? parseGradleDuration(outcomeMatch[2]) : null,
    taskSummary,
    executedTasks: readCount(taskSummary, /(\d+) executed/),
    fromCacheTasks: readCount(taskSummary, /(\d+) from cache/),
    upToDateTasks: readCount(taskSummary, /(\d+) up-to-date/),
    configurationCache: readConfigurationCache(log),
    problemExcerpt: readProblemExcerpt(log),
  };
}

export function tailText(log, maxChars) {
  const normalized = log.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(normalized.length - maxChars);
}

function readConfigurationCache(log) {
  if (/Configuration cache entry reused/.test(log)) {
    return "reused";
  }
  if (/Configuration cache entry stored/.test(log)) {
    return "stored";
  }
  if (/Configuration cache (entry discarded|problems found)/.test(log)) {
    return "discarded";
  }
  if (/configuration cache cannot be reused|Calculating task graph as configuration cache/.test(log)) {
    return "discarded";
  }
  return "not-used";
}

function readProblemExcerpt(log) {
  const lines = log
    .split(/\r?\n/)
    .filter((line) => /configuration cache|Problem|failed|FAILURE|What went wrong/i.test(line))
    .slice(0, 8);
  return lines.join("\n");
}

function readCount(summary, pattern) {
  if (!summary) {
    return null;
  }
  const match = summary.match(pattern);
  return match ? Number(match[1]) : 0;
}

function readUnit(value, pattern) {
  const match = value.match(pattern);
  return match ? Number(match[1]) : null;
}
