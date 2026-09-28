import { formatSeconds } from "./summarize-runs.mjs";

const ciContext = [
  {
    label: "PR Builder, JDK 17",
    duration: "19 phút 00 giây",
    detail: "Job test dài nhất của PR #3650. Wall clock cả workflow khoảng 19 phút.",
    href: "https://github.com/apple/servicetalk/actions/runs/36387399100",
  },
  {
    label: "PR Builder, macOS JDK 11",
    duration: "6 phút 43 giây",
    detail: "Self-hosted macOS trên cùng PR. Vẫn clean và --no-daemon.",
    href: "https://github.com/apple/servicetalk/actions/runs/36387399100",
  },
  {
    label: "Snapshot check",
    duration: "33 phút 36 giây",
    detail: "Push #3650 lên main. ./gradlew --no-daemon --parallel check sau một lần clean riêng.",
    href: "https://github.com/apple/servicetalk/actions/runs/36389576467",
  },
  {
    label: "Snapshot publish",
    duration: "22 phút 31 giây",
    detail: "publish --no-daemon --no-parallel. Giữ serial vì Central chịu upload song song kém.",
    href: "https://github.com/apple/servicetalk/actions/runs/36389576467",
  },
];

export function renderHtml(summary) {
  const configuration = summary.scenarios.filter((scenario) => scenario.group === "configuration");
  const compile = summary.scenarios.filter((scenario) => scenario.group === "compile");
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gradle perf — ServiceTalk</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="masthead">
    <p class="eyebrow">mvn-perf → gradle-perf</p>
    <h1>Tốc độ build ServiceTalk</h1>
    <p class="lede">Đo có kiểm soát trên <a href="https://github.com/apple/servicetalk/commit/${escapeHtml(summary.environment.servicetalkCommit)}">${escapeHtml(summary.environment.servicetalkCommit.slice(0, 12))}</a>. Wall clock là thời gian mình chờ. Số Gradle in ra là phần sau khi process build đã chạy.</p>
  </header>
  <main>
    <section>
      <h2>Kết quả chính</h2>
      <ul class="insights">
        ${summary.insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("\n        ")}
      </ul>
    </section>
    <section>
      <h2>Cấu hình, task help</h2>
      ${renderChart(configuration)}
      ${renderTable(configuration)}
    </section>
    <section>
      <h2>Compile lát ba module</h2>
      <p class="note">Lát đo là clean hoặc assemble của <code>servicetalk-buffer-api</code>, <code>servicetalk-concurrent-api</code> và <code>servicetalk-http-api</code>. <code>http-api</code> kéo theo các project phụ thuộc, nên số task lớn hơn ba module. Không chạy <code>test</code>: worker test của ServiceTalk xin 4GB, và suite đầy đủ trên CI đã mất khoảng 19–34 phút.</p>
      ${renderChart(compile)}
      ${renderTable(compile)}
    </section>
    <section>
      <h2>Bối cảnh CI công khai</h2>
      <p class="note">Các mốc này là wall clock của GitHub Actions ngày 28/09/2026, không cùng giao thức với bảng trên. Chúng cho biết vì sao lát đo tập trung vào daemon và cache.</p>
      <div class="ci-grid">
        ${ciContext
          .map(
            (item) => `<article>
          <h3><a href="${item.href}">${escapeHtml(item.label)}</a></h3>
          <p class="ci-duration">${escapeHtml(item.duration)}</p>
          <p>${escapeHtml(item.detail)}</p>
        </article>`,
          )
          .join("\n        ")}
      </div>
    </section>
    <section>
      <h2>Ánh xạ và cờ đã đo</h2>
      ${renderMapping()}
    </section>
    <section>
      <h2>Môi trường</h2>
      ${renderEnvironment(summary.environment)}
    </section>
  </main>
</body>
</html>
`;
}

function renderChart(scenarios) {
  const max = Math.max(...scenarios.map((scenario) => scenario.medianWallClockMs ?? 0), 1);
  const rows = scenarios
    .map((scenario) => {
      const width = scenario.medianWallClockMs == null ? 0 : Math.max(2, (scenario.medianWallClockMs / max) * 100);
      const tone = scenario.failed ? "bar-failed" : "bar-ok";
      return `<div class="bar-row">
        <div class="bar-label">${escapeHtml(scenario.title)}</div>
        <div class="bar-track"><div class="${tone}" style="width:${width.toFixed(1)}%"></div></div>
        <div class="bar-value">${escapeHtml(formatSeconds(scenario.medianWallClockMs))}</div>
      </div>`;
    })
    .join("\n");
  return `<div class="chart">${rows}</div>`;
}

function renderTable(scenarios) {
  const body = scenarios
    .map((scenario) => {
      const samples = scenario.measured
        .map((run) => `${run.role === "measured" ? "" : ""}${formatSeconds(run.wallClockMs)}`)
        .join(", ");
      return `<tr>
        <td>${escapeHtml(scenario.title)}</td>
        <td>${escapeHtml(scenario.mvnAnalogue)}</td>
        <td>${escapeHtml(formatSeconds(scenario.medianWallClockMs))}</td>
        <td>${escapeHtml(formatSeconds(scenario.medianGradleReportedMs))}</td>
        <td>${escapeHtml(samples)}</td>
        <td>${escapeHtml(scenario.taskSummary ?? scenario.configurationCache ?? "")}</td>
      </tr>`;
    })
    .join("\n");
  return `<table>
    <thead>
      <tr>
        <th>Kịch bản</th>
        <th>Tương đương Maven</th>
        <th>Median wall</th>
        <th>Median Gradle</th>
        <th>Các lần đo</th>
        <th>Task</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderMapping() {
  const rows = [
    ["mvn, JVM mới mỗi lần", "Gradle --no-daemon", "config-no-daemon và compile-ci-shape"],
    ["mvnd", "Gradle Daemon", "config-daemon"],
    ["mvn -T 1C", "--parallel", "mọi kịch bản compile"],
    ["maven-build-cache-extension", "Build cache local", "compile-cache-store rồi compile-cache-hit"],
    ["Không có tương đương ổn định", "Configuration cache", "config-configuration-cache"],
    ["mvn package lần hai", "Incremental, không clean", "compile-incremental"],
    [".mvn/jvm.config", "org.gradle.jvmargs", "Heap đo cố định 2GB trong GRADLE_USER_HOME"],
  ];
  return `<table>
    <thead><tr><th>mvn-perf</th><th>gradle-perf</th><th>Kịch bản</th></tr></thead>
    <tbody>
      ${rows
        .map(
          ([maven, gradle, scenario]) =>
            `<tr><td>${escapeHtml(maven)}</td><td>${escapeHtml(gradle)}</td><td>${escapeHtml(scenario)}</td></tr>`,
        )
        .join("\n      ")}
    </tbody>
  </table>`;
}

function renderEnvironment(environment) {
  const fields = [
    ["Đo lúc", environment.measuredAt],
    ["Commit", environment.servicetalkCommit],
    ["Message", environment.servicetalkSubject],
    ["Gradle", environment.gradleVersion],
    ["Java", environment.javaVersion],
    ["Máy", `${environment.os}, ${environment.cpus} CPU, ${environment.memTotalMb}MB RAM`],
    ["Heap daemon", environment.gradleJvmArgs],
  ];
  return `<dl>
    ${fields.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(String(value ?? ""))}</dd>`).join("\n    ")}
  </dl>
  <p class="note">${escapeHtml(environment.heapNote)}</p>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
