import { normalizeText } from "./projectContext.js";
import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
  extractContentToken,
  extractFinishReason,
  accumulateToolCallChunks,
  type OpenAiMessage,
  type OpenAiStreamChunk,
} from "../openAiClient.js";
import { isStreamActive } from "../chatSession.js";
import { executeToolCall, describeStreamingToolCall, type ToolExecutionResult } from "../chatToolExecution.js";
import {
  getNaviState,
  buildClassificationPrompt,
  buildNaviContextPrompt,
  buildStateSummaryPrompt,
  type NaviState,
} from "../naviStateMachine.js";
import { buildNaviKnowledgePrompt } from "../naviKnowledgeBase.js";
import { NAVI_FULL_PERSONA_RULES, NAVI_NARROW_PERSONA_RULES } from "./naviVoice.js";
import { NAVI_TIPS } from "../../../src/naviTips.js";
import { getProjectConfig } from "../projectConfigService.js";
import { TOOLKIT_TOOL_DEFINITIONS, type ToolDefinition } from "./systemPrompt.js";
import type { ChatRequest, ChatMessage, ToolCall } from "../../../src/types.js";
import type { ChatStreamEvent } from "../chatTypes.js";

const ASK_QUESTION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "ask_question",
    description:
      "Schreibe deine nächste Nachricht im Gespräch. Zeige zuerst in einem kurzen Satz, dass du verstanden hast, was der Händler gerade gesagt hat – dann genau eine gezielte Frage.",
    parameters: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description:
            "Deine direkte Gesprächsnachricht. Immer 'du', nie 'der Händler'. 1–2 Sätze: erst kurze Reaktion auf das Gesagte, dann eine konkrete Frage.",
        },
      },
      required: ["response"],
    },
  },
};

function buildNaviStateTools(state: NaviState): {
  tools: ToolDefinition[];
  toolChoice: "required" | undefined;
} {
  if (!state.tools || state.tools.length === 0) {
    return { tools: [], toolChoice: undefined };
  }
  const tools: ToolDefinition[] = [];
  for (const name of state.tools) {
    if (name === "ask_question") {
      tools.push(ASK_QUESTION_TOOL);
    } else if (name === "ask_clarification") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find(
        (d) => d.function.name === "ask_clarification",
      );
      if (t) tools.push(t);
    }
  }
  return { tools, toolChoice: tools.length > 0 ? "required" : undefined };
}

export async function runNaviChatStream(
  streamId: string,
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  try {
    const provider = await resolveAiProvider(request.llmId);
    const endpoint = resolveProviderEndpoint(provider, false);

    if (!isStreamActive(streamId)) return;

    emit({
      type: "context",
      data: { includedFiles: [], estimatedTokens: 0, maxContextTokens: endpoint.maxTokens },
    });

    const userMessage = normalizeText(request.message);
    if (userMessage) {
      emit({ type: "resolved_user_message", data: userMessage });
    }

    const currentStateId = normalizeText(request.naviStateId ?? "") || "greeting";
    const currentState = getNaviState(currentStateId) ?? getNaviState("greeting")!;

    let projConfig: import("../../../src/types.js").ProjectConfig | null = null;
    try {
      projConfig = await getProjectConfig(projectPath);
    } catch {
      // Non-fatal: fall back to defaults
    }

    const effectiveWorkPlan = (stateId: string, base: string[]): string[] => {
      const override = projConfig?.naviWorkPlans?.[stateId];
      return Array.isArray(override) && override.length > 0 ? override : base;
    };

    let newStateId = currentStateId;

    // Call 1: Classification — skip if no user message or no transitions
    if (userMessage && currentState.transitions.length > 0) {
      emit({ type: "navi_step", data: { label: "Prüfe Phasenwechsel …" } });
      const classificationSystemPrompt =
        'Du analysierst eine Nutzer-Nachricht und entscheidest, welche Transition zutrifft. Antworte NUR mit der Zahl der zutreffenden Transition oder "0" wenn keine zutrifft. Keine Erklärung. Nur die Zahl.';
      const classificationHistory = Array.isArray(request.history) ? request.history : [];
      const classificationUserPrompt = buildClassificationPrompt(
        currentStateId,
        userMessage,
        currentState.transitions,
        effectiveWorkPlan(currentStateId, currentState.workPlan),
        classificationHistory,
      );

      try {
        const classificationResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
          body: JSON.stringify({
            model: endpoint.model,
            stream: false,
            max_tokens: 5,
            reasoning_effort: "medium",
            messages: [
              { role: "system", content: classificationSystemPrompt },
              { role: "user", content: classificationUserPrompt },
            ],
          }),
        });

        if (classificationResponse.ok) {
          const classificationJson = (await classificationResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawChoice = classificationJson?.choices?.[0]?.message?.content?.trim() ?? "0";
          const choiceNum = parseInt(rawChoice, 10);
          if (!isNaN(choiceNum) && choiceNum >= 1 && choiceNum <= currentState.transitions.length) {
            const candidateStateId = currentState.transitions[choiceNum - 1].to;
            if (candidateStateId === "confirm_understanding") {
              const userMessageCount =
                classificationHistory.filter((m) => m.role === "user").length + 1;
              if (userMessageCount > 10) {
                newStateId = candidateStateId;
              }
            } else {
              newStateId = candidateStateId;
            }
          }
        }
      } catch {
        // Classification error: keep current state, continue with response
      }
    }

    if (!isStreamActive(streamId)) return;

    // Calls 2 / 2b / 2c — run in parallel, all depend only on Call 1's result (newStateId).
    const currentEffectiveWorkPlan = effectiveWorkPlan(currentStateId, currentState.workPlan);

    let stateSummary: string | undefined;
    let naviPlan: string | undefined = request.naviPlan ?? undefined;
    let naviCurrentProblem: string | undefined = request.naviCurrentProblem ?? undefined;
    let naviCurrentProblemInterpretation: string | undefined =
      request.naviCurrentProblemInterpretation ?? undefined;
    let naviProblemQueue: string[] = request.naviProblemQueue ?? [];
    let updatedNaviContext: import("../../../src/types.js").NaviContext | undefined;

    // Sync pre-step: re-entering clarify_problem with a queued problem → pop it now so that
    // Call 2b (plan generation) correctly sees naviPlan = undefined and generates a fresh plan.
    if (newStateId === "clarify_problem" && currentStateId !== "clarify_problem") {
      if (naviProblemQueue.length > 0 && naviCurrentProblem) {
        naviCurrentProblem = naviProblemQueue[0];
        naviCurrentProblemInterpretation = undefined;
        naviProblemQueue = naviProblemQueue.slice(1);
        naviPlan = undefined;
        emit({ type: "navi_problems", data: { current: naviCurrentProblem, queue: naviProblemQueue } });
      }
    }

    // Entering explore_software_stack from a different state → drop any leftover
    // clarify_problem plan so Call 2b generates a fresh, problem-tailored stack-question plan.
    if (newStateId === "explore_software_stack" && currentStateId !== "explore_software_stack") {
      naviPlan = undefined;
    }

    await Promise.all([
      // Call 2: summary of the completed state (on transition with workPlan).
      (async () => {
        if (newStateId === currentStateId || currentEffectiveWorkPlan.length === 0) return;
        emit({ type: "navi_step", data: { label: "Erstelle Zusammenfassung …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.join("\n");
          const summaryPrompt = buildStateSummaryPrompt(
            currentStateId,
            currentEffectiveWorkPlan,
            excerpt,
          );
          const summaryResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              temperature: 0.1,
              reasoning_effort: "medium",
              messages: [{ role: "user", content: summaryPrompt }],
            }),
          });
          if (summaryResponse.ok) {
            const summaryJson = (await summaryResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            stateSummary =
              normalizeText(summaryJson?.choices?.[0]?.message?.content ?? "") || undefined;
          }
        } catch (err) {
          console.error("[navi] State summary generation failed:", err);
        }
      })(),

      // Call 2b: question plan for clarify_problem and explore_software_stack.
      // Both phases use a dynamically generated, problem-tailored question list so that
      // irrelevant areas (e.g. the payment system when the problem is "too few customers") are skipped.
      (async () => {
        const isProblemPlan = newStateId === "clarify_problem";
        const isStackPlan = newStateId === "explore_software_stack";
        if ((!isProblemPlan && !isStackPlan) || naviPlan) return;
        emit({ type: "navi_step", data: { label: "Plane Fragen …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-10).join("\n");
          const planHints = projConfig?.naviPlanHints?.[newStateId];
          let planSystemPromptParts: string[];
          let planUserPrompt: string;
          if (isStackPlan) {
            planSystemPromptParts = [
              "Du analysierst das Gespräch zwischen Navi (KI-Berater) und einem Händler.",
              "Navi kennt bereits das Hauptproblem des Händlers. Jetzt muss Navi nur noch den Software-Stack klären, der für DIESES Problem relevant ist.",
              "Deine Aufgabe: Erstelle eine kurze, priorisierte Liste der Stack-Fragen, die zur Lösung des genannten Problems WIRKLICH beitragen. Leite die relevanten Bereiche aus dem Problem ab.",
              "Beispiele für die Ableitung:",
              "- Problem 'zu wenig Kunden / Laufkundschaft / Reichweite / Sichtbarkeit' → relevant: Online-Präsenz, Social Media, Newsletter. NICHT fragen: Kassensystem, Lager, Buchhaltung.",
              "- Problem 'Bestell- oder Support-Chaos, Terminvergabe' → relevant: Kundenkommunikation (E-Mail/WhatsApp/Telefon). NICHT fragen: Social Media, Reichweite.",
              "- Problem 'Lager, Abrechnung, Kassenanbindung' → relevant: Kassensystem, Lagertool. NICHT fragen: Social Media, Newsletter.",
              "Frag NUR nach Bereichen, die zur Lösung des Problems beitragen können – lass alles andere konsequent weg.",
              "Online-Präsenz (Online-Shop ja/nein, welche Plattform – oder nur stationär) IMMER aufnehmen, sofern noch nicht bekannt.",
              "Fragen die bereits beantwortet wurden, NICHT aufnehmen.",
              "Maximal 4 Fragen. Frag einfach, ohne Fachbegriffe. Antwortformat: NUR eine Bullet-Liste mit '-', kein anderer Text.",
            ];
            planUserPrompt = `Gesprächsausschnitt:\n${excerpt}\n\nWelche Stack-Fragen muss Navi noch klären, um für das genannte Problem eine sinnvolle Empfehlung geben zu können? Nur problemrelevante Bereiche.`;
          } else {
            planSystemPromptParts = [
              "Du analysierst das Gespräch zwischen Navi (KI-Berater) und einem Händler.",
              "Deine Aufgabe: Erstelle eine kurze, priorisierte Liste der wichtigsten offenen Fragen, die Navi noch klären muss – ausschließlich zum Hauptproblem, das der Händler genannt hat.",
              "WICHTIG: Alle Fragen müssen sich auf DIESES EINE Hauptproblem beziehen. Keine Fragen zu anderen Themen oder potenziellen Nebenproblemen.",
              "Unterscheide dabei nach Händlertyp: Online-Handel (nur online), Vor-Ort-Handel (nur stationär), oder beides kombiniert.",
              "Fokussiere auf praktische Lücken – nicht auf Hintergründe, Ausmaß oder Auswirkungen.",
              "Fragen die bereits beantwortet wurden, NICHT aufnehmen.",
              "Maximal 5 Fragen. Antwortformat: NUR eine Bullet-Liste mit '-', kein anderer Text.",
            ];
            planUserPrompt = `Gesprächsausschnitt:\n${excerpt}\n\nWelche offenen Fragen muss Navi noch klären, um das genannte Hauptproblem des Händlers konkret zu verstehen und die praktische Lücke zu finden? Nur Fragen zu diesem einen Problem.`;
          }
          if (planHints?.include?.length) {
            planSystemPromptParts.push(
              `PFLICHT-THEMEN (müssen abgedeckt sein, sofern noch nicht beantwortet):\n${planHints.include.map((h) => `- ${h}`).join("\n")}`,
            );
          }
          if (planHints?.exclude?.length) {
            planSystemPromptParts.push(
              `VERBOTENE THEMEN (auf keinen Fall fragen):\n${planHints.exclude.map((h) => `- ${h}`).join("\n")}`,
            );
          }
          const planSystemPrompt = planSystemPromptParts.join("\n");
          const planResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 150,
              temperature: 0.1,
              reasoning_effort: "medium",
              messages: [
                { role: "system", content: planSystemPrompt },
                { role: "user", content: planUserPrompt },
              ],
            }),
          });
          if (planResponse.ok) {
            const planJson = (await planResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const rawPlan = normalizeText(planJson?.choices?.[0]?.message?.content ?? "");
            if (rawPlan) {
              naviPlan = rawPlan;
              emit({ type: "navi_plan", data: { plan: naviPlan } });
            }
          }
        } catch (err) {
          console.error("[navi] Question plan generation failed:", err);
        }
      })(),

      // Call 2d: naviContext extraction — on every state transition to keep the structured fact sheet current.
      (async () => {
        if (newStateId === currentStateId) return;
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-20).join("\n");
          const contextPrompt = buildNaviContextPrompt(excerpt);
          const contextResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 200,
              temperature: 0,
              reasoning_effort: "medium",
              messages: [{ role: "user", content: contextPrompt }],
            }),
          });
          if (contextResponse.ok) {
            const contextJson = (await contextResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const raw = normalizeText(contextJson?.choices?.[0]?.message?.content ?? "");
            const jsonMatch = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const start = jsonMatch.indexOf("{");
            const end = jsonMatch.lastIndexOf("}");
            if (start !== -1 && end > start) {
              const parsed = JSON.parse(jsonMatch.slice(start, end + 1)) as Record<string, unknown>;
              const ctx: import("../../../src/types.js").NaviContext = {};
              if (typeof parsed.laden === "string" && parsed.laden.trim())
                ctx.laden = parsed.laden.trim();
              if (typeof parsed.problem === "string" && parsed.problem.trim())
                ctx.problem = parsed.problem.trim();
              if (typeof parsed.luecke === "string" && parsed.luecke.trim())
                ctx.luecke = parsed.luecke.trim();
              if (typeof parsed.stack === "string" && parsed.stack.trim())
                ctx.stack = parsed.stack.trim();
              if (typeof parsed.empfehlung === "string" && parsed.empfehlung.trim())
                ctx.empfehlung = parsed.empfehlung.trim();
              if (Object.keys(ctx).length > 0) updatedNaviContext = ctx;
            }
          }
        } catch (err) {
          console.error("[navi] NaviContext extraction failed:", err);
        }
      })(),

      // Call 2c: problem extraction — first entry into clarify_problem without a known current problem.
      (async () => {
        if (
          newStateId !== "clarify_problem" ||
          currentStateId === "clarify_problem" ||
          naviCurrentProblemInterpretation
        )
          return;
        emit({ type: "navi_step", data: { label: "Erkenne Anliegen …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-10).join("\n");

          const knownProblem = naviCurrentProblem;
          const extractSystemPrompt = knownProblem
            ? [
                "Du analysierst ein Gespräch zwischen Navi (KI-Berater) und einem Händler.",
                `Das aktuelle Problem des Händlers ist bereits bekannt: "${knownProblem}"`,
                "Deine Aufgabe: Erstelle eine kurze Interpretation dieses Problems.",
                "Die Interpretation erklärt: Was bedeutet das Problem wirklich? In welche Richtung zeigt die Lösung?",
                "Beispiel: 'Struktureller Rückgang der Laufkundschaft in der Gegend – nicht store-spezifisch. Lösung: alternative Kanäle erschließen (online, Reichweite), nicht Außenauftritt optimieren.'",
                'Antworte NUR mit gültigem JSON: { "current": "...", "interpretation": "...", "queue": [] }',
              ].join("\n")
            : [
                "Du analysierst ein Gespräch zwischen Navi (KI-Berater) und einem Händler.",
                "Deine Aufgabe: Finde alle konkreten Probleme oder Anliegen, die der Händler genannt hat.",
                "Gib das wichtigste / zuerst genannte Problem als 'current' zurück.",
                "Erstelle außerdem eine kurze 'interpretation': Was bedeutet das Problem wirklich? In welche Richtung zeigt die Lösung?",
                "Beispiel interpretation: 'Struktureller Rückgang der Laufkundschaft – nicht store-spezifisch. Lösung: alternative Kanäle erschließen, nicht Außenauftritt optimieren.'",
                "Alle weiteren Probleme als Array in 'queue' (leer wenn keins). Kurze Labels, z. B. 'Buchhaltung zu aufwändig'.",
                'Antworte NUR mit gültigem JSON: { "current": "...", "interpretation": "...", "queue": [] }',
              ].join("\n");

          const extractResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 200,
              temperature: 0.1,
              reasoning_effort: "medium",
              messages: [
                { role: "system", content: extractSystemPrompt },
                {
                  role: "user",
                  content: `Gesprächsausschnitt:\n${excerpt}\n\nAnalysiere das Problem des Händlers.`,
                },
              ],
            }),
          });
          if (extractResponse.ok) {
            const extractJson = (await extractResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const raw = normalizeText(extractJson?.choices?.[0]?.message?.content ?? "");
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as {
                current?: string;
                interpretation?: string;
                queue?: string[];
              };
              if (parsed.current) {
                naviCurrentProblem = parsed.current;
                naviCurrentProblemInterpretation = parsed.interpretation ?? "";
                naviProblemQueue = Array.isArray(parsed.queue) ? parsed.queue : naviProblemQueue;
                emit({
                  type: "navi_problems",
                  data: {
                    current: naviCurrentProblem,
                    interpretation: naviCurrentProblemInterpretation,
                    queue: naviProblemQueue,
                  },
                });
              }
            }
          }
        } catch (err) {
          console.error("[navi] Problem extraction failed:", err);
        }
      })(),
    ]);

    emit({
      type: "navi_state",
      data: {
        stateId: newStateId,
        ...(newStateId !== currentStateId ? { completedStateId: currentStateId } : {}),
        ...(stateSummary ? { summary: stateSummary } : {}),
      },
    });

    if (updatedNaviContext) {
      emit({ type: "navi_context", data: updatedNaviContext });
    }

    const newState = getNaviState(newStateId) ?? currentState;

    let effectiveInstruction = newState.instruction;
    const instructionOverride = projConfig?.naviInstructions?.[newStateId];
    if (typeof instructionOverride === "string" && instructionOverride.trim()) {
      effectiveInstruction = instructionOverride;
    }

    // Inject the question plan if we are in a plan-driven phase (clarify_problem or
    // explore_software_stack) and have a plan. The plan is specific to this conversation and
    // takes priority — inject it FIRST so the LLM picks the right next question before reading
    // the general rules below.
    const activePlan = naviPlan ?? (request.naviPlan ?? undefined);
    if (
      (newStateId === "clarify_problem" || newStateId === "explore_software_stack") &&
      activePlan
    ) {
      effectiveInstruction = [
        `Nächste Fragen für dieses Gespräch (in dieser Reihenfolge – bereits beantwortete überspringen):`,
        activePlan,
        `---`,
        `Allgemeine Regeln (nur anwenden, wenn der Plan oben keine Abdeckung hat):`,
        effectiveInstruction,
      ].join("\n");
    }

    const problemFocusBlock = naviCurrentProblem
      ? [
          `Das Anliegen des Händlers: "${naviCurrentProblem}"`,
          ...(naviCurrentProblemInterpretation ? [`→ ${naviCurrentProblemInterpretation}`] : []),
          ...(naviProblemQueue.length > 0
            ? [`Weitere Anliegen danach: ${naviProblemQueue.join(", ")}`]
            : []),
          "Alle Fragen ausschließlich zu diesem Anliegen – nichts anderes.",
        ].join("\n")
      : null;

    if (newStateId === "closing" && naviProblemQueue.length > 0) {
      effectiveInstruction = `${effectiveInstruction}\n\nNoch nicht besprochene Anliegen des Händlers: ${naviProblemQueue.map((p) => `"${p}"`).join(", ")}. Frage am Ende freundlich, ob der Händler eines dieser Themen noch angehen möchte.`;
    }

    const knowledgePrompt = buildNaviKnowledgePrompt(newStateId);

    const naviCtx = request.naviContext;
    const naviContextSection = (() => {
      if (!naviCtx) return "";
      const parts: string[] = [];
      if (naviCtx.laden) parts.push(`- Laden: ${naviCtx.laden}`);
      if (naviCtx.problem) parts.push(`- Problem: ${naviCtx.problem}`);
      if (naviCtx.luecke) parts.push(`- Praktische Lücke: ${naviCtx.luecke}`);
      if (naviCtx.stack) parts.push(`- Stack: ${naviCtx.stack}`);
      if (naviCtx.empfehlung) parts.push(`- Empfehlung: ${naviCtx.empfehlung}`);
      if (parts.length === 0) return "";
      return "Bekannte Fakten über den Händler:\n" + parts.join("\n");
    })();

    const naviResults = request.naviResults ?? {};
    const resultEntries = Object.entries(naviResults).filter(([, v]) => v?.trim());
    const naviResultsContext =
      resultEntries.length > 0
        ? [
            "Bisher herausgefundene Fakten aus früheren Gesprächsphasen:",
            ...resultEntries.map(([stateId, summary]) => `[${stateId}]\n${summary}`),
          ].join("\n\n")
        : "";

    const coveredTips = new Set(request.naviCoveredTips ?? []);
    const pendingTips = NAVI_TIPS.filter((t) => !coveredTips.has(t.id));
    const tipsPromptSection =
      pendingTips.length > 0
        ? [
            "Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich in das Gespräch passen – danach nicht wiederholen:",
            ...pendingTips.map((t) => `- ${t.instruction}`),
          ].join("\n")
        : "";

    const naviSystemPrompt =
      newState.persona === "narrow"
        ? [
            ...NAVI_NARROW_PERSONA_RULES,
            ...(problemFocusBlock ? [problemFocusBlock] : []),
            ...(naviContextSection ? [naviContextSection] : []),
            ...(naviResultsContext ? [naviResultsContext] : []),
            `Deine Aufgabe in diesem Schritt: ${effectiveInstruction}`,
          ].join("\n\n")
        : [
            ...NAVI_FULL_PERSONA_RULES,
            ...(problemFocusBlock ? [problemFocusBlock] : []),
            ...(naviContextSection ? [naviContextSection] : []),
            ...(naviResultsContext ? [naviResultsContext] : []),
            `Deine aktuelle Aufgabe: ${effectiveInstruction}`,
            ...(tipsPromptSection ? [tipsPromptSection] : []),
            ...(knowledgePrompt ? [knowledgePrompt] : []),
          ].join("\n\n");

    const conversationMessages: OpenAiMessage[] = [{ role: "system", content: naviSystemPrompt }];
    const history = Array.isArray(request.history) ? request.history : [];
    for (const msg of history) {
      if (msg.hidden) continue;
      if (msg.role === "assistant") {
        const content = typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content) continue;
        const toolCalls = Array.isArray(msg.toolCalls)
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }))
          : undefined;
        conversationMessages.push({
          role: "assistant",
          content,
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      } else if (msg.role === "tool") {
        const content = typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content || !msg.toolCallId) continue;
        conversationMessages.push({ role: "tool", content, tool_call_id: msg.toolCallId });
      } else if (msg.role === "user") {
        const content = typeof msg.content === "string" ? msg.content.trim() : "";
        if (!content) continue;
        conversationMessages.push({ role: "user", content });
      }
    }
    if (userMessage) {
      conversationMessages.push({ role: "user", content: userMessage });
    }

    const { tools: naviTools, toolChoice } = buildNaviStateTools(newState);

    let tokenCount = 0;
    let fullAssistantText = "";
    const maxNaviToolRounds = 3;
    let toolRound = 0;

    emit({ type: "navi_step", data: { label: null } });

    while (toolRound < maxNaviToolRounds) {
      if (!isStreamActive(streamId)) return;

      const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
        body: JSON.stringify({
          model: endpoint.model,
          stream: true,
          messages: conversationMessages,
          ...(naviTools.length > 0 ? { tools: naviTools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          reasoning_effort: "high",
        }),
      });

      if (!response.ok) {
        let detail = `Navi chat error: ${response.status}`;
        try {
          const body = await response.text();
          if (body) detail += ` — ${body}`;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let roundAssistantText = "";
      const collectedToolCalls = new Map<number, ToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isStreamActive(streamId)) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.substring(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          const data = line.substring(5).trim();
          if (!data) continue;
          if (data === "[DONE]") { currentEvent = ""; continue; }
          if (currentEvent === "error") throw new Error(data);

          let parsed: OpenAiStreamChunk | null = null;
          try {
            parsed = JSON.parse(data) as OpenAiStreamChunk;
          } catch {
            parsed = null;
          }
          if (!parsed) { currentEvent = ""; continue; }

          const token = extractContentToken(parsed);
          if (token) {
            tokenCount++;
            roundAssistantText += token;
            fullAssistantText += token;
            emit({ type: "token", data: token });
          }

          accumulateToolCallChunks(parsed, collectedToolCalls);

          const finishReason = extractFinishReason(parsed);
          if (finishReason === "tool_calls") break;
          currentEvent = "";
        }
      }

      const toolCalls = [...collectedToolCalls.values()];

      if (toolCalls.length === 0) {
        if (!isStreamActive(streamId)) return;
        if (tokenCount === 0 && !roundAssistantText.trim()) {
          emit({ type: "error", data: { message: "MODEL_EMPTY_RESPONSE" } });
          return;
        }
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      // ask_question is a structural output constraint — extract and stream as plain text.
      const askQuestionCall = toolCalls.find((tc) => tc.function.name === "ask_question");
      if (askQuestionCall) {
        let resp = "";
        try {
          const args = JSON.parse(askQuestionCall.function.arguments) as { response?: unknown };
          resp = typeof args.response === "string" ? args.response.trim() : "";
        } catch {
          resp = askQuestionCall.function.arguments.trim();
        }
        if (newState.validation?.requiresQuestion && resp && !resp.includes("?")) {
          resp += "?";
        }
        if (resp) {
          fullAssistantText = resp;
          emit({ type: "token", data: resp });
        }
        if (!isStreamActive(streamId)) return;
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      for (const toolCall of toolCalls) {
        emit({ type: "tool_call", data: describeStreamingToolCall(toolCall) });
      }

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        executedResults.push(await executeToolCall(projectPath, toolCall));
      }

      const toolHistoryMessages: ChatMessage[] = [
        { role: "assistant", content: roundAssistantText, toolCalls, hidden: true },
        ...executedResults.map((result) => ({
          role: "tool" as const,
          toolCallId: result.toolCallId,
          content: result.result,
          hidden: false,
        })),
      ];
      emit({ type: "tool_history", data: toolHistoryMessages });

      conversationMessages.push({
        role: "assistant",
        content: roundAssistantText,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
      for (const result of executedResults) {
        conversationMessages.push({ role: "tool", tool_call_id: result.toolCallId, content: result.result });
      }

      // ask_clarification requires user interaction — stop here
      if (toolCalls.some((tc) => tc.function.name === "ask_clarification")) {
        if (!isStreamActive(streamId)) return;
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      toolRound += 1;
    }

    if (!isStreamActive(streamId)) return;

    // Call N: Check which tips were covered in this response.
    const coveredTipsSet = new Set(request.naviCoveredTips ?? []);
    const stillPendingTips = NAVI_TIPS.filter((t) => !coveredTipsSet.has(t.id));
    if (stillPendingTips.length > 0 && fullAssistantText.trim()) {
      try {
        const tipsCheckPrompt = [
          "Du prüfst, ob eine Antwort bestimmte Themen angesprochen hat.",
          "",
          `Antwort:\n"${fullAssistantText.slice(0, 800)}"`,
          "",
          "Welche der folgenden Themen wurden in der Antwort angesprochen?",
          ...stillPendingTips.map((t) => `- ${t.id}: ${t.coveredWhen}`),
          "",
          'Antworte NUR mit einer kommaseparierten Liste der IDs der angesprochenen Themen, oder "keine". Keine Erklärung.',
        ].join("\n");

        const tipsCheckResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
          body: JSON.stringify({
            model: endpoint.model,
            stream: false,
            max_tokens: 50,
            temperature: 0,
            reasoning_effort: "medium",
            messages: [{ role: "user", content: tipsCheckPrompt }],
          }),
        });

        if (tipsCheckResponse.ok) {
          const tipsCheckJson = (await tipsCheckResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const raw = normalizeText(tipsCheckJson?.choices?.[0]?.message?.content ?? "");
          if (raw && raw !== "keine") {
            const coveredIds = raw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter((id) => stillPendingTips.some((t) => t.id === id));
            if (coveredIds.length > 0) {
              emit({ type: "navi_tips_covered", data: { coveredIds } });
            }
          }
        }
      } catch {
        // Tips classifier failed — non-fatal
      }
    }

    emit({ type: "done", data: { fullAssistantText } });
  } catch (error) {
    if (!isStreamActive(streamId)) return;
    emit({
      type: "error",
      data: { message: error instanceof Error ? error.message : "NAVI_STREAM_FAILED" },
    });
  }
}
