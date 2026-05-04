import { resolveEffectiveModelFallbacks } from "../../agents/agent-scope.js";
import type { resolveProviderScopedAuthProfile } from "./agent-runner-auth-profile.js";
import type { FollowupRun } from "./queue.js";

export function resolveModelFallbackOptions(
  run: FollowupRun["run"],
  configOverride: FollowupRun["run"]["config"] = run.config,
) {
  const config = configOverride;
  return {
    cfg: config,
    provider: run.provider,
    model: run.model,
    agentDir: run.agentDir,
    authStore: run.authProfileStore,
    preflightAuthCooldown: false,
    fallbacksOverride: resolveEffectiveModelFallbacks({
      cfg: config,
      agentId: run.agentId,
      hasSessionModelOverride: run.hasSessionModelOverride === true,
      modelOverrideSource: run.modelOverrideSource,
    }),
  };
}

export function buildEmbeddedRunBaseParams(params: {
  run: FollowupRun["run"];
  provider: string;
  model: string;
  runId: string;
  authProfile: ReturnType<typeof resolveProviderScopedAuthProfile>;
  allowTransientCooldownProbe?: boolean;
  modelFallbacksOverride?: ReturnType<typeof resolveEffectiveModelFallbacks>;
}) {
  const config = params.run.config;
  const modelFallbacksOverride =
    params.modelFallbacksOverride ??
    resolveEffectiveModelFallbacks({
      cfg: config,
      agentId: params.run.agentId,
      hasSessionModelOverride: params.run.hasSessionModelOverride === true,
      modelOverrideSource: params.run.modelOverrideSource,
    });
  return {
    sessionId: params.run.sessionId,
    sessionFile: params.run.sessionFile,
    workspaceDir: params.run.workspaceDir,
    agentDir: params.run.agentDir,
    config,
    skillsSnapshot: params.run.skillsSnapshot,
    ownerNumbers: params.run.ownerNumbers,
    inputProvenance: params.run.inputProvenance,
    senderIsOwner: params.run.senderIsOwner,
    enforceFinalTag: params.run.skipProviderRuntimeHints ? false : params.run.enforceFinalTag,
    skipProviderRuntimeHints: params.run.skipProviderRuntimeHints,
    silentExpected: params.run.silentExpected,
    allowEmptyAssistantReplyAsSilent: params.run.allowEmptyAssistantReplyAsSilent,
    silentReplyPromptMode: params.run.silentReplyPromptMode,
    sourceReplyDeliveryMode: params.run.sourceReplyDeliveryMode,
    provider: params.provider,
    model: params.model,
    modelFallbacksOverride,
    ...params.authProfile,
    authProfileStore: params.run.authProfileStore,
    authProfileOrder: params.run.authProfileOrder,
    thinkLevel: params.run.thinkLevel,
    verboseLevel: params.run.verboseLevel,
    reasoningLevel: params.run.reasoningLevel,
    execOverrides: params.run.execOverrides,
    bashElevated: params.run.bashElevated,
    timeoutMs: params.run.timeoutMs,
    runId: params.runId,
    allowTransientCooldownProbe: params.allowTransientCooldownProbe,
  };
}
