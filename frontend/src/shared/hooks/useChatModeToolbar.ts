import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, LlmPublic, Mode, ReasoningEffort } from "../types.ts";
import { modesApi, projectConfigApi, llmApi } from "../api.ts";
import { resolveDefaultModeId } from "../components/chat/effectiveChatModeForRequest.ts";
import type { useChatHistory } from "./useChatHistory.ts";
import {
  loadInitialDisabledToolkits,
  saveDisabledToolkits,
  loadInitialRulesEnabled,
  saveRulesEnabled,
  loadLlmPrefs,
  saveLlmPrefs,
} from "../utils/chatStorage.ts";

function conversationHasVisibleMessages(conv: Conversation): boolean {
  return conv.messages.some((m) => !m.hidden);
}

export function useChatModeToolbar(projectPath: string | null) {
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState("review");
  const [useReasoning, setUseReasoning] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [webSearchAvailable, setWebSearchAvailable] = useState(false);
  const [modeLlmId, setModeLlmId] = useState<string | undefined>(undefined);
  const [llms, setLlms] = useState<LlmPublic[]>([]);
  const llmsRef = useRef(llms);
  useEffect(() => {
    llmsRef.current = llms;
  }, [llms]);
  const [disabledToolkits, setDisabledToolkits] = useState(loadInitialDisabledToolkits);
  const [rulesEnabled, setRulesEnabled] = useState(loadInitialRulesEnabled);
  const [modesAndLlmLoadGeneration, setModesAndLlmLoadGeneration] = useState(0);

  const prefsHydratedRef = useRef(false);
  const projectDefaultChatModeIdRef = useRef("review");
  const selectedModeRef = useRef(selectedMode);
  useEffect(() => {
    selectedModeRef.current = selectedMode;
  }, [selectedMode]);
  const lastNonAgentToolbarPrefsSyncRef = useRef<{
    projectPath: string;
    activeId: string;
    loadGen: number;
    modesSig: string;
  } | null>(null);

  const handleModeChange = useCallback(
    (modeId: string, modeList?: typeof modes) => {
      const list = modeList ?? modes;
      const m = list.find((x) => x.id === modeId);
      const llmId = m?.llmId ?? undefined;

      let newUseReasoning = m?.useReasoning ?? false;
      if (llmId) {
        const llm = llms.find((l) => l.id === llmId);
        if (llm) {
          const hasReasoning = !!llm.reasoningModel;
          const hasFast = !!llm.fastModel;
          if (!hasReasoning) {
            newUseReasoning = false;
          } else if (!hasFast) {
            newUseReasoning = true;
          }
        }
      }

      setSelectedMode((prev) => (prev === modeId ? prev : modeId));
      setModeLlmId((prev) => (prev === llmId ? prev : llmId));
      setUseReasoning((prev) =>
        prev === newUseReasoning ? prev : newUseReasoning,
      );
    },
    [modes, llms],
  );

  const applyLlmPrefsFromStorage = useCallback(() => {
    const providers = llmsRef.current;
    const prefs = loadLlmPrefs();
    if (!prefs) return;
    const { llmId, useReasoning: savedReasoning, reasoningEffort: savedEffort } = prefs;
    setReasoningEffort(savedEffort);
    if (llmId !== null) {
      const llm = providers.find((l) => l.id === llmId);
      if (llm) {
        setModeLlmId(llmId);
        const hasReasoning = !!llm.reasoningModel;
        const hasFast = !!llm.fastModel;
        if (!hasReasoning) setUseReasoning(false);
        else if (!hasFast) setUseReasoning(true);
        else setUseReasoning(savedReasoning);
      } else {
        setUseReasoning(savedReasoning);
      }
    } else {
      setUseReasoning(savedReasoning);
    }
  }, []);

  const loadModes = useCallback(async () => {
    try {
      const [mds, status] = await Promise.all([
        modesApi.getAll(),
        projectConfigApi.status(),
      ]);
      setModes(mds);
      let configured: string | undefined;
      if (status.initialized) {
        try {
          const cfg = await projectConfigApi.get();
          configured = cfg.defaultMode;
        // eslint-disable-next-line no-empty
        } catch {}
      }
      const resolvedId = resolveDefaultModeId(mds, configured);
      projectDefaultChatModeIdRef.current = resolvedId;
      const resolvedMode = mds.find((m) => m.id === resolvedId);
      setSelectedMode(resolvedId);
      setUseReasoning(resolvedMode?.useReasoning ?? false);
      setModeLlmId(resolvedMode?.llmId ?? undefined);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    prefsHydratedRef.current = false;
    let cancelled = false;
    const llmsPromise = llmApi
      .list()
      .then((r) => {
        if (!cancelled) {
          setLlms(r.providers);
          llmsRef.current = r.providers;
          setWebSearchAvailable(!!r.webSearchAvailable);
        }
      })
      .catch(console.error);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadModes(), llmsPromise]).then(() => {
      if (cancelled) return;
      prefsHydratedRef.current = true;
      applyLlmPrefsFromStorage();
      setModesAndLlmLoadGeneration((g) => g + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [loadModes, projectPath, applyLlmPrefsFromStorage]);

  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    saveLlmPrefs(modeLlmId, useReasoning, reasoningEffort);
  }, [modeLlmId, useReasoning, reasoningEffort]);

  useEffect(() => {
    saveDisabledToolkits(disabledToolkits);
  }, [disabledToolkits]);

  useEffect(() => {
    saveRulesEnabled(rulesEnabled);
  }, [rulesEnabled]);

  return {
    modes,
    selectedMode,
    useReasoning,
    setUseReasoning,
    reasoningEffort,
    setReasoningEffort,
    webSearchAvailable,
    modeLlmId,
    setModeLlmId,
    llms,
    disabledToolkits,
    setDisabledToolkits,
    rulesEnabled,
    setRulesEnabled,
    modesAndLlmLoadGeneration,
    loadModes,
    handleModeChange,
    applyLlmPrefsFromStorage,
    prefsHydratedRef,
    projectDefaultChatModeIdRef,
    selectedModeRef,
    lastNonAgentToolbarPrefsSyncRef,
  };
}

export function useSyncChatModeWithHistory(
  toolbar: ReturnType<typeof useChatModeToolbar>,
  history: ReturnType<typeof useChatHistory>,
  projectPath: string | null,
) {
  const {
    modes,
    handleModeChange,
    applyLlmPrefsFromStorage,
    modesAndLlmLoadGeneration,
    prefsHydratedRef,
    projectDefaultChatModeIdRef,
    selectedModeRef,
    lastNonAgentToolbarPrefsSyncRef,
  } = toolbar;

  useEffect(() => {
    if (!history.hydrated || modes.length === 0) return;
    const conv = history.activeConversation;
    let desired: string;
    const trulyEmptyForModeSync =
      !conversationHasVisibleMessages(conv) && conv.messages.length === 0;
    if (trulyEmptyForModeSync) {
      if (conv.mode && modes.some((m) => m.id === conv.mode)) {
        desired = conv.mode;
      } else {
        desired = projectDefaultChatModeIdRef.current;
        if (!modes.some((m) => m.id === desired)) {
          desired = resolveDefaultModeId(modes, undefined);
        }
      }
    } else {
      let fromConv: string | null = null;
      if (conv.mode && modes.some((m) => m.id === conv.mode)) {
        fromConv = conv.mode;
      } else {
        for (let i = conv.messages.length - 1; i >= 0; i--) {
          const m = conv.messages[i];
          if (m.hidden || m.role !== "user" || !m.mode) continue;
          const found = modes.find((mode) => mode.name === m.mode);
          if (found) {
            fromConv = found.id;
            break;
          }
        }
      }
      desired = fromConv ?? projectDefaultChatModeIdRef.current;
      if (!modes.some((m) => m.id === desired)) {
        desired = resolveDefaultModeId(modes, undefined);
      }
    }
    if (desired !== selectedModeRef.current) {
      handleModeChange(desired, modes);
    }

    if (prefsHydratedRef.current) {
      const pp = projectPath ?? "";
      const aid = history.activeId;
      const gen = modesAndLlmLoadGeneration;
      const modesSig = modes.map((m) => m.id).join("\0");
      const prevSync = lastNonAgentToolbarPrefsSyncRef.current;
      if (
        !prevSync ||
        prevSync.projectPath !== pp ||
        prevSync.activeId !== aid ||
        prevSync.loadGen !== gen ||
        prevSync.modesSig !== modesSig
      ) {
        lastNonAgentToolbarPrefsSyncRef.current = {
          projectPath: pp,
          activeId: aid,
          loadGen: gen,
          modesSig,
        };
        applyLlmPrefsFromStorage();
      }
    }
  }, [
    history.hydrated,
    history.activeId,
    history.activeConversation.mode,
    modes,
    projectPath,
    modesAndLlmLoadGeneration,
    handleModeChange,
    applyLlmPrefsFromStorage,
    prefsHydratedRef,
    projectDefaultChatModeIdRef,
    selectedModeRef,
    lastNonAgentToolbarPrefsSyncRef,
  ]);
}
