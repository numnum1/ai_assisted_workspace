package com.assistant.testing_ai_ignore_this;

import java.util.List;

/**
 * These are just examples for how a conversation could be modeled, to simplify the UI development
 */

public abstract class Conversation {
    String name;
    boolean savedToProject;
    List<Message> messages;
    abstract Assistant getAssistant(); // This is what shows up in the ui. This is used for the next message
    abstract boolean isGuidedChat();
    abstract Plan getPlan();
    Context computeContext() { // This should represent the context inspection
        return null;
    } // TODO: Implement
}

abstract class GuidedConversation extends Conversation {
    @Override boolean isGuidedChat() {
        return true;
    }
}

// Guided conversation in which the user can change the assistant and the ai can change the plan
class NonAgenticGuidedConversation extends GuidedConversation {
    Plan plan;
    Assistant assistant;
    @Override Assistant getAssistant() {
        return assistant;
    }
    @Override Plan getPlan() {
        return plan;
    }
}

// Guided conversation but with a set setting (mode, plan, llm, ...)
class AgenticConversation extends GuidedConversation {
    Agent agent;
    @Override Assistant getAssistant() {
        return new AgentAssistant(agent);
    }
    @Override Plan getPlan() {
        return new Plan(agent.planTitle, agent.planContent);
    }
}

class NormalConversation extends Conversation {
    Assistant assistant;
    @Override Assistant getAssistant() {
        return assistant;
    }
    @Override boolean isGuidedChat() {
        return false;
    }
    @Override Plan getPlan() {
        return null;
    }
}

// For inspector too
class Context {
    List<ContextBlock> blocks;
}

class ContextBlock {
    String name;
    int size;
    // ...
}

// Turn. This is what the user can branch off, cut off, thread off, ...
abstract class Message {
    abstract Role getRole(); // Assistant,User
    abstract List<MessagePart> getParts(); // Thinking, Tool-Call, Message, MultipleChoice
}

class AssistantMessage extends Message {
    Assistant role;
    List<MessagePart> parts;
    TurnStatus getStatus() {
        if (parts.stream().anyMatch(t -> t.status == TurnStatus.STREAMING)) {
            return TurnStatus.STREAMING;
        }
        return TurnStatus.COMPLETED;
    }
    @Override Role getRole() {
        return role;
    }
    @Override List<MessagePart> getParts() {
        return parts;
    }
}

class UserMessage extends Message {
    List<String> attachedFiles;
    String content;
    @Override Role getRole() {
        return User.INSTANCE;
    }
    @Override List<MessagePart> getParts() {
        return List.of(new Chat(content));
    }

}

// These are blocks shown in the ui as things done by the ai or the user
abstract class MessagePart {
    TurnStatus status;
}

class ThreadStart extends MessagePart {
    Conversation thread;
}

class ThreadMerge extends MessagePart { // Just an idea
    Conversation thread;
}


abstract class ToolCall extends MessagePart {
}

class ReadFile extends ToolCall {
    String file;
}

class ReadLinesInFile extends ReadFile {
    int startLine;
    int endLine;
}

// TODO: Add more tool calls

abstract class ChatMessage extends MessagePart {
    String content;
    public ChatMessage(String content) {
        this.content = content;
    }
}

class Thoughts extends ChatMessage {
    public Thoughts(String content) {
        super(content);
    }
}

class Exploring extends ChatMessage {
    public Exploring(String content) {
        super(content);
    }
}

class Chat extends ChatMessage {
    public Chat(String content) {
        super(content);
    }
}

class MultipleChoice extends MessagePart {
    List<MultipleChoiceOption> options; // Index 0 = A, Index 1 = B, ...
    // Last option
    boolean hasAlternativeSelected; // Same as selected in a normal option
    String alternative; // Shown as last option, in which the user can enter its own message
}

class MultipleChoiceOption {
    String title;
    boolean selected;
}

abstract class Role {
    abstract String name();
    abstract boolean isLLM();
}

class User extends Role {
    static final User INSTANCE = new User();
    @Override String name() {
        return "User";
    }
    @Override boolean isLLM() {
        return false;
    }
}

abstract class Assistant extends Role {
    @Override boolean isLLM() {
        return true;
    }
    abstract String getMode(); // Creative Writing
    abstract LLM getLlm(); // Grok, GPT, QWEN
    abstract boolean getUsesReasoning();
    String getSystemPrompt() {
        // TODO: Implement by gathering from mode, tools, ...
        return "";
    }
}

class Plan {
    String title;
    String content;
    // TODO: Add missing stuff ...
    Plan(String title, String content) {
        this.title = title;
        this.content = content;
    }
}

class CustomAssistant extends Assistant {
    String mode;
    LLM llm;
    boolean usesReasoning;
    @Override String name() {
        return "Assistant";
    }
    @Override String getMode() {
        return mode;
    }
    @Override LLM getLlm() {
        return llm;
    }
    @Override boolean getUsesReasoning() {
        return usesReasoning;
    }
}

// Like an instant of an agent from the settings
class AgentAssistant extends Assistant {
    private final Agent usedAgent;

    // Initialize from settings
    AgentAssistant(Agent usedAgent) {
        this.usedAgent = usedAgent;
    }

    @Override String getMode() {
        return usedAgent.mode;
    }
    @Override LLM getLlm() {
        return usedAgent.llm;
    }
    @Override boolean getUsesReasoning() {
        return usedAgent.usesReasoning;
    }
    @Override String name() {
        return usedAgent.name;
    }
}

// Setup in settings
class Agent {
    String name;
    String mode;
    LLM llm;
    boolean usesReasoning;
    String planTitle;
    String planContent;
}

// Setup in settings
class LLM {
    String name; // Grok 4.2
    LLMCapabilities capabilities;
}

enum LLMCapabilities {
    ONLY_NON_REASONING,
    ONLY_REASONING,
    BOTH
}

enum TurnStatus {
    STREAMING,
    COMPLETED
}