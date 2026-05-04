import {
  findModelInCatalog,
  loadModelCatalog,
  modelSupportsVision,
  resolveModelCatalogScope,
  resolveDefaultModelForAgent,
} from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

export async function resolveStickerVisionSupportRuntime(params: {
  cfg: OpenClawConfig;
  agentId?: string;
}): Promise<boolean> {
  const defaultModel = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  const catalog = await loadModelCatalog({
    config: params.cfg,
    ...resolveModelCatalogScope({
      cfg: params.cfg,
      provider: defaultModel.provider,
      model: defaultModel.model,
    }),
  });
  const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
  if (!entry) {
    return false;
  }
  return modelSupportsVision(entry);
}
