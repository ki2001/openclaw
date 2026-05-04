import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import type { ProviderRuntimePluginHandle } from "../../../plugins/provider-hook-runtime.js";
import { resolveProviderAuthProfileId } from "../../../plugins/provider-runtime.js";
import {
  type AuthProfileStore,
  preferAuthProfileFirst,
  resolveAuthProfileEligibility,
} from "../../auth-profiles.js";
import { externalCliDiscoveryForProviderAuth } from "../../auth-profiles/external-cli-discovery.js";
import {
  ensureAuthProfileStore,
  resolveAuthProfileOrder,
  shouldPreferExplicitConfigApiKeyAuth,
} from "../../model-auth.js";
import { resolveProviderIdForAuth } from "../../provider-auth-aliases.js";
import { buildAgentRuntimeAuthPlan } from "../../runtime-plan/auth.js";

export function prepareEmbeddedRunAuthSelection(params: {
  config?: OpenClawConfig;
  agentDir: string;
  workspaceDir: string;
  provider: string;
  modelId: string;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
  authProfileOrder?: readonly string[];
  authStore?: AuthProfileStore;
  providerRuntimeHandle?: ProviderRuntimePluginHandle;
  harnessId: string;
  pluginHarnessOwnsTransport: boolean;
}): {
  authStore: AuthProfileStore;
  lockedProfileId?: string;
  preferredProfileId?: string;
  forwardedPluginHarnessProfileId?: string;
  profileCandidates: Array<string | undefined>;
} {
  const authStore: AuthProfileStore = params.pluginHarnessOwnsTransport
    ? { version: 1, profiles: {} }
    : (params.authStore ??
      ensureAuthProfileStore(params.agentDir, {
        externalCli: externalCliDiscoveryForProviderAuth({
          cfg: params.config,
          provider: params.provider,
          preferredProfile: params.authProfileId,
        }),
      }));
  const requestedProfileId = params.authProfileId?.trim();
  const buildPluginHarnessAuthPlan = (profileId?: string) =>
    buildAgentRuntimeAuthPlan({
      provider: params.provider,
      ...(profileId
        ? {
            authProfileProvider: profileId.split(":", 1)[0],
            sessionAuthProfileId: profileId,
          }
        : {}),
      config: params.config,
      workspaceDir: params.workspaceDir,
      harnessId: params.harnessId,
      harnessRuntime: params.harnessId,
      allowHarnessAuthProfileForwarding: true,
    });
  const resolvePluginHarnessPreferredProfileId = (): string | undefined => {
    if (requestedProfileId || !params.pluginHarnessOwnsTransport) {
      return requestedProfileId;
    }
    const runtimeAuthPlan = buildPluginHarnessAuthPlan();
    const harnessAuthProvider = runtimeAuthPlan.harnessAuthProvider;
    if (!harnessAuthProvider) {
      return undefined;
    }
    const harnessAuthStore = ensureAuthProfileStore(params.agentDir, {
      allowKeychainPrompt: false,
    });
    return resolveAuthProfileOrder({
      cfg: params.config,
      store: harnessAuthStore,
      provider: harnessAuthProvider,
    })[0]?.trim();
  };
  const preferredProfileId = params.pluginHarnessOwnsTransport
    ? resolvePluginHarnessPreferredProfileId()
    : requestedProfileId;
  let lockedProfileId = params.authProfileIdSource === "user" ? preferredProfileId : undefined;
  const canForwardPluginHarnessAuthProfile = (
    profileId: string | undefined,
  ): profileId is string => {
    if (!params.pluginHarnessOwnsTransport || !profileId) {
      return false;
    }
    const runtimeAuthPlan = buildPluginHarnessAuthPlan(profileId);
    return runtimeAuthPlan.forwardedAuthProfileId === profileId;
  };
  if (lockedProfileId) {
    if (params.pluginHarnessOwnsTransport) {
      if (!canForwardPluginHarnessAuthProfile(lockedProfileId)) {
        lockedProfileId = undefined;
      }
    } else {
      const lockedProfile = authStore.profiles[lockedProfileId];
      const lockedProfileProvider = lockedProfile
        ? resolveProviderIdForAuth(lockedProfile.provider, {
            config: params.config,
            workspaceDir: params.workspaceDir,
          })
        : undefined;
      const runProvider = resolveProviderIdForAuth(params.provider, {
        config: params.config,
        workspaceDir: params.workspaceDir,
      });
      if (!lockedProfile || !lockedProfileProvider || lockedProfileProvider !== runProvider) {
        lockedProfileId = undefined;
      }
    }
  }
  const forwardedPluginHarnessProfileId =
    params.pluginHarnessOwnsTransport &&
    !lockedProfileId &&
    canForwardPluginHarnessAuthProfile(preferredProfileId)
      ? preferredProfileId
      : undefined;
  if (lockedProfileId && !params.pluginHarnessOwnsTransport) {
    const eligibility = resolveAuthProfileEligibility({
      cfg: params.config,
      store: authStore,
      provider: params.provider,
      profileId: lockedProfileId,
    });
    if (!eligibility.eligible) {
      throw new Error(
        `Auth profile "${lockedProfileId}" is not configured for ${params.provider}.`,
      );
    }
  }
  const profileOrder = (() => {
    if (shouldPreferExplicitConfigApiKeyAuth(params.config, params.provider)) {
      return [];
    }
    const preparedOrder = params.pluginHarnessOwnsTransport
      ? undefined
      : params.authProfileOrder?.filter((profileId) => Boolean(profileId.trim()));
    if (preparedOrder) {
      return preferAuthProfileFirst(preferredProfileId, preparedOrder);
    }
    return resolveAuthProfileOrder({
      cfg: params.config,
      store: authStore,
      provider: params.provider,
      preferredProfile: preferredProfileId,
    });
  })();
  const providerPreferredProfileId = lockedProfileId
    ? undefined
    : resolveProviderAuthProfileId({
        provider: params.provider,
        config: params.config,
        workspaceDir: params.workspaceDir,
        runtimeHandle: params.providerRuntimeHandle,
        context: {
          config: params.config,
          agentDir: params.agentDir,
          workspaceDir: params.workspaceDir,
          provider: params.provider,
          modelId: params.modelId,
          preferredProfileId,
          lockedProfileId,
          profileOrder,
          authStore,
        },
      });
  const providerOrderedProfiles = preferAuthProfileFirst(providerPreferredProfileId, profileOrder);
  const profileCandidates = lockedProfileId
    ? [lockedProfileId]
    : providerOrderedProfiles.length > 0
      ? providerOrderedProfiles
      : [undefined];

  return {
    authStore,
    lockedProfileId,
    preferredProfileId,
    forwardedPluginHarnessProfileId,
    profileCandidates,
  };
}
