import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";

const mocks = vi.hoisted(() => ({
  getRuntimeConfig: vi.fn(() => ({})),
  listLoadedSpeechProviders: vi.fn(() => []),
  listSpeechProviders: vi.fn(() => {
    throw new Error("broad speech provider registry should not be used by Gateway TTS RPCs");
  }),
  resolveExplicitTtsOverrides: vi.fn(() => ({})),
  textToSpeech: vi.fn(async () => ({
    success: true,
    audioPath: "/tmp/tts.mp3",
    provider: "openai",
    outputFormat: "mp3",
    voiceCompatible: false,
  })),
}));

vi.mock("../../config/config.js", () => ({
  getRuntimeConfig:
    mocks.getRuntimeConfig as typeof import("../../config/config.js").getRuntimeConfig,
}));

vi.mock("../../tts/provider-registry.js", () => ({
  canonicalizeSpeechProviderId: vi.fn(),
  getSpeechProvider: vi.fn(),
  listLoadedSpeechProviders:
    mocks.listLoadedSpeechProviders as typeof import("../../tts/provider-registry.js").listLoadedSpeechProviders,
  listSpeechProviders:
    mocks.listSpeechProviders as typeof import("../../tts/provider-registry.js").listSpeechProviders,
}));

vi.mock("../../tts/tts.js", () => ({
  getResolvedSpeechProviderConfig: vi.fn(),
  getTtsPersona: vi.fn(() => undefined),
  getTtsProvider: vi.fn(() => "openai"),
  isTtsEnabled: vi.fn(() => true),
  isTtsProviderConfigured: vi.fn(() => true),
  listTtsPersonas: vi.fn(() => []),
  resolveExplicitTtsOverrides:
    mocks.resolveExplicitTtsOverrides as typeof import("../../tts/tts.js").resolveExplicitTtsOverrides,
  resolveTtsAutoMode: vi.fn(() => false),
  resolveTtsConfig: vi.fn(() => ({})),
  resolveTtsPrefsPath: vi.fn(() => "/tmp/tts.json"),
  resolveTtsProviderOrder: vi.fn(() => ["openai"]),
  setTtsEnabled: vi.fn(),
  setTtsPersona: vi.fn(),
  setTtsProvider: vi.fn(),
  textToSpeech: mocks.textToSpeech as typeof import("../../tts/tts.js").textToSpeech,
}));

describe("ttsHandlers", () => {
  beforeEach(() => {
    mocks.getRuntimeConfig.mockReset();
    mocks.getRuntimeConfig.mockReturnValue({});
    mocks.listLoadedSpeechProviders.mockReset();
    mocks.listLoadedSpeechProviders.mockReturnValue([]);
    mocks.listSpeechProviders.mockClear();
    mocks.resolveExplicitTtsOverrides.mockReset();
    mocks.resolveExplicitTtsOverrides.mockReturnValue({});
    mocks.textToSpeech.mockReset();
    mocks.textToSpeech.mockResolvedValue({
      success: true,
      audioPath: "/tmp/tts.mp3",
      provider: "openai",
      outputFormat: "mp3",
      voiceCompatible: false,
    });
  });

  it("returns INVALID_REQUEST when TTS override validation fails", async () => {
    mocks.resolveExplicitTtsOverrides.mockImplementation(() => {
      throw new Error('Unknown TTS provider "bad".');
    });

    const { ttsHandlers } = await import("./tts.js");
    const respond = vi.fn();

    await ttsHandlers["tts.convert"]({
      params: {
        text: "hello",
        provider: "bad",
      },
      respond,
      context: { getRuntimeConfig: mocks.getRuntimeConfig },
    } as never);

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Error: Unknown TTS provider "bad".',
      }),
    );
    expect(mocks.textToSpeech).not.toHaveBeenCalled();
  });

  it("uses loaded providers for status/provider listing RPCs", async () => {
    const provider = {
      id: "openai",
      label: "OpenAI",
      isConfigured: vi.fn(() => true),
      synthesize: vi.fn(),
      models: ["tts-1"],
      voices: ["alloy"],
    };
    mocks.listLoadedSpeechProviders.mockReturnValue([provider]);

    const { ttsHandlers } = await import("./tts.js");
    const statusRespond = vi.fn();
    const providersRespond = vi.fn();

    await ttsHandlers["tts.status"]({
      params: {},
      respond: statusRespond,
      context: { getRuntimeConfig: mocks.getRuntimeConfig },
    } as never);
    await ttsHandlers["tts.providers"]({
      params: {},
      respond: providersRespond,
      context: { getRuntimeConfig: mocks.getRuntimeConfig },
    } as never);

    expect(mocks.listLoadedSpeechProviders).toHaveBeenCalledTimes(2);
    expect(mocks.listSpeechProviders).not.toHaveBeenCalled();
    expect(statusRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        providerStates: [expect.objectContaining({ id: "openai", configured: true })],
      }),
    );
    expect(providersRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        providers: [expect.objectContaining({ id: "openai", configured: true })],
      }),
    );
  });
});
