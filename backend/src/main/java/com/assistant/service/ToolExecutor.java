package com.assistant.service;

import com.assistant.model.ToolCall;
import com.assistant.service.tools.Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
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

    /** Executes the tool referenced by the given tool call. */
    public String execute(ToolCall toolCall) {
        String name = toolCall.getFunction().getName();
        Tool tool = toolsByName.get(name);
        if (tool == null) {
            return "Unknown tool: " + name;
        }
        return tool.execute(toolCall.getFunction().getArguments());
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
