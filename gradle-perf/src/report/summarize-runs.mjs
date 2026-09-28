export function summarizeRuns(report) {
  const scenarios = new Map();
  for (const run of report.runs) {
    const existing = scenarios.get(run.scenarioId) ?? {
      id: run.scenarioId,
      group: run.group,
      title: run.title,
      mvnAnalogue: run.mvnAnalogue,
      tasks: run.tasks,
      args: run.args,
      measured: [],
      warmup: [],
    };
    const bucket = run.role === "warmup" ? existing.warmup : existing.measured;
    bucket.push(run);
    scenarios.set(run.scenarioId, existing);
  }

  const summarized = [...scenarios.values()].map((scenario) => {
    const successful = scenario.measured.filter((run) => run.exitCode === 0 && run.wallClockMs != null);
    return {
      ...scenario,
      medianWallClockMs: median(successful.map((run) => run.wallClockMs)),
      medianGradleReportedMs: median(
        successful.map((run) => run.gradleReportedMs).filter((value) => value != null),
      ),
      failed: scenario.measured.some((run) => run.exitCode !== 0),
      configurationCache: lastValue(scenario.measured, "configurationCache"),
      fromCacheTasks: lastValue(successful, "fromCacheTasks"),
      upToDateTasks: lastValue(successful, "upToDateTasks"),
      executedTasks: lastValue(successful, "executedTasks"),
      taskSummary: lastValue(successful, "taskSummary"),
    };
  });

  return {
    ...report,
    scenarios: summarized,
    insights: buildInsights(summarized),
  };
}

export function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
  return sorted[middle];
}

export function formatSeconds(milliseconds) {
  if (milliseconds == null) {
    return "n/a";
  }
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function buildInsights(scenarios) {
  const insights = [];
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  pushRatioInsight(insights, {
    byId,
    slowerId: "config-no-daemon",
    fasterId: "config-daemon",
    text: (slower, faster, ratio) =>
      `Daemon nóng chạy help trong ${formatSeconds(faster)} so với ${formatSeconds(slower)} khi mỗi lần là một JVM mới (${ratio}×). Đây là phần mvnd loại bỏ ở Maven.`,
  });
  const daemon = byId.get("config-daemon");
  const defaults = byId.get("config-servicetalk-defaults");
  if (closeEnough(daemon?.medianWallClockMs, defaults?.medianWallClockMs)) {
    insights.push(
      `Parallel, build cache và configure-on-demand không đổi help: ${formatSeconds(defaults.medianWallClockMs)} so với ${formatSeconds(daemon.medianWallClockMs)} của daemon tuần tự. Các cờ này bắt đầu có ích khi có task compile chạy được song song.`,
    );
  }
  pushRatioInsight(insights, {
    byId,
    slowerId: "compile-ci-shape",
    fasterId: "compile-cache-hit",
    text: (slower, faster, ratio) =>
      `Cùng một cache hit, kiểu CI (--no-daemon) mất ${formatSeconds(slower)} còn daemon đang sống mất ${formatSeconds(faster)} (${ratio}×). Runner một lần không giữ được daemon sang job sau, nhưng không nên trả giá này hai lần trong cùng một job.`,
  });
  const coldCompile = byId.get("compile-no-cache");
  const incremental = byId.get("compile-incremental");
  if (coldCompile?.medianWallClockMs != null && incremental?.medianWallClockMs != null) {
    insights.push(
      `Assemble đầu mất ${formatSeconds(coldCompile.medianWallClockMs)} với ${coldCompile.executedTasks ?? "một số"} task executed, gồm daemon vừa khởi động và các project phụ thuộc chưa có output. Assemble lại khi source không đổi mất ${formatSeconds(incremental.medianWallClockMs)}, ${incremental.upToDateTasks ?? "các"} task up-to-date.`,
    );
  }
  const cacheStore = byId.get("compile-cache-store");
  const cacheHit = byId.get("compile-cache-hit");
  if (cacheStore?.medianWallClockMs != null && cacheHit?.medianWallClockMs != null) {
    const ratio = (cacheStore.medianWallClockMs / cacheHit.medianWallClockMs).toFixed(1);
    insights.push(
      `Sau khi dependency đã được biên dịch, clean ba module rồi assemble ghi cache trong ${formatSeconds(cacheStore.medianWallClockMs)} (${cacheStore.executedTasks ?? "?"} executed). Lần clean tiếp theo đọc cache trong ${formatSeconds(cacheHit.medianWallClockMs)} (${ratio}×), với ${cacheHit.fromCacheTasks ?? "?"} task from cache. clean không xóa GRADLE_USER_HOME.`,
    );
  }

  const configurationCache = byId.get("config-configuration-cache");
  if (configurationCache?.failed || configurationCache?.configurationCache === "discarded") {
    insights.push(
      "Configuration cache chưa tái sử dụng được pha help. Plugin Groovy của ServiceTalk còn cấu hình eager, nên bật cờ này trên CI lúc này sẽ fail hoặc bỏ cache chứ chưa làm help nhanh hơn.",
    );
  } else if (configurationCache?.configurationCache === "reused") {
    pushRatioInsight(insights, {
      byId,
      slowerId: "config-daemon",
      fasterId: "config-configuration-cache",
      text: (slower, faster, ratio) =>
        `Configuration cache, với configure-on-demand tắt như kịch bản daemon, tái sử dụng help trong ${formatSeconds(faster)} so với ${formatSeconds(slower)} (${ratio}×).`,
    });
  }
  return insights;
}

function pushRatioInsight(insights, { byId, slowerId, fasterId, text }) {
  const slower = byId.get(slowerId);
  const faster = byId.get(fasterId);
  if (slower?.medianWallClockMs == null || faster?.medianWallClockMs == null || faster.medianWallClockMs === 0) {
    return;
  }
  const ratio = (slower.medianWallClockMs / faster.medianWallClockMs).toFixed(1);
  insights.push(text(slower.medianWallClockMs, faster.medianWallClockMs, ratio));
}

function closeEnough(left, right) {
  if (left == null || right == null || left === 0) {
    return false;
  }
  const ratio = right / left;
  return ratio > 0.85 && ratio < 1.15;
}

function lastValue(runs, key) {
  if (runs.length === 0) {
    return null;
  }
  return runs[runs.length - 1][key] ?? null;
}
