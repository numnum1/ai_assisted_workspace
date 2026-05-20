import { useEffect, useState } from "react";
import type { ProjectSettings, AssistantMode, LLM } from "../project-types";
import { getAppBridge } from "../../../../electron/bridge.ts";
import type { Mode, LlmPublic } from "../../../../types.ts";

function mapModeToAssistantMode(mode: Mode): AssistantMode {
  return {
    id: mode.id,
    name: mode.name,
    systemPrompt: mode.systemPrompt,
    color: mode.color,
  };
}

function mapProviderToLLM(provider: LlmPublic): LLM {
  return {
    id: provider.id,
    name: provider.name,
    fast: {
      host: provider.fastApiUrl,
      apiKey: "",
      model: provider.fastModel,
      maxTokens: provider.maxTokens ?? 0,
      cost: provider.costFast ?? null,
    },
    reasoning: {
      host: provider.reasoningApiUrl,
      apiKey: "",
      model: provider.reasoningModel,
      maxTokens: provider.maxTokens ?? 0,
      cost: provider.costReasoning ?? null,
    },
  };
}

export function useProjectSettings(
  openFolderPath: string,
): [ProjectSettings, React.Dispatch<React.SetStateAction<ProjectSettings>>] {
  const [settings, setSettings] = useState<ProjectSettings>({
    llms: [],
    modes: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!openFolderPath) {
        return;
      }

      const bridge = getAppBridge();
      if (!bridge?.projectConfig || !bridge?.llms) {
        return;
      }

      try {
        const [modesResponse, llmsResponse] = await Promise.all([
          bridge.projectConfig.getModes(),
          bridge.llms.list(),
        ]);

        if (cancelled) return;

        const modes: AssistantMode[] = modesResponse.map(
          mapModeToAssistantMode,
        );
        const llms: LLM[] = llmsResponse.providers.map(mapProviderToLLM);

        setSettings({ llms, modes });
      } catch (err) {
        console.error("Failed to load project settings:", err);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [openFolderPath]);

  return [settings, setSettings];
}
