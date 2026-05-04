import { beforeEach, describe, expect, it, vi } from "vitest";

const discoverAuthStorageMock = vi.fn<(agentDir?: string) => { mocked: true }>(() => ({
  mocked: true,
}));
const discoverModelsMock = vi.fn<
  (authStorage: unknown, agentDir: string) => { find: ReturnType<typeof vi.fn> }
>(() => ({ find: vi.fn(() => null) }));
const ensureOpenClawModelsJsonMock = vi.fn<
  (
    cfg?: unknown,
    agentDir?: string,
    options?: unknown,
  ) => Promise<{ agentDir: string; wrote: boolean }>
>(async (_cfg, agentDir) => ({
  agentDir: typeof agentDir === "string" ? agentDir : "/tmp/agent",
  wrote: true,
}));

const prepareProviderDynamicModelMock = vi.fn<(params: unknown) => Promise<void>>(async () => {});
let dynamicAttempts = 0;
const runProviderDynamicModelMock = vi.fn<(params: unknown) => unknown>(() =>
  dynamicAttempts > 1
    ? {
        id: "gpt-5.4",
        name: "gpt-5.4",
        provider: "openai-codex",
        api: "openai-codex-responses",
        baseUrl: "https://chatgpt.com/backend-api",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_050_000,
        maxTokens: 128_000,
      }
    : undefined,
);

function makeDynamicModel(provider = "openai-codex", modelId = "gpt-5.4") {
  return {
    id: modelId,
    name: modelId,
    provider,
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_050_000,
    maxTokens: 128_000,
  };
}

vi.mock("../pi-model-discovery.js", () => ({
  discoverAuthStorage: discoverAuthStorageMock,
  discoverModels: discoverModelsMock,
}));

vi.mock("../models-config.js", () => ({
  ensureOpenClawModelsJson: (...args: unknown[]) => ensureOpenClawModelsJsonMock(...args),
}));

vi.mock("../../plugins/provider-runtime.js", () => ({
  applyProviderResolvedModelCompatWithPlugins: () => undefined,
  applyProviderResolvedTransportWithPlugin: () => undefined,
  buildProviderUnknownModelHintWithPlugin: () => undefined,
  normalizeProviderResolvedModelWithPlugin: () => undefined,
  normalizeProviderTransportWithPlugin: () => undefined,
  prepareProviderDynamicModel: async () => {},
  runProviderDynamicModel: () => undefined,
  shouldPreferProviderRuntimeResolvedModel: () => false,
}));

describe("resolveModelAsync startup retry", () => {
  const runtimeHooks = {
    applyProviderResolvedModelCompatWithPlugins: () => undefined,
    buildProviderUnknownModelHintWithPlugin: () => undefined,
    normalizeProviderResolvedModelWithPlugin: () => undefined,
    normalizeProviderTransportWithPlugin: () => undefined,
    prepareProviderDynamicModel: (params: unknown) => prepareProviderDynamicModelMock(params),
    runProviderDynamicModel: (params: unknown) => runProviderDynamicModelMock(params),
    applyProviderResolvedTransportWithPlugin: () => undefined,
  };

  beforeEach(() => {
    const modelTesting = vi.importActual<typeof import("./model.js")>("./model.js");
    dynamicAttempts = 0;
    prepareProviderDynamicModelMock.mockClear();
    prepareProviderDynamicModelMock.mockImplementation(async () => {
      dynamicAttempts += 1;
    });
    runProviderDynamicModelMock.mockClear();
    discoverAuthStorageMock.mockClear();
    discoverModelsMock.mockClear();
    ensureOpenClawModelsJsonMock.mockClear();
    return modelTesting.then(({ __testing }) => {
      __testing.clearSkipPiDiscoveryModelCacheForTest();
    });
  });

  it("retries once after a transient provider-runtime miss", async () => {
    const { resolveModelAsync } = await import("./model.js");

    const result = await resolveModelAsync(
      "openai-codex",
      "gpt-5.4",
      "/tmp/agent",
      {},
      {
        retryTransientProviderRuntimeMiss: true,
        runtimeHooks,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.model).toMatchObject({
      provider: "openai-codex",
      id: "gpt-5.4",
      api: "openai-codex-responses",
    });
    expect(prepareProviderDynamicModelMock).toHaveBeenCalledTimes(2);
    expect(runProviderDynamicModelMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry during steady-state misses", async () => {
    const { resolveModelAsync } = await import("./model.js");

    const result = await resolveModelAsync(
      "openai-codex",
      "gpt-5.4",
      "/tmp/agent",
      {},
      { runtimeHooks },
    );

    expect(result.model).toBeUndefined();
    expect(result.error).toBe("Unknown model: openai-codex/gpt-5.4");
    expect(prepareProviderDynamicModelMock).toHaveBeenCalledTimes(1);
    expect(runProviderDynamicModelMock).toHaveBeenCalledTimes(1);
  });

  it("prepares models.json explicitly for prepared-runtime resolution", async () => {
    const { preparePreparedRuntimeModelAsync } = await import("./model.js");

    await preparePreparedRuntimeModelAsync(
      "acme",
      "/tmp/agent",
      {},
      {
        workspaceDir: "/tmp/workspace",
        providerDiscoveryProviderIds: ["acme"],
        providerDiscoveryTimeoutMs: 1234,
        providerDiscoveryEntriesOnly: true,
      },
    );

    expect(ensureOpenClawModelsJsonMock).toHaveBeenCalledTimes(1);
    expect(ensureOpenClawModelsJsonMock).toHaveBeenCalledWith({}, "/tmp/agent", {
      workspaceDir: "/tmp/workspace",
      providerDiscoveryProviderIds: ["acme"],
      providerDiscoveryTimeoutMs: 1234,
      providerDiscoveryEntriesOnly: true,
    });
  });

  it("keeps prepared-runtime resolution on the lean path", async () => {
    runProviderDynamicModelMock.mockImplementation(() =>
      dynamicAttempts > 0 ? makeDynamicModel("acme", "special") : undefined,
    );
    const { resolvePreparedRuntimeModelAsync } = await import("./model.js");

    const result = await resolvePreparedRuntimeModelAsync(
      "acme",
      "special",
      "/tmp/agent",
      {},
      {
        runtimeHooks,
      },
    );

    expect(result.model).toMatchObject({
      provider: "acme",
      id: "special",
      api: "openai-codex-responses",
    });
    expect(ensureOpenClawModelsJsonMock).not.toHaveBeenCalled();
    expect(prepareProviderDynamicModelMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the lean-path miss without hidden models.json fallback", async () => {
    runProviderDynamicModelMock.mockImplementation(() => undefined);
    const { resolvePreparedRuntimeModelAsync } = await import("./model.js");

    const result = await resolvePreparedRuntimeModelAsync(
      "acme",
      "special",
      "/tmp/agent",
      {},
      {
        runtimeHooks,
      },
    );

    expect(result.model).toBeUndefined();
    expect(result.error).toBe("Unknown model: acme/special");
    expect(ensureOpenClawModelsJsonMock).not.toHaveBeenCalled();
    expect(prepareProviderDynamicModelMock).toHaveBeenCalledTimes(1);
  });
});
