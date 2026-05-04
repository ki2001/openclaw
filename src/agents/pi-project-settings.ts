import { SettingsManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  buildEmbeddedPiSettingsSnapshot,
  loadEnabledBundlePiSettingsSnapshot,
  resolveEmbeddedPiProjectSettingsPolicy,
} from "./pi-project-settings-snapshot.js";
import { applyPiCompactionSettingsFromConfig } from "./pi-settings.js";

export function createPreparedEmbeddedPiSettingsManager(params: {
  cwd: string;
  agentDir: string;
  cfg?: OpenClawConfig;
  /** Resolved context window budget so reserve-token floor can be capped for small models. */
  contextTokenBudget?: number;
}): SettingsManager {
  const fileSettingsManager = SettingsManager.create(params.cwd, params.agentDir);
  const settingsManager = SettingsManager.inMemory(
    buildEmbeddedPiSettingsSnapshot({
      globalSettings: fileSettingsManager.getGlobalSettings(),
      pluginSettings: loadEnabledBundlePiSettingsSnapshot({
        cwd: params.cwd,
        cfg: params.cfg,
      }),
      projectSettings: fileSettingsManager.getProjectSettings(),
      policy: resolveEmbeddedPiProjectSettingsPolicy(params.cfg),
    }),
  );
  applyPiCompactionSettingsFromConfig({
    settingsManager,
    cfg: params.cfg,
    contextTokenBudget: params.contextTokenBudget,
  });
  return settingsManager;
}
