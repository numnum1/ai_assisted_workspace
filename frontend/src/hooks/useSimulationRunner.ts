import { useCallback, useEffect } from "react";
import type { Conversation, Mode } from "../types.ts";
import { getEffectiveChatExecution } from "../components/chat/chatAgentUtils.ts";
import { effectiveChatModeIdForRequest } from "../components/chat/effectiveChatModeForRequest.ts";
import {
  scheduleSimulationReply,
  hasPendingSimulationReply,
  tryStartSimulationReply,
  finishSimulationReply,
  clearSimulationReply,
} from "../components/chat/simulationReplyKickoff.ts";
import { getAppBridge } from "../electron/bridge.ts";
import type { useChat } from "./useChat.ts";
import type { useFileTabs } from "./useFileTabs.ts";

const SIMULATION_MAX_TURNS = 12;

interface SimulationRunnerDeps {
  activeConversation: Conversation;
  chatMessages: ReturnType<typeof useChat>["messages"];
  chatStreaming: ReturnType<typeof useChat>["streaming"];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  selectedMode: string;
  modes: Mode[];
  modeLlmId: string | undefined;
  useReasoning: boolean;
  disabledToolkits: ReadonlySet<string>;
  rulesEnabled: boolean;
  openFile: ReturnType<typeof useFileTabs>["openFile"];
}

export function useSimulationRunner({
  activeConversation,
  chatMessages,
  chatStreaming,
  sendMessage,
  selectedMode,
  modes,
  modeLlmId,
  useReasoning,
  disabledToolkits,
  rulesEnabled,
  openFile,
}: SimulationRunnerDeps) {
  const performSimulationReply = useCallback(
    async (conv: Conversation) => {
      const sim = conv.simulationConfig;
      if (!sim) {
        finishSimulationReply(conv.id);
        return;
      }
      const bridge = getAppBridge();
      try {
        const transcript = conv.messages
          .filter(
            (m) =>
              !m.hidden &&
              (m.role === "user" || m.role === "assistant") &&
              m.content.trim().length > 0,
          )
          .map((m) => ({
            speaker: (m.role === "assistant" ? "navi" : "merchant") as
              | "navi"
              | "merchant",
            content: m.content,
          }));

        const modeId = effectiveChatModeIdForRequest(conv, selectedMode, modes);
        const mode = modes.find((m) => m.id === modeId);
        const exec = getEffectiveChatExecution(conv, {
          llmId: modeLlmId,
          useReasoning,
          disabledToolkits,
        });

        const personaText = sim.personaPrompt?.trim() || sim.goal;
        const result = await bridge?.simulation?.generateUserReply?.({
          goal: personaText,
          characterNames: sim.personaName
            ? [sim.personaName]
            : sim.characters.map((c) => c.name),
          transcript,
          llmId: exec.llmId,
        });
        const reply = result?.reply?.trim();
        if (!reply) {
          finishSimulationReply(conv.id);
          return;
        }

        sendMessage(
          reply,
          modeId,
          [],
          mode?.name,
          mode?.color,
          exec.useReasoning,
          exec.llmId,
          undefined,
          null,
          exec.disabledToolkits,
          {
            conversationId: conv.id,
            sessionKind: "navi",
            naviStateId: conv.naviStateId ?? "greeting",
            naviResults: conv.naviResults,
            naviContext: conv.naviContext,
            naviPlan: conv.naviPlan,
            naviCoveredTips: conv.naviCoveredTips,
            naviCurrentProblem: conv.naviCurrentProblem,
            naviProblemQueue: conv.naviProblemQueue,
            simulationConfig: sim,
          },
          { rulesDisabled: !rulesEnabled },
        );
      } catch (err) {
        console.error("[simulation] merchant reply failed", err);
      } finally {
        finishSimulationReply(conv.id);
      }
    },
    [sendMessage, selectedMode, modes, modeLlmId, useReasoning, disabledToolkits, rulesEnabled],
  );

  const persistSimulationTranscript = useCallback(
    async (conv: Conversation) => {
      const sim = conv.simulationConfig;
      if (!sim) return;
      const bridge = getAppBridge();
      if (!bridge?.simulation?.writeResult) return;

      const visibleMessages = conv.messages.filter(
        (m) =>
          !m.hidden &&
          (m.role === "user" || m.role === "assistant") &&
          m.content.trim().length > 0,
      );

      const lines = visibleMessages.map((m) =>
        m.role === "assistant"
          ? `**Navi:** ${m.content.trim()}`
          : `**Händler:** ${m.content.trim()}`,
      );

      const transcript = visibleMessages.map((m) => ({
        speaker: (m.role === "assistant" ? "navi" : "merchant") as
          | "navi"
          | "merchant",
        content: m.content,
      }));

      let evaluationSection: string[] = [];
      if (bridge.simulation.evaluateRun) {
        try {
          const exec = getEffectiveChatExecution(conv, {
            llmId: modeLlmId,
            useReasoning,
            disabledToolkits,
          });
          const evaluation = await bridge.simulation.evaluateRun({
            persona: sim.personaPrompt?.trim() || sim.goal,
            personaName: sim.personaName,
            transcript,
            llmId: exec.llmId,
          });
          if (evaluation?.report) {
            evaluationSection = [
              ``,
              `---`,
              ``,
              `## KI-Bewertung des Navi`,
              ``,
              evaluation.report,
              ``,
            ];
          }
        } catch (err) {
          console.error("[simulation] navi evaluation failed", err);
        }
      }

      const body = [
        `# ${conv.title ?? "Simulation"}`,
        ``,
        sim.personaName ? `**Persona:** ${sim.personaName}` : undefined,
        sim.goal ? `**Ziel:** ${sim.goal}` : undefined,
        sim.characters.length > 0
          ? `**Charaktere:** ${sim.characters.map((c) => c.name).join(", ")}`
          : undefined,
        ``,
        `---`,
        ``,
        `## Gesprächsverlauf`,
        ``,
        lines.join("\n\n"),
        ``,
        ...evaluationSection,
      ]
        .filter((l) => l !== undefined)
        .join("\n");

      const writeResult = await bridge.simulation
        .writeResult(sim.resultFile, body)
        .catch(() => null);

      if (writeResult?.path) {
        void openFile(writeResult.path);
      }
    },
    [modeLlmId, useReasoning, disabledToolkits, openFile],
  );

  useEffect(() => {
    const conv = activeConversation;
    if (!conv) return;
    if (conv.sessionKind !== "navi" || !conv.simulationConfig) return;
    if (!hasPendingSimulationReply(conv.id)) return;
    if (chatStreaming) return;
    if (chatMessages.length !== conv.messages.length) return;

    const reachedClosing = (conv.naviStateId ?? "greeting") === "closing";
    const merchantTurns = conv.messages.filter(
      (m) => !m.hidden && m.role === "user",
    ).length;
    if (reachedClosing || merchantTurns >= SIMULATION_MAX_TURNS) {
      clearSimulationReply(conv.id);
      void persistSimulationTranscript(conv);
      return;
    }
    if (!tryStartSimulationReply(conv.id)) return;
    void performSimulationReply(conv);
  }, [
    activeConversation,
    chatMessages,
    chatStreaming,
    performSimulationReply,
    persistSimulationTranscript,
  ]);

  return { scheduleSimulationReply };
}
