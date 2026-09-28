const compileProjects = [
  "servicetalk-buffer-api",
  "servicetalk-concurrent-api",
  "servicetalk-http-api",
];

const plainConsole = ["--console=plain", "--no-watch-fs"];

function projectTask(name) {
  return compileProjects.map((project) => `:${project}:${name}`);
}

function cleanAndAssemble() {
  return [...projectTask("clean"), ...projectTask("assemble")];
}

function scenario(definition) {
  return {
    warmupIterations: 0,
    measuredIterations: 1,
    stopDaemonBefore: false,
    ...definition,
    args: [...plainConsole, ...definition.args],
  };
}

export const compileProjectsUnderTest = compileProjects;

export function buildScenarios() {
  return [
    scenario({
      id: "config-no-daemon",
      group: "configuration",
      title: "help, JVM mới",
      mvnAnalogue: "mvn help, không có mvnd",
      tasks: ["help"],
      args: [
        "--no-daemon",
        "--no-parallel",
        "--no-build-cache",
        "--no-configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 2,
      stopDaemonBefore: true,
    }),
    scenario({
      id: "config-daemon",
      group: "configuration",
      title: "help, daemon nóng",
      mvnAnalogue: "mvnd help, một luồng",
      tasks: ["help"],
      args: [
        "--no-parallel",
        "--no-build-cache",
        "--no-configure-on-demand",
        "--no-configuration-cache",
      ],
      warmupIterations: 1,
      measuredIterations: 3,
      stopDaemonBefore: true,
    }),
    scenario({
      id: "config-servicetalk-defaults",
      group: "configuration",
      title: "help, cờ mặc định của ServiceTalk",
      mvnAnalogue: "mvnd -T 1C với build cache bật",
      tasks: ["help"],
      args: [
        "--parallel",
        "--build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      warmupIterations: 1,
      measuredIterations: 3,
      stopDaemonBefore: true,
    }),
    scenario({
      id: "config-configuration-cache",
      group: "configuration",
      title: "help, configuration cache",
      mvnAnalogue: "không có tương đương ổn định bên Maven",
      tasks: ["help"],
      args: [
        "--parallel",
        "--build-cache",
        "--no-configure-on-demand",
        "--configuration-cache",
      ],
      warmupIterations: 1,
      measuredIterations: 2,
      stopDaemonBefore: true,
    }),
    scenario({
      id: "compile-no-cache",
      group: "compile",
      title: "clean + assemble, không cache",
      mvnAnalogue: "mvn clean package -T 1C, không build cache",
      tasks: cleanAndAssemble(),
      args: [
        "--parallel",
        "--no-build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 1,
      stopDaemonBefore: true,
    }),
    scenario({
      id: "compile-incremental",
      group: "compile",
      title: "assemble lại, không đổi source",
      mvnAnalogue: "mvn package lần hai, compiler incremental",
      tasks: projectTask("assemble"),
      args: [
        "--parallel",
        "--no-build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 2,
      stopDaemonBefore: false,
    }),
    scenario({
      id: "compile-cache-store",
      group: "compile",
      title: "clean + assemble, ghi build cache",
      mvnAnalogue: "lần đầu chạy với maven-build-cache-extension",
      tasks: cleanAndAssemble(),
      args: [
        "--parallel",
        "--build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 1,
      stopDaemonBefore: false,
    }),
    scenario({
      id: "compile-cache-hit",
      group: "compile",
      title: "clean + assemble, đọc build cache",
      mvnAnalogue: "clean package khi cache đã có entry",
      tasks: cleanAndAssemble(),
      args: [
        "--parallel",
        "--build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 2,
      stopDaemonBefore: false,
    }),
    scenario({
      id: "compile-ci-shape",
      group: "compile",
      title: "CI ServiceTalk: không daemon, có cache",
      mvnAnalogue: "mvn sạch trên runner mới, cache ~/.m2 đã restore",
      tasks: cleanAndAssemble(),
      args: [
        "--no-daemon",
        "--parallel",
        "--build-cache",
        "--configure-on-demand",
        "--no-configuration-cache",
      ],
      measuredIterations: 1,
      stopDaemonBefore: true,
    }),
  ];
}
