import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicGenerationProviderPlugin } from "../plugins/types.js";

const { resolvePluginCapabilityProviderMock, resolvePluginCapabilityProvidersMock } = vi.hoisted(
  () => ({
    resolvePluginCapabilityProviderMock: vi.fn<() => MusicGenerationProviderPlugin | undefined>(),
    resolvePluginCapabilityProvidersMock: vi.fn<() => MusicGenerationProviderPlugin[]>(() => []),
  }),
);

vi.mock("../plugins/capability-provider-runtime.js", () => ({
  resolvePluginCapabilityProvider: resolvePluginCapabilityProviderMock,
  resolvePluginCapabilityProviders: resolvePluginCapabilityProvidersMock,
}));

function createProvider(
  params: Pick<MusicGenerationProviderPlugin, "id"> & Partial<MusicGenerationProviderPlugin>,
): MusicGenerationProviderPlugin {
  return {
    label: params.id,
    capabilities: {},
    generateMusic: async () => ({
      tracks: [{ buffer: Buffer.from("track"), mimeType: "audio/mpeg" }],
    }),
    ...params,
  };
}

async function loadProviderRegistry() {
  vi.resetModules();
  return await import("./provider-registry.js");
}

describe("music-generation provider registry", () => {
  beforeEach(() => {
    vi.resetModules();
    resolvePluginCapabilityProviderMock.mockReset();
    resolvePluginCapabilityProviderMock.mockReturnValue(undefined);
    resolvePluginCapabilityProvidersMock.mockReset();
    resolvePluginCapabilityProvidersMock.mockReturnValue([]);
  });

  it("delegates provider listing to the capability provider boundary", async () => {
    const { listMusicGenerationProviders } = await loadProviderRegistry();

    expect(listMusicGenerationProviders()).toEqual([]);
    expect(resolvePluginCapabilityProvidersMock).toHaveBeenCalledWith({
      key: "musicGenerationProviders",
      cfg: undefined,
    });
  });

  it("uses direct provider resolution for explicit ids", async () => {
    resolvePluginCapabilityProviderMock.mockReturnValue(createProvider({ id: "custom-music" }));
    const { getMusicGenerationProvider } = await loadProviderRegistry();

    const provider = getMusicGenerationProvider("custom-music");

    expect(provider?.id).toBe("custom-music");
    expect(resolvePluginCapabilityProviderMock).toHaveBeenCalledWith({
      key: "musicGenerationProviders",
      providerId: "custom-music",
      cfg: undefined,
    });
    expect(resolvePluginCapabilityProvidersMock).not.toHaveBeenCalled();
  });

  it("falls back to alias maps when direct provider resolution misses", async () => {
    resolvePluginCapabilityProvidersMock.mockReturnValue([
      createProvider({ id: "safe-music", aliases: ["safe-alias"] }),
    ]);
    const { getMusicGenerationProvider } = await loadProviderRegistry();

    const provider = getMusicGenerationProvider("safe-alias");

    expect(provider?.id).toBe("safe-music");
    expect(resolvePluginCapabilityProviderMock).toHaveBeenCalledWith({
      key: "musicGenerationProviders",
      providerId: "safe-alias",
      cfg: undefined,
    });
  });
});
