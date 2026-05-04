import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { CronJob } from "../types.js";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  buildModelAliasIndex,
  getModelRefStatus,
  inferUniqueProviderFromConfiguredModels,
  loadModelCatalog,
  normalizeModelSelection,
  resolveAllowedModelRef,
  resolveConfiguredModelRef,
  resolveHooksGmailModel,
  resolveModelCatalogScope,
  resolveModelRefFromString,
} from "./run-model-selection.runtime.js";

type CronSessionModelOverrides = {
  modelOverride?: string;
  providerOverride?: string;
};

export type ResolveCronModelSelectionParams = {
  cfg: OpenClawConfig;
  cfgWithAgentDefaults: OpenClawConfig;
  agentConfigOverride?: {
    model?: unknown;
    subagents?: {
      model?: unknown;
    };
  };
  sessionEntry: CronSessionModelOverrides;
  payload: CronJob["payload"];
  isGmailHook: boolean;
  agentId?: string;
};

export type ResolveCronModelSelectionResult =
  | {
      ok: true;
      provider: string;
      model: string;
    }
  | {
      ok: false;
      error: string;
    };

function formatCronPayloadModelRejection(modelOverride: string, error: string): string {
  if (error.startsWith("model not allowed:")) {
    const modelRef = error.slice("model not allowed:".length).trim();
    return `cron payload.model '${modelOverride}' rejected by agents.defaults.models allowlist: ${modelRef}`;
  }
  return `cron payload.model '${modelOverride}' rejected: ${error}`;
}

export async function resolveCronModelSelection(
  params: ResolveCronModelSelectionParams,
): Promise<ResolveCronModelSelectionResult> {
  const resolvedDefault = resolveConfiguredModelRef({
    cfg: params.cfgWithAgentDefaults,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  let provider = resolvedDefault.provider;
  let model = resolvedDefault.model;

  let catalog: Awaited<ReturnType<typeof loadModelCatalog>> = [];
  let loadedFullCatalog = false;
  const loadedCatalogScopeKeys = new Set<string>();
  const appendCatalog = (entries: Awaited<ReturnType<typeof loadModelCatalog>>) => {
    const seen = new Set(catalog.map((entry) => `${entry.provider}/${entry.id}`));
    for (const entry of entries) {
      const key = `${entry.provider}/${entry.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      catalog.push(entry);
    }
  };
  const loadCatalogOnce = async (scope?: { providerRefs: string[]; modelRefs: string[] }) => {
    if (loadedFullCatalog) {
      return catalog;
    }
    if (!scope) {
      catalog = await loadModelCatalog({
        config: params.cfgWithAgentDefaults,
      });
      loadedFullCatalog = true;
      return catalog;
    }
    const scopeKey = JSON.stringify({
      providerRefs: scope.providerRefs,
      modelRefs: scope.modelRefs,
    });
    if (!loadedCatalogScopeKeys.has(scopeKey)) {
      loadedCatalogScopeKeys.add(scopeKey);
      appendCatalog(
        await loadModelCatalog({
          config: params.cfgWithAgentDefaults,
          providerRefs: scope.providerRefs,
          modelRefs: scope.modelRefs,
        }),
      );
    }
    return catalog;
  };
  const resolveRawCatalogScope = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return undefined;
    }
    const defaultProvider = !trimmed.includes("/")
      ? (inferUniqueProviderFromConfiguredModels({
          cfg: params.cfgWithAgentDefaults,
          model: trimmed,
        }) ?? resolvedDefault.provider)
      : resolvedDefault.provider;
    const aliasIndex = buildModelAliasIndex({
      cfg: params.cfgWithAgentDefaults,
      defaultProvider,
    });
    const resolved = resolveModelRefFromString({
      cfg: params.cfgWithAgentDefaults,
      raw: trimmed,
      defaultProvider,
      aliasIndex,
    });
    if (!resolved) {
      return undefined;
    }
    return resolveModelCatalogScope({
      cfg: params.cfgWithAgentDefaults,
      provider: resolved.ref.provider,
      model: resolved.ref.model,
    });
  };

  const subagentModelRaw =
    normalizeModelSelection(params.agentConfigOverride?.subagents?.model) ??
    normalizeModelSelection(params.agentConfigOverride?.model) ??
    normalizeModelSelection(params.cfg.agents?.defaults?.subagents?.model);
  if (subagentModelRaw) {
    const resolvedSubagent = resolveAllowedModelRef({
      cfg: params.cfgWithAgentDefaults,
      catalog: await loadCatalogOnce(resolveRawCatalogScope(subagentModelRaw)),
      raw: subagentModelRaw,
      defaultProvider: resolvedDefault.provider,
      defaultModel: resolvedDefault.model,
    });
    if (!("error" in resolvedSubagent)) {
      provider = resolvedSubagent.ref.provider;
      model = resolvedSubagent.ref.model;
    }
  }

  let hooksGmailModelApplied = false;
  const hooksGmailModelRef = params.isGmailHook
    ? resolveHooksGmailModel({
        cfg: params.cfg,
        defaultProvider: DEFAULT_PROVIDER,
      })
    : null;
  if (hooksGmailModelRef) {
    const status = getModelRefStatus({
      cfg: params.cfg,
      catalog: await loadCatalogOnce(
        resolveModelCatalogScope({
          cfg: params.cfgWithAgentDefaults,
          provider: hooksGmailModelRef.provider,
          model: hooksGmailModelRef.model,
        }),
      ),
      ref: hooksGmailModelRef,
      defaultProvider: resolvedDefault.provider,
      defaultModel: resolvedDefault.model,
    });
    if (status.allowed) {
      provider = hooksGmailModelRef.provider;
      model = hooksGmailModelRef.model;
      hooksGmailModelApplied = true;
    }
  }

  const modelOverrideRaw = params.payload.kind === "agentTurn" ? params.payload.model : undefined;
  const modelOverride = typeof modelOverrideRaw === "string" ? modelOverrideRaw.trim() : undefined;
  if (modelOverride !== undefined && modelOverride.length > 0) {
    const resolvedOverride = resolveAllowedModelRef({
      cfg: params.cfgWithAgentDefaults,
      catalog: await loadCatalogOnce(resolveRawCatalogScope(modelOverride)),
      raw: modelOverride,
      defaultProvider: resolvedDefault.provider,
      defaultModel: resolvedDefault.model,
    });
    if ("error" in resolvedOverride) {
      return {
        ok: false,
        error: formatCronPayloadModelRejection(modelOverride, resolvedOverride.error),
      };
    }
    provider = resolvedOverride.ref.provider;
    model = resolvedOverride.ref.model;
  }

  if (!modelOverride && !hooksGmailModelApplied) {
    const sessionModelOverride = params.sessionEntry.modelOverride?.trim();
    if (sessionModelOverride) {
      const sessionProviderOverride =
        params.sessionEntry.providerOverride?.trim() || resolvedDefault.provider;
      const resolvedSessionOverride = resolveAllowedModelRef({
        cfg: params.cfgWithAgentDefaults,
        catalog: await loadCatalogOnce(
          resolveModelCatalogScope({
            cfg: params.cfgWithAgentDefaults,
            provider: sessionProviderOverride,
            model: sessionModelOverride,
          }),
        ),
        raw: `${sessionProviderOverride}/${sessionModelOverride}`,
        defaultProvider: resolvedDefault.provider,
        defaultModel: resolvedDefault.model,
      });
      if (!("error" in resolvedSessionOverride)) {
        provider = resolvedSessionOverride.ref.provider;
        model = resolvedSessionOverride.ref.model;
      }
    }
  }

  return { ok: true, provider, model };
}
