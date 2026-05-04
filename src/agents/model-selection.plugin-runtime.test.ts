import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.js";

const normalizeProviderModelIdWithPluginMock = vi.fn();

vi.mock("./provider-model-normalization.runtime.js", () => ({
  getProviderModelNormalizationRuntimeCacheKey: () => "test-runtime",
  normalizeProviderModelIdWithRuntime: (params: unknown) =>
    normalizeProviderModelIdWithPluginMock(params),
}));

describe("model-selection plugin runtime normalization", () => {
  beforeEach(() => {
    vi.resetModules();
    normalizeProviderModelIdWithPluginMock.mockReset();
  });

  it("delegates provider-owned model id normalization to plugin runtime hooks", async () => {
    normalizeProviderModelIdWithPluginMock.mockImplementation(({ provider, context }) => {
      if (
        provider === "custom-provider" &&
        (context as { modelId?: string }).modelId === "custom-legacy-model"
      ) {
        return "custom-modern-model";
      }
      return undefined;
    });

    const { parseModelRef } = await import("./model-selection.js");

    expect(parseModelRef("custom-legacy-model", "custom-provider")).toEqual({
      provider: "custom-provider",
      model: "custom-modern-model",
    });
    expect(normalizeProviderModelIdWithPluginMock).toHaveBeenCalledWith({
      provider: "custom-provider",
      context: {
        provider: "custom-provider",
        modelId: "custom-legacy-model",
      },
    });
  });

  it("keeps static normalization while skipping plugin runtime hooks when disabled", async () => {
    const { parseModelRef } = await import("./model-selection.js");

    expect(
      parseModelRef("gemini-3.1-pro", "google", {
        allowPluginNormalization: false,
      }),
    ).toEqual({
      provider: "google",
      model: "gemini-3.1-pro-preview",
    });
    expect(normalizeProviderModelIdWithPluginMock).not.toHaveBeenCalled();
  });

  it("reuses config model-selection indexes across alias and allowlist builders", async () => {
    normalizeProviderModelIdWithPluginMock.mockImplementation(({ context }) => {
      const modelId = (context as { modelId?: string }).modelId;
      return modelId === "custom-legacy-model" ? "custom-modern-model" : undefined;
    });
    const { buildConfiguredAllowlistKeys, buildModelAliasIndex, modelKey } =
      await import("./model-selection.js");
    const cfg = {
      agents: {
        defaults: {
          models: {
            "custom-provider/custom-legacy-model": { alias: "legacy" },
            "custom-provider/custom-other-model": {},
          },
        },
      },
    } as OpenClawConfig;

    const firstAliases = buildModelAliasIndex({
      cfg,
      defaultProvider: "custom-provider",
    });
    const firstAllowlist = buildConfiguredAllowlistKeys({
      cfg,
      defaultProvider: "custom-provider",
    });
    firstAliases.byAlias.clear();
    firstAllowlist?.clear();

    const secondAliases = buildModelAliasIndex({
      cfg,
      defaultProvider: "custom-provider",
    });
    const secondAllowlist = buildConfiguredAllowlistKeys({
      cfg,
      defaultProvider: "custom-provider",
    });

    expect(normalizeProviderModelIdWithPluginMock).toHaveBeenCalledTimes(2);
    expect(secondAliases.byAlias.get("legacy")?.ref).toEqual({
      provider: "custom-provider",
      model: "custom-modern-model",
    });
    expect(secondAllowlist?.has(modelKey("custom-provider", "custom-modern-model"))).toBe(true);
    expect(secondAllowlist?.has(modelKey("custom-provider", "custom-other-model"))).toBe(true);
  });
});
