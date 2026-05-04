import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderWrapStreamFnContext } from "openclaw/plugin-sdk/plugin-entry";
import { OPENROUTER_THINKING_STREAM_HOOKS } from "openclaw/plugin-sdk/provider-stream-family";
import {
  createDeepSeekV4OpenAICompatibleThinkingWrapper,
  createPayloadPatchStreamWrapper,
  stripTrailingAssistantPrefillMessages,
} from "openclaw/plugin-sdk/provider-stream-shared";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";
import { isOpenRouterDeepSeekV4ModelId } from "./models.js";
import {
  isOpenRouterProxyReasoningUnsupportedModel,
  normalizeOpenRouterBaseUrl,
  OPENROUTER_BASE_URL,
} from "./provider-catalog.js";

const log = createSubsystemLogger("openrouter-stream");

const RESPONSE_CACHE_HEADER = "X-OpenRouter-Cache";
const RESPONSE_CACHE_TTL_HEADER = "X-OpenRouter-Cache-TTL";
const RESPONSE_CACHE_CLEAR_HEADER = "X-OpenRouter-Cache-Clear";
const MIN_RESPONSE_CACHE_TTL_SECONDS = 1;
const MAX_RESPONSE_CACHE_TTL_SECONDS = 86_400;

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    return undefined;
  }
  return Number.parseInt(normalized, 10);
}

function getHeaderCaseInsensitive(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key ? headers[key] : undefined;
}

function resolveOpenRouterResponseCacheHeaders(
  extraParams: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  const rawConfig = extraParams?.responseCache ?? extraParams?.response_cache;
  const config =
    rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : undefined;
  const enabled =
    readBoolean(config?.enabled) ??
    readBoolean(extraParams?.responseCacheEnabled) ??
    readBoolean(extraParams?.response_cache_enabled) ??
    readBoolean(rawConfig);

  if (enabled !== true) {
    return undefined;
  }

  const rawTtlSeconds =
    config?.ttlSeconds ??
    config?.ttl_seconds ??
    config?.ttl ??
    extraParams?.responseCacheTtlSeconds ??
    extraParams?.response_cache_ttl_seconds;
  const ttlSeconds = readInteger(rawTtlSeconds);
  const clear =
    readBoolean(config?.clear) ??
    readBoolean(extraParams?.responseCacheClear) ??
    readBoolean(extraParams?.response_cache_clear);

  if (
    rawTtlSeconds !== undefined &&
    (ttlSeconds === undefined ||
      ttlSeconds < MIN_RESPONSE_CACHE_TTL_SECONDS ||
      ttlSeconds > MAX_RESPONSE_CACHE_TTL_SECONDS)
  ) {
    return undefined;
  }

  const headers: Record<string, string> = {
    [RESPONSE_CACHE_HEADER]: "true",
  };
  if (ttlSeconds !== undefined) {
    headers[RESPONSE_CACHE_TTL_HEADER] = String(ttlSeconds);
  }
  if (clear === true) {
    headers[RESPONSE_CACHE_CLEAR_HEADER] = "true";
  }
  return headers;
}

function mergeResponseCacheHeaders(
  options: Parameters<StreamFn>[2],
  responseCacheHeaders: Record<string, string> | undefined,
): Parameters<StreamFn>[2] {
  if (!responseCacheHeaders) {
    return options;
  }
  const currentHeaders = options?.headers;
  const headers = { ...currentHeaders };
  for (const [name, value] of Object.entries(responseCacheHeaders)) {
    if (getHeaderCaseInsensitive(currentHeaders, name) === undefined) {
      headers[name] = value;
    }
  }
  return {
    ...options,
    headers,
  };
}

function isOpenRouterAnthropicModelId(modelId: unknown): boolean {
  const normalized = readString(modelId)?.toLowerCase();
  return (
    normalized?.startsWith("anthropic/") === true ||
    normalized?.startsWith("openrouter/anthropic/") === true
  );
}

function isVerifiedOpenRouterRoute(model: Parameters<StreamFn>[0]): boolean {
  const provider = readString(model.provider)?.toLowerCase();
  const baseUrl = readString(model.baseUrl);
  if (baseUrl) {
    return normalizeOpenRouterBaseUrl(baseUrl) === OPENROUTER_BASE_URL;
  }
  return provider === "openrouter";
}

function shouldPatchAnthropicOpenRouterPayload(model: Parameters<StreamFn>[0]): boolean {
  const api = readString(model.api);
  return (
    (api === undefined || api === "openai-completions") &&
    isOpenRouterAnthropicModelId(model.id) &&
    isVerifiedOpenRouterRoute(model)
  );
}

function shouldPatchDeepSeekV4OpenRouterPayload(model: Parameters<StreamFn>[0]): boolean {
  const api = readString(model.api);
  return (
    (api === undefined || api === "openai-completions") &&
    isOpenRouterDeepSeekV4ModelId(model.id) &&
    isVerifiedOpenRouterRoute(model)
  );
}

function isEnabledReasoningValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "" && normalized !== "off" && normalized !== "none";
  }
  return true;
}

function isOpenRouterReasoningPayloadEnabled(payload: Record<string, unknown>): boolean {
  return (
    isEnabledReasoningValue(payload.reasoning) || isEnabledReasoningValue(payload.reasoning_effort)
  );
}

function injectOpenRouterRouting(
  baseStreamFn: StreamFn | undefined,
  providerRouting?: Record<string, unknown>,
): StreamFn | undefined {
  if (!providerRouting) {
    return baseStreamFn;
  }
  return (model, context, options) =>
    (
      baseStreamFn ??
      ((nextModel) => {
        throw new Error(
          `OpenRouter routing wrapper requires an underlying streamFn for ${nextModel.id}.`,
        );
      })
    )(
      {
        ...model,
        compat: { ...model.compat, openRouterRouting: providerRouting },
      } as typeof model,
      context,
      options,
    );
}

function injectOpenRouterResponseCache(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
): StreamFn | undefined {
  const responseCacheHeaders = resolveOpenRouterResponseCacheHeaders(extraParams);
  if (!responseCacheHeaders) {
    return baseStreamFn;
  }
  return (model, context, options) =>
    (
      baseStreamFn ??
      ((nextModel) => {
        throw new Error(
          `OpenRouter response-cache wrapper requires an underlying streamFn for ${nextModel.id}.`,
        );
      })
    )(model, context, mergeResponseCacheHeaders(options, responseCacheHeaders));
}

function createOpenRouterAnthropicPrefillWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  return createPayloadPatchStreamWrapper(
    baseStreamFn,
    ({ payload }) => {
      if (!isOpenRouterReasoningPayloadEnabled(payload)) {
        return;
      }
      const stripped = stripTrailingAssistantPrefillMessages(payload);
      if (stripped > 0) {
        log.warn(
          `removed ${stripped} trailing assistant prefill message${stripped === 1 ? "" : "s"} because OpenRouter-routed Anthropic reasoning requires conversations to end with a user turn`,
        );
      }
    },
    {
      shouldPatch: ({ model }) => shouldPatchAnthropicOpenRouterPayload(model),
    },
  );
}

function createOpenRouterDeepSeekV4ThinkingWrapper(
  baseStreamFn: StreamFn | undefined,
  thinkingLevel: ProviderWrapStreamFnContext["thinkingLevel"],
): StreamFn | undefined {
  return createDeepSeekV4OpenAICompatibleThinkingWrapper({
    baseStreamFn,
    thinkingLevel,
    shouldPatchModel: shouldPatchDeepSeekV4OpenRouterPayload,
  });
}

export function wrapOpenRouterProviderStream(
  ctx: ProviderWrapStreamFnContext,
): StreamFn | null | undefined {
  const providerRouting =
    ctx.extraParams?.provider != null && typeof ctx.extraParams.provider === "object"
      ? (ctx.extraParams.provider as Record<string, unknown>)
      : undefined;
  const routedStreamFn = providerRouting
    ? injectOpenRouterRouting(ctx.streamFn, providerRouting)
    : ctx.streamFn;
  const responseCacheStreamFn = injectOpenRouterResponseCache(routedStreamFn, ctx.extraParams);
  const wrapStreamFn = OPENROUTER_THINKING_STREAM_HOOKS.wrapStreamFn ?? undefined;
  if (!wrapStreamFn) {
    return createOpenRouterAnthropicPrefillWrapper(
      createOpenRouterDeepSeekV4ThinkingWrapper(responseCacheStreamFn, ctx.thinkingLevel),
    );
  }
  const wrappedStreamFn =
    wrapStreamFn({
      ...ctx,
      streamFn: responseCacheStreamFn,
      thinkingLevel: isOpenRouterProxyReasoningUnsupportedModel(ctx.modelId)
        ? undefined
        : ctx.thinkingLevel,
    }) ?? undefined;
  return createOpenRouterAnthropicPrefillWrapper(
    createOpenRouterDeepSeekV4ThinkingWrapper(wrappedStreamFn, ctx.thinkingLevel),
  );
}

export const __testing = {
  isOpenRouterDeepSeekV4ModelId,
  isOpenRouterAnthropicModelId,
  isOpenRouterReasoningPayloadEnabled,
  isVerifiedOpenRouterRoute,
  resolveOpenRouterResponseCacheHeaders,
  shouldPatchDeepSeekV4OpenRouterPayload,
  shouldPatchAnthropicOpenRouterPayload,
};
