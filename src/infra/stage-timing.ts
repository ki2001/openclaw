export type StageTiming = {
  name: string;
  durationMs: number;
  elapsedMs: number;
};

export type StageSummary = {
  totalMs: number;
  stages: StageTiming[];
};

export type StageTracker = {
  mark: (name: string) => void;
  snapshot: () => StageSummary;
};

export type StageLogger = {
  isEnabled: (level: "debug" | "trace") => boolean;
  debug: (message: string) => void;
  trace: (message: string) => void;
  warn: (message: string) => void;
};

const DEFAULT_STAGE_WARN_TOTAL_MS = 10_000;
const DEFAULT_STAGE_WARN_STAGE_MS = 5_000;

export function createStageTracker(options?: { now?: () => number }): StageTracker {
  const now = options?.now ?? Date.now;
  const startedAt = now();
  let previousAt = startedAt;
  const stages: StageTiming[] = [];

  const toMs = (value: number) => Math.max(0, Math.round(value));

  return {
    mark(name) {
      const currentAt = now();
      stages.push({
        name,
        durationMs: toMs(currentAt - previousAt),
        elapsedMs: toMs(currentAt - startedAt),
      });
      previousAt = currentAt;
    },
    snapshot() {
      return {
        totalMs: toMs(now() - startedAt),
        stages: stages.slice(),
      };
    },
  };
}

function shouldWarnStageSummary(
  summary: StageSummary,
  options?: {
    totalThresholdMs?: number;
    stageThresholdMs?: number;
  },
): boolean {
  const totalThresholdMs = options?.totalThresholdMs ?? DEFAULT_STAGE_WARN_TOTAL_MS;
  const stageThresholdMs = options?.stageThresholdMs ?? DEFAULT_STAGE_WARN_STAGE_MS;
  return (
    summary.totalMs >= totalThresholdMs ||
    summary.stages.some((stage) => stage.durationMs >= stageThresholdMs)
  );
}

function formatStageSummary(prefix: string, summary: StageSummary): string {
  const stages =
    summary.stages.length > 0
      ? summary.stages
          .map((stage) => `${stage.name}:${stage.durationMs}ms@${stage.elapsedMs}ms`)
          .join(",")
      : "none";
  return `${prefix} totalMs=${summary.totalMs} stages=${stages}`;
}

export function emitStageSummary(params: {
  logger: StageLogger;
  prefix: string;
  summary: StageSummary;
  normalLevel?: "debug" | "trace";
  totalThresholdMs?: number;
  stageThresholdMs?: number;
}): boolean {
  const shouldWarn = shouldWarnStageSummary(params.summary, {
    totalThresholdMs: params.totalThresholdMs,
    stageThresholdMs: params.stageThresholdMs,
  });
  const normalLevel = params.normalLevel ?? "debug";
  if (!shouldWarn && !params.logger.isEnabled(normalLevel)) {
    return false;
  }
  const message = formatStageSummary(params.prefix, params.summary);
  if (shouldWarn) {
    params.logger.warn(message);
  } else if (normalLevel === "trace") {
    params.logger.trace(message);
  } else {
    params.logger.debug(message);
  }
  return true;
}
