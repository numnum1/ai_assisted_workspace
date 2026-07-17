import type { NaviState } from "./naviStateMachine.ts";
import type { NaviTip } from "./naviTips.ts";
import type { NaviPersonaConfig } from "./naviPersona.ts";
import type { NaviUseCase } from "./naviUseCases.ts";
import type { NaviTool } from "./naviTools.ts";

/**
 * Result of asking an LLM to propose Navi config changes based on beta-test feedback from one
 * conversation. Only touched domains are present; a domain that fails validation is dropped and
 * explained in `warnings` instead of being silently applied. Nothing here is persisted until a
 * human reviews it in the editor and hits Save per tab.
 */
export interface NaviImprovementProposal {
  /** Human-readable explanation, per changed domain, of which feedback drove which change. */
  rationale: string;
  states?: NaviState[];
  tips?: NaviTip[];
  persona?: NaviPersonaConfig;
  useCases?: NaviUseCase[];
  tools?: NaviTool[];
  /** Domains the model tried to change but that failed validation, with the reason — not applied. */
  warnings: string[];
}

/**
 * Dedicated LLM endpoint used only for "Aus Feedback verbessern" — independent of whatever
 * model the merchant-facing chat currently uses. The renderer never sees the raw apiKey back,
 * only whether one is stored.
 */
export interface NaviImprovementLlmPublic {
  apiUrl: string;
  model: string;
  apiKeySet: boolean;
}

/** Sent from the editor when saving. Omit apiKey to keep the currently stored one; send "" to clear it. */
export interface NaviImprovementLlmInput {
  apiUrl: string;
  model: string;
  apiKey?: string;
}

