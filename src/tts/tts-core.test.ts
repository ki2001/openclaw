import { describe, expect, it, vi } from "vitest";
import { summarizeText } from "./tts-core.js";

describe("summarizeText", () => {
  it("resolves summary models through the lean skipPiDiscovery path", async () => {
    const resolveModelAsync = vi.fn(async () => ({
      model: { provider: "openai", model: "gpt-5.4", api: "openai-responses" },
    }));
    const prepareModelForSimpleCompletion = vi.fn(({ model }) => model);
    const getApiKeyForModel = vi.fn(async () => ({ apiKey: "test-key" }));
    const requireApiKey = vi.fn(() => "test-key");
    const completeSimple = vi.fn(async () => ({
      content: [{ type: "text", text: "short summary" }],
    }));

    await summarizeText(
      {
        text: "a".repeat(400),
        targetLength: 120,
        cfg: {
          agents: {
            defaults: {
              model: "openai/gpt-5.4",
            },
          },
        },
        config: {
          enabled: true,
          auto: "always",
          provider: "openai",
          providerSource: "default",
          providerConfigs: {},
          personas: {},
          modelOverrides: {
            enabled: true,
            allowText: true,
            allowProvider: false,
            allowVoice: true,
            allowModelId: true,
            allowVoiceSettings: true,
            allowNormalization: true,
            allowSeed: true,
          },
          maxTextLength: 1000,
          timeoutMs: 1000,
        },
        timeoutMs: 1000,
      },
      {
        completeSimple,
        getApiKeyForModel,
        prepareModelForSimpleCompletion,
        requireApiKey,
        resolveModelAsync,
      },
    );

    expect(resolveModelAsync).toHaveBeenCalledWith(
      "openai",
      "gpt-5.4",
      undefined,
      expect.anything(),
      {
        skipPiDiscovery: true,
      },
    );
  });
});
