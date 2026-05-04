import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderRuntimePluginHandle } from "../plugins/provider-hook-runtime.js";

const createTransportAwareStreamFnForModel = vi.fn();
const ensureCustomApiRegistered = vi.fn();
const resolveProviderStreamFn = vi.fn();

vi.mock("./custom-api-registry.js", () => ({
  ensureCustomApiRegistered,
}));

vi.mock("./provider-transport-stream.js", () => ({
  createTransportAwareStreamFnForModel,
}));

vi.mock("../plugins/provider-runtime.js", () => ({
  resolveProviderStreamFn,
}));

let registerProviderStreamForModel: typeof import("./provider-stream.js").registerProviderStreamForModel;

function buildModel(): Model<"openai-responses"> {
  return {
    id: "demo-model",
    name: "Demo Model",
    api: "openai-responses",
    provider: "demo",
    baseUrl: "https://api.example.com/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };
}

describe("registerProviderStreamForModel", () => {
  beforeAll(async () => {
    ({ registerProviderStreamForModel } = await import("./provider-stream.js"));
  });

  beforeEach(() => {
    createTransportAwareStreamFnForModel.mockReset();
    ensureCustomApiRegistered.mockReset();
    resolveProviderStreamFn.mockReset();
  });

  it("passes prepared provider runtime handles to stream hook resolution", () => {
    const model = buildModel();
    const streamFn = vi.fn() as unknown as StreamFn;
    const providerRuntimeHandle = {
      provider: "demo",
      plugin: {
        id: "demo",
        label: "Demo",
        auth: [],
      },
    } as ProviderRuntimePluginHandle;
    resolveProviderStreamFn.mockReturnValue(streamFn);

    expect(
      registerProviderStreamForModel({
        model,
        providerRuntimeHandle,
        workspaceDir: "/workspace",
      }),
    ).toBe(streamFn);

    expect(resolveProviderStreamFn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "demo",
        workspaceDir: "/workspace",
        runtimeHandle: providerRuntimeHandle,
        context: expect.objectContaining({
          provider: "demo",
          modelId: "demo-model",
          model,
        }),
      }),
    );
    expect(ensureCustomApiRegistered).toHaveBeenCalledWith("openai-responses", streamFn);
  });
});
