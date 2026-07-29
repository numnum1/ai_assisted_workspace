import { describe, expect, it } from "vitest";
import { ensureChatCompletionsUrl, normalizeReasoningEffort } from "./openAiClient.js";

describe("normalizeReasoningEffort", () => {
  it('maps "medium" to "high" for Grok models', () => {
    expect(normalizeReasoningEffort("grok-4.5", "medium")).toBe("high");
    expect(normalizeReasoningEffort("grok-4.3", "medium")).toBe("high");
    expect(normalizeReasoningEffort("GROK-4.5", "medium")).toBe("high");
  });

  it("passes through the values Grok actually accepts", () => {
    expect(normalizeReasoningEffort("grok-4.5", "low")).toBe("low");
    expect(normalizeReasoningEffort("grok-4.5", "high")).toBe("high");
  });

  it("leaves non-Grok models untouched", () => {
    expect(normalizeReasoningEffort("qwen3.5-35b-a3b", "medium")).toBe("medium");
    expect(normalizeReasoningEffort("gpt-5", "medium")).toBe("medium");
  });
});

describe("ensureChatCompletionsUrl", () => {
  it("appends the full path to a bare host", () => {
    expect(ensureChatCompletionsUrl("https://api.eecc.ai")).toBe(
      "https://api.eecc.ai/v1/chat/completions",
    );
  });

  it("does not duplicate an already complete url", () => {
    expect(ensureChatCompletionsUrl("https://api.eecc.ai/v1/chat/completions")).toBe(
      "https://api.eecc.ai/v1/chat/completions",
    );
    expect(ensureChatCompletionsUrl("https://api.eecc.ai/v1")).toBe(
      "https://api.eecc.ai/v1/chat/completions",
    );
  });
});
