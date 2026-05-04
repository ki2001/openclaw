import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderRuntimePluginHandle } from "../../../plugins/provider-hook-runtime.js";
import { resolveProviderAuthProfileId } from "../../../plugins/provider-runtime.js";
import type { AuthProfileStore } from "../../auth-profiles.js";
import { resolveAuthProfileOrder } from "../../model-auth.js";
import { prepareEmbeddedRunAuthSelection } from "./auth-selection.js";

const modelAuthMocks = vi.hoisted(() => ({
  resolveAuthProfileOrder: vi.fn(),
}));

vi.mock("../../model-auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../model-auth.js")>();
  return {
    ...actual,
    resolveAuthProfileOrder: modelAuthMocks.resolveAuthProfileOrder,
  };
});

vi.mock("../../../plugins/provider-runtime.js", () => ({
  resolveProviderAuthProfileId: vi.fn(),
}));

const demoAuthStore: AuthProfileStore = {
  version: 1,
  profiles: {
    "demo:a": { type: "api_key", provider: "demo", key: "a" },
    "demo:b": { type: "api_key", provider: "demo", key: "b" },
  },
};

function selectAuth(
  overrides: Partial<Parameters<typeof prepareEmbeddedRunAuthSelection>[0]> = {},
) {
  return prepareEmbeddedRunAuthSelection({
    agentDir: "/tmp/agent",
    workspaceDir: "/tmp/workspace",
    provider: "demo",
    modelId: "demo-model",
    authStore: demoAuthStore,
    harnessId: "pi",
    pluginHarnessOwnsTransport: false,
    ...overrides,
  });
}

describe("prepareEmbeddedRunAuthSelection", () => {
  beforeEach(() => {
    vi.mocked(resolveProviderAuthProfileId).mockReset();
    vi.mocked(resolveAuthProfileOrder).mockReset();
  });

  it("reuses the resolved provider runtime handle for provider auth profile hooks", () => {
    const runtimeHandle = {
      provider: "demo",
      plugin: {
        id: "demo",
        label: "Demo",
        auth: [],
      },
    } as ProviderRuntimePluginHandle;
    vi.mocked(resolveAuthProfileOrder).mockReturnValue(["demo:a", "demo:b"]);
    vi.mocked(resolveProviderAuthProfileId).mockReturnValue("demo:b");

    const selection = selectAuth({
      providerRuntimeHandle: runtimeHandle,
    });

    expect(resolveProviderAuthProfileId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "demo",
        runtimeHandle,
      }),
    );
    expect(selection.profileCandidates).toEqual(["demo:b", "demo:a"]);
  });

  it("reuses prepared auth profile order instead of resolving it again", () => {
    vi.mocked(resolveAuthProfileOrder).mockReturnValue(["demo:a"]);

    const selection = selectAuth({
      authProfileOrder: ["demo:b", "demo:a"],
    });

    expect(resolveAuthProfileOrder).not.toHaveBeenCalled();
    expect(selection.profileCandidates).toEqual(["demo:b", "demo:a"]);
    expect(resolveProviderAuthProfileId).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          profileOrder: ["demo:b", "demo:a"],
        }),
      }),
    );
  });

  it("keeps the requested prepared auth profile first", () => {
    const selection = selectAuth({
      authProfileId: "demo:a",
      authProfileOrder: ["demo:b", "demo:a"],
    });

    expect(resolveAuthProfileOrder).not.toHaveBeenCalled();
    expect(selection.profileCandidates).toEqual(["demo:a", "demo:b"]);
  });
});
