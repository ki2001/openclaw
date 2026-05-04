import { createRequire } from "node:module";

type ProviderRuntimeModule = Pick<
  typeof import("../plugins/provider-runtime.js"),
  "normalizeProviderModelIdWithPlugin"
>;
type PluginRuntimeStateModule = Pick<
  typeof import("../plugins/runtime.js"),
  "getActivePluginGatewayRuntimeRegistryVersion" | "getActivePluginRegistryVersion"
>;

const require = createRequire(import.meta.url);
const PROVIDER_RUNTIME_CANDIDATES = [
  "../plugins/provider-runtime.js",
  "../plugins/provider-runtime.ts",
] as const;
const PLUGIN_RUNTIME_STATE_CANDIDATES = ["../plugins/runtime.js", "../plugins/runtime.ts"] as const;

let providerRuntimeModule: ProviderRuntimeModule | undefined;
let pluginRuntimeStateModule: PluginRuntimeStateModule | undefined;

function loadProviderRuntime(): ProviderRuntimeModule | null {
  if (providerRuntimeModule) {
    return providerRuntimeModule;
  }
  for (const candidate of PROVIDER_RUNTIME_CANDIDATES) {
    try {
      providerRuntimeModule = require(candidate) as ProviderRuntimeModule;
      return providerRuntimeModule;
    } catch {
      // Try source/runtime candidates in order.
    }
  }
  return null;
}

function loadPluginRuntimeState(): PluginRuntimeStateModule | null {
  if (pluginRuntimeStateModule) {
    return pluginRuntimeStateModule;
  }
  for (const candidate of PLUGIN_RUNTIME_STATE_CANDIDATES) {
    try {
      pluginRuntimeStateModule = require(candidate) as PluginRuntimeStateModule;
      return pluginRuntimeStateModule;
    } catch {
      // Try source/runtime candidates in order.
    }
  }
  return null;
}

export function getProviderModelNormalizationRuntimeCacheKey(): string {
  const runtime = loadPluginRuntimeState();
  const gatewayVersion = runtime?.getActivePluginGatewayRuntimeRegistryVersion?.();
  if (typeof gatewayVersion === "number") {
    return `gateway:${gatewayVersion}`;
  }
  const activeVersion = runtime?.getActivePluginRegistryVersion?.();
  return typeof activeVersion === "number" ? `active:${activeVersion}` : "none";
}

export function normalizeProviderModelIdWithRuntime(params: {
  provider: string;
  context: {
    provider: string;
    modelId: string;
  };
}): string | undefined {
  return loadProviderRuntime()?.normalizeProviderModelIdWithPlugin(params);
}
