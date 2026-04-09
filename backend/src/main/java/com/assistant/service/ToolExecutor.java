package com.assistant.service;

import com.assistant.model.ToolCall;
import com.assistant.service.tools.Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Registry that discovers all {@link Tool} beans and routes tool calls to them.
 * To add a new tool, create a class that implements {@link Tool}, annotate it
 * with {@code @Component}, and place it in the {@code service/tools} package —
 * no changes to this class are required.
 */
@Service
public class ToolExecutor {

    private static final Logger log = LoggerFactory.getLogger(ToolExecutor.class);

    private final Map<String, Tool> toolsByName;

    public ToolExecutor(List<Tool> tools) {
        this.toolsByName = tools.stream()
                .collect(Collectors.toMap(Tool::getName, Function.identity()));
        log.info("Registered tools: {}", toolsByName.keySet());
    }

    /** Returns all tool definitions in OpenAI function-calling format. */
    public List<Map<String, Object>> getToolDefinitions() {
        return toolsByName.values().stream()
                .map(Tool::getDefinition)
                .toList();
    }

    /** Definitions for the given tool names, in list order; skips unknown names. */
    public List<Map<String, Object>> getToolDefinitionsForNames(Collection<String> names) {
        if (names == null || names.isEmpty()) {
            return List.of();
        }
        return names.stream()
                .map(toolsByName::get)
                .filter(t -> t != null)
                .map(Tool::getDefinition)
                .toList();
    }

    /** All definitions except tools whose {@link Tool#getName()} is in {@code excluded}. */
    public List<Map<String, Object>> getToolDefinitionsExcluding(Set<String> excluded) {
        if (excluded == null || excluded.isEmpty()) {
            return getToolDefinitions();
        }
        return toolsByName.entrySet().stream()
                .filter(e -> !excluded.contains(e.getKey()))
                .map(e -> e.getValue().getDefinition())
                .toList();
    }

    /**
     * Names of registered tools whose {@link Tool#getToolkit()} is in {@code toolkitIds}.
     */
    public Set<String> collectToolNamesInToolkits(Set<String> toolkitIds) {
        if (toolkitIds == null || toolkitIds.isEmpty()) {
            return Set.of();
        }
        return toolsByName.values().stream()
                .filter(t -> toolkitIds.contains(t.getToolkit()))
                .map(Tool::getName)
                .collect(Collectors.toCollection(HashSet::new));
    }

    /** Executes the tool referenced by the given tool call. */
    public String execute(ToolCall toolCall) {
        String name = toolCall.getFunction().getName();
        String args = toolCall.getFunction().getArguments();
        log.debug("Executing tool: name={}, argsLength={}", name, args != null ? args.length() : 0);
        Tool tool = toolsByName.get(name);
        if (tool == null) {
            log.warn("Unknown tool requested: {}", name);
            return "Unknown tool: " + name;
        }
        long t0 = System.nanoTime();
        String out = tool.execute(args);
        long ms = (System.nanoTime() - t0) / 1_000_000L;
        log.info(
                "Tool executed: name={}, durationMs={}, resultChars={}",
                name,
                ms,
                out != null ? out.length() : 0);
        return out;
    }

    /** Returns a human-readable description of the tool call for the SSE event. */
    public String describeToolCall(ToolCall toolCall) {
        String name = toolCall.getFunction().getName();
        Tool tool = toolsByName.get(name);
        if (tool == null) {
            return "Running: " + name;
        }
        return tool.describe(toolCall.getFunction().getArguments());
    }
}
