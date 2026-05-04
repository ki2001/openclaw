import {
  createEventBus,
  createExtensionRuntime,
  createSyntheticSourceInfo,
  type EventBus,
  type ExtensionFactory,
  type Extension,
  type ExtensionAPI,
  type ResourceLoader,
} from "@mariozechner/pi-coding-agent";

export type EmbeddedPiResourceLoaderParams = {
  extensionFactories: readonly ExtensionFactory[];
};

function unavailableDuringLoad(): never {
  throw new Error("Embedded Pi resource loader only supports lifecycle event registration.");
}

function createEmbeddedExtensionApi(params: {
  eventBus: EventBus;
  extension: Extension;
}): ExtensionAPI {
  const apiTarget = {
    on(event: string, handler: unknown): void {
      const handlers = params.extension.handlers.get(event) ?? [];
      handlers.push(handler as (typeof handlers)[number]);
      params.extension.handlers.set(event, handlers);
    },
    events: params.eventBus,
  };
  return new Proxy(apiTarget, {
    get(target, property) {
      if (property in target) {
        return target[property as keyof typeof target];
      }
      return unavailableDuringLoad;
    },
  }) as ExtensionAPI;
}

function createInlineExtension(params: {
  eventBus: EventBus;
  factory: ExtensionFactory;
  extensionPath: string;
}): Promise<Extension> | Extension {
  const extension: Extension = {
    path: params.extensionPath,
    resolvedPath: params.extensionPath,
    sourceInfo: createSyntheticSourceInfo(params.extensionPath, {
      source: "inline",
      scope: "temporary",
      origin: "top-level",
    }),
    handlers: new Map(),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
  const api = createEmbeddedExtensionApi({
    eventBus: params.eventBus,
    extension,
  });
  return Promise.resolve(params.factory(api)).then(() => extension);
}

export function createEmbeddedPiResourceLoader(
  params: EmbeddedPiResourceLoaderParams,
): ResourceLoader {
  let extensionsResult: ReturnType<ResourceLoader["getExtensions"]> = {
    extensions: [],
    errors: [],
    runtime: createExtensionRuntime(),
  };
  return {
    getExtensions: () => extensionsResult,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getAppendSystemPrompt: () => [],
    extendResources: () => {
      // Embedded replies use OpenClaw-managed prompt, tool, and context resources.
    },
    async reload() {
      const runtime = createExtensionRuntime();
      const eventBus = createEventBus();
      const extensions: Extension[] = [];
      const errors: ReturnType<ResourceLoader["getExtensions"]>["errors"] = [];
      for (const [index, factory] of params.extensionFactories.entries()) {
        const extensionPath = `<inline:${index + 1}>`;
        try {
          extensions.push(
            await createInlineExtension({
              eventBus,
              factory,
              extensionPath,
            }),
          );
        } catch (error) {
          errors.push({
            path: extensionPath,
            error: error instanceof Error ? error.message : "failed to load extension",
          });
        }
      }
      extensionsResult = {
        extensions,
        errors,
        runtime,
      };
    },
  };
}
