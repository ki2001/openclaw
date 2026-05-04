import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createEmbeddedPiResourceLoader } from "./resource-loader.js";

describe("embedded Pi resource loader", () => {
  it("loads only inline lifecycle extensions", async () => {
    const extensionFactories: ExtensionFactory[] = [
      (pi) => {
        pi.on("turn_start", () => undefined);
      },
    ];

    const loader = createEmbeddedPiResourceLoader({
      extensionFactories,
    });
    await loader.reload();

    const extensions = loader.getExtensions();
    expect(extensions.errors).toEqual([]);
    expect(extensions.extensions).toHaveLength(1);
    expect(extensions.extensions[0]?.path).toBe("<inline:1>");
    expect(extensions.extensions[0]?.handlers.has("turn_start")).toBe(true);
  });

  it("keeps Gateway-managed reply resources out of Pi resource discovery", async () => {
    const loader = createEmbeddedPiResourceLoader({
      extensionFactories: [],
    });
    await loader.reload();

    expect(loader.getSkills()).toEqual({ skills: [], diagnostics: [] });
    expect(loader.getPrompts()).toEqual({ prompts: [], diagnostics: [] });
    expect(loader.getThemes()).toEqual({ themes: [], diagnostics: [] });
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
    expect(loader.getSystemPrompt()).toBeUndefined();
    expect(loader.getAppendSystemPrompt()).toEqual([]);
  });
});
