import { useCallback } from "react";
import type { Mode, LlmPublic, ChatSessionKind } from "../types.ts";
import type { NewChatConfirmPayload } from "../components/chat/NewChatDialog.tsx";
import {
  applyGuidedAgentFromNewChatDialog,
  buildGuidedAgentPatchFromPreset,
  buildNaviConversationPatch,
  buildAgentExecutionPatchFromGlobals,
  conversationHasAgentExecution,
  agentExecutionPartialFromParent,
  guidedPresetPartialFromParent,
  isNewChatConfirmPayload,
  threadExecutionOverrideFromPreset,
} from "../components/chat/chatAgentUtils.ts";
import {
  standardChatModes,
  resolveDefaultModeId,
} from "../components/chat/effectiveChatModeForRequest.ts";
import { scheduleNaviGreetingKickoff } from "../components/chat/naviGreetingKickoff.ts";
import { scheduleGuidedAgentPresetKickoff } from "../components/chat/guidedAgentKickoff.ts";
import { buildThreadHiddenBootstrap } from "../components/chat/chatThreadUtils.ts";
import type { GuidedThreadOfferPayload } from "../components/chat/guidedThreadOfferUtils.ts";
import type { AgentPreset } from "../types.ts";
import type { useChatHistory } from "./useChatHistory.ts";
import type { useChat } from "./useChat.ts";

interface ConversationActionsDeps {
  history: ReturnType<typeof useChatHistory>;
  chatMessages: ReturnType<typeof useChat>["messages"];
  selectedMode: string;
  modes: Mode[];
  llms: LlmPublic[];
  modeLlmId: string | undefined;
  useReasoning: boolean;
  disabledToolkits: ReadonlySet<string>;
  agentPresets: AgentPreset[];
  naviConfigRef: React.RefObject<{ modeId?: string; llmId?: string }>;
  handleModeChange: (modeId: string, modeList?: Mode[]) => void;
}

export function useConversationActions({
  history,
  chatMessages,
  selectedMode,
  modes,
  llms,
  modeLlmId,
  useReasoning,
  disabledToolkits,
  agentPresets,
  naviConfigRef,
  handleModeChange,
}: ConversationActionsDeps) {
  const applyNewChatPayload = useCallback(
    (newConvId: string, payload: NewChatConfirmPayload, preset: AgentPreset | undefined) => {
      if (preset && payload.sessionKind === "guided") {
        const agentPatch = buildGuidedAgentPatchFromPreset(
          preset,
          payload.initialSteeringPlan,
          payload.agentPresetId,
        );
        history.patchConversation(newConvId, agentPatch);
        if (agentPatch.steeringPlan?.trim() && agentPatch.agentPresetId?.trim()) {
          scheduleGuidedAgentPresetKickoff(newConvId);
        }
      } else {
        applyGuidedAgentFromNewChatDialog(
          newConvId,
          payload,
          selectedMode,
          { llmId: modeLlmId, useReasoning, disabledToolkits },
          history.patchConversation,
        );
        if (payload.sessionKind === "guided") {
          scheduleGuidedAgentPresetKickoff(newConvId);
        }
        if (payload.sessionKind === "navi") {
          history.patchConversation(
            newConvId,
            buildNaviConversationPatch(naviConfigRef.current, modes, llms),
          );
          scheduleNaviGreetingKickoff(newConvId);
        }
      }
    },
    [history, selectedMode, modeLlmId, useReasoning, disabledToolkits, modes, llms, naviConfigRef],
  );

  const handleNewChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const preset =
          payload.sessionKind === "guided" && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === "guided") {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === "guided" ? preset.modeId : selectedMode;
        const titleArg = payload.title.trim() || undefined;
        const newConv = history.createConversation(
          modeForCreate,
          undefined,
          titleArg,
          payload.sessionKind,
        );
        applyNewChatPayload(newConv.id, payload, preset);
        return;
      }
      const sk = (kindOrPayload as ChatSessionKind | undefined) ?? "standard";
      const std = standardChatModes(modes);
      let modeForNew = selectedMode;
      if (sk === "standard" && !std.some((m) => m.id === modeForNew)) {
        modeForNew = resolveDefaultModeId(std, undefined);
        handleModeChange(modeForNew, modes);
      }
      history.createConversation(modeForNew, undefined, undefined, sk);
    },
    [history, selectedMode, modes, handleModeChange, agentPresets, applyNewChatPayload],
  );

  const handleDiscardCurrentChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const preset =
          payload.sessionKind === "guided" && payload.agentPresetId
            ? agentPresets.find((a) => a.id === payload.agentPresetId)
            : undefined;
        if (preset && payload.sessionKind === "guided") {
          handleModeChange(preset.modeId, modes);
        }
        const modeForCreate =
          preset && payload.sessionKind === "guided" ? preset.modeId : selectedMode;
        const newConv = history.discardActiveAndCreateConversation(
          modeForCreate,
          payload.sessionKind,
        );
        const t = payload.title.trim();
        if (t) history.patchConversation(newConv.id, { title: t });
        applyNewChatPayload(newConv.id, payload, preset);
        return;
      }
      const sk = (kindOrPayload as ChatSessionKind | undefined) ?? "standard";
      const std = standardChatModes(modes);
      let modeDiscard = selectedMode;
      if (sk === "standard" && !std.some((m) => m.id === modeDiscard)) {
        modeDiscard = resolveDefaultModeId(std, undefined);
        handleModeChange(modeDiscard, modes);
      }
      history.discardActiveAndCreateConversation(modeDiscard, sk);
    },
    [history, selectedMode, modes, handleModeChange, agentPresets, applyNewChatPayload],
  );

  const handleForkToNewConversation = useCallback(
    (index: number) => {
      if (history.activeConversation?.isThread) return;
      const forkedMessages = chatMessages.slice(0, index + 1);
      const baseTitle = history.activeConversation?.title ?? "Chat";
      const base = `${baseTitle}-fork`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;
      const parent = history.activeConversation;
      const sk = parent?.sessionKind ?? "standard";
      const preset =
        parent?.agentPresetId != null
          ? agentPresets.find((a) => a.id === parent.agentPresetId)
          : undefined;
      const threadModeId = preset?.threadModeId?.trim();
      const forkMode =
        threadModeId && modes.some((m) => m.id === threadModeId)
          ? threadModeId
          : selectedMode;
      const newConv = history.createConversation(
        forkMode,
        forkedMessages,
        `${base} (${n})`,
        sk,
      );
      if (sk === "guided" && parent?.steeringPlan) {
        history.patchConversation(newConv.id, { steeringPlan: parent.steeringPlan });
      }
      const forkPatches = {
        ...(parent ? agentExecutionPartialFromParent(parent) : {}),
        ...(parent && sk === "guided" ? guidedPresetPartialFromParent(parent) : {}),
        ...threadExecutionOverrideFromPreset(preset, llms, modes),
      };
      if (Object.keys(forkPatches).length > 0) {
        history.patchConversation(newConv.id, forkPatches);
      }
    },
    [agentPresets, chatMessages, history, llms, modes, selectedMode],
  );

  const handleStartThreadFromMessage = useCallback(
    (messageIndex: number) => {
      const parent = history.activeConversation;
      if (!parent) return;
      if (messageIndex < 0 || messageIndex >= chatMessages.length) return;

      const baseTitle = parent.title?.trim() || "Chat";
      const base = `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;

      const initialMessages = buildThreadHiddenBootstrap(
        baseTitle,
        chatMessages,
        messageIndex,
      );

      const sk = parent.sessionKind ?? "standard";
      const preset =
        parent.agentPresetId != null
          ? agentPresets.find((a) => a.id === parent.agentPresetId)
          : undefined;
      const threadModeId = preset?.threadModeId?.trim();
      const threadMode =
        threadModeId && modes.some((m) => m.id === threadModeId)
          ? threadModeId
          : parent.mode || selectedMode;
      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
        sk,
      );
      if (sk === "guided" && parent.steeringPlan) {
        history.patchConversation(newConv.id, { steeringPlan: parent.steeringPlan });
      }
      const threadPatches = {
        ...agentExecutionPartialFromParent(parent),
        ...(sk === "guided" ? guidedPresetPartialFromParent(parent) : {}),
        ...threadExecutionOverrideFromPreset(preset, llms, modes),
      };
      if (Object.keys(threadPatches).length > 0) {
        history.patchConversation(newConv.id, threadPatches);
      }
      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
    },
    [agentPresets, chatMessages, history, llms, modes, selectedMode],
  );

  const handleAcceptGuidedThreadFromOffer = useCallback(
    (messageIndex: number, offer: GuidedThreadOfferPayload): string | undefined => {
      const parent = history.activeConversation;
      if (!parent) return undefined;
      if (messageIndex < 0 || messageIndex >= chatMessages.length) return undefined;

      const baseTitle = parent.title?.trim() || "Chat";
      const base = offer.threadTitle?.trim() || `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;

      const initialMessages = buildThreadHiddenBootstrap(
        baseTitle,
        chatMessages,
        messageIndex,
      );

      const pid = offer.agentPresetId?.trim();
      const preset = pid ? agentPresets.find((a) => a.id === pid) : undefined;
      const threadModeIdFromPreset = preset?.threadModeId?.trim();
      const modeIdOffer = offer.modeId?.trim();
      const threadMode =
        threadModeIdFromPreset && modes.some((m) => m.id === threadModeIdFromPreset)
          ? threadModeIdFromPreset
          : modeIdOffer && modes.some((m) => m.id === modeIdOffer)
            ? modeIdOffer
            : parent.mode || selectedMode;

      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
        "guided",
      );

      if (preset) {
        history.patchConversation(
          newConv.id,
          buildGuidedAgentPatchFromPreset(preset, undefined, pid),
        );
        history.patchConversation(newConv.id, {
          steeringPlan: offer.steeringPlanMarkdown.trim(),
          mode: threadMode,
        });
        scheduleGuidedAgentPresetKickoff(newConv.id);
      } else {
        history.patchConversation(newConv.id, {
          steeringPlan: offer.steeringPlanMarkdown.trim(),
        });
        if (conversationHasAgentExecution(parent)) {
          history.patchConversation(newConv.id, agentExecutionPartialFromParent(parent));
        } else {
          history.patchConversation(
            newConv.id,
            buildAgentExecutionPatchFromGlobals({ llmId: modeLlmId, useReasoning, disabledToolkits }),
          );
        }
      }

      const threadExec = threadExecutionOverrideFromPreset(preset, llms, modes);
      if (Object.keys(threadExec).length > 0) {
        history.patchConversation(newConv.id, threadExec);
      }
      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
      return newConv.id;
    },
    [agentPresets, chatMessages, disabledToolkits, history, llms, modeLlmId, modes, selectedMode, useReasoning],
  );

  return {
    handleNewChat,
    handleDiscardCurrentChat,
    handleForkToNewConversation,
    handleStartThreadFromMessage,
    handleAcceptGuidedThreadFromOffer,
  };
}
