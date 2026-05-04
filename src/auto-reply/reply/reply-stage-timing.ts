import {
  createStageTracker,
  emitStageSummary,
  type StageSummary,
  type StageTracker,
} from "../../infra/stage-timing.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

export type ReplyStageTracker = StageTracker;
export type ReplyStageSummary = StageSummary;

export const ReplyStageName = {
  preparedContext: "prepared-context",
  bareResetPrep: "bare-reset-prep",
  userPromptPrep: "user-prompt-prep",
  skillSnapshot: "skill-snapshot",
  promptBodies: "prompt-bodies",
  thinkingCatalog: "thinking-catalog",
  sessionState: "session-state",
  queueRuntime: "queue-runtime",
  authProfile: "auth-profile",
  activeQueue: "active-queue",
  followupRun: "followup-run",
  typingRunStart: "typing-run-start",
  preflightCompaction: "preflight-compaction",
  memoryFlush: "memory-flush",
  followupRunner: "followup-runner",
  replyOperationStart: "reply-operation-start",
  queuedRuntimeConfig: "queued-runtime-config",
  replyMediaContext: "reply-media-context",
  agentRunContext: "agent-run-context",
  fallbackSetup: "fallback-setup",
  fallbackCandidateSelection: "fallback-candidate-selection",
  runtimeSelection: "runtime-selection",
  embeddedRunParams: "embedded-run-params",
  embeddedRunDispatch: "embedded-run-dispatch",
} as const;

const log = createSubsystemLogger("reply-path");
const REPLY_STAGE_WARN_TOTAL_MS = 5_000;
const REPLY_STAGE_WARN_STAGE_MS = 2_000;

export function createReplyStageTracker(options?: { now?: () => number }): ReplyStageTracker {
  return createStageTracker(options);
}

export function emitReplyStageSummary(params: {
  runId: string;
  sessionId: string;
  phase: string;
  tracker: ReplyStageTracker;
  normalLevel?: "debug" | "trace";
}): boolean {
  return emitStageSummary({
    logger: log,
    prefix: `[timing:reply-run] pre-dispatch stages: runId=${params.runId} sessionId=${params.sessionId} phase=${params.phase}`,
    summary: params.tracker.snapshot(),
    normalLevel: params.normalLevel,
    totalThresholdMs: REPLY_STAGE_WARN_TOTAL_MS,
    stageThresholdMs: REPLY_STAGE_WARN_STAGE_MS,
  });
}
