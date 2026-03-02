package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.AssembledContext;
import com.assistant.model.ChatMessage;
import com.assistant.model.ChatRequest;
import com.assistant.model.Mode;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.*;

@Service
public class ContextService {

    private final FileService fileService;
    private final ModeService modeService;
    private final ReferenceResolver referenceResolver;
    private final AppConfig appConfig;

    public ContextService(FileService fileService, ModeService modeService,
                          ReferenceResolver referenceResolver, AppConfig appConfig) {
        this.fileService = fileService;
        this.modeService = modeService;
        this.referenceResolver = referenceResolver;
        this.appConfig = appConfig;
    }

    public AssembledContext assemble(ChatRequest request) {
        AssembledContext context = new AssembledContext();
        List<ChatMessage> messages = new ArrayList<>();
        Set<String> includedFiles = new LinkedHashSet<>();

        // 1. Build system prompt from mode
        Mode mode = request.getMode() != null
                ? modeService.getMode(request.getMode())
                : modeService.getDefaultMode();
        if (mode == null) {
            mode = modeService.getDefaultMode();
        }

        StringBuilder systemPrompt = new StringBuilder();
        systemPrompt.append(mode.getSystemPrompt()).append("\n\n");

        // 2. Include "always include" files from config
        List<String> alwaysInclude = new ArrayList<>(appConfig.getProject().getAlwaysInclude());

        // 3. Include mode's auto-includes
        if (mode.getAutoIncludes() != null) {
            alwaysInclude.addAll(mode.getAutoIncludes());
        }

        // Deduplicate
        Set<String> seen = new LinkedHashSet<>(alwaysInclude);

        // Build project file listing
        systemPrompt.append("=== Project Files ===\n");
        try {
            var tree = fileService.getFileTree();
            appendTreeListing(systemPrompt, tree, "");
        } catch (IOException e) {
            systemPrompt.append("[Could not read project structure]\n");
        }
        systemPrompt.append("\n");

        // Include always-included files
        for (String filePath : seen) {
            try {
                if (fileService.fileExists(filePath)) {
                    String content = fileService.readFile(filePath);
                    systemPrompt.append("=== ").append(filePath).append(" ===\n");
                    systemPrompt.append(content).append("\n\n");
                    includedFiles.add(filePath);
                }
            } catch (IOException e) {
                systemPrompt.append("=== ").append(filePath).append(" [read error] ===\n\n");
            }
        }

        messages.add(new ChatMessage("system", systemPrompt.toString()));

        // 5. Add conversation history
        if (request.getHistory() != null) {
            messages.addAll(request.getHistory());
        }

        // 6. Resolve @references in the user message and add referenced files
        ReferenceResolver.ResolvedReferences resolved =
                referenceResolver.resolve(request.getMessage(), request.getReferencedFiles());

        StringBuilder userMessage = new StringBuilder();

        // Add referenced file contents
        for (Map.Entry<String, String> entry : resolved.fileContents().entrySet()) {
            if (!includedFiles.contains(entry.getKey())) {
                userMessage.append("=== Referenced: ").append(entry.getKey()).append(" ===\n");
                userMessage.append(entry.getValue()).append("\n\n");
                includedFiles.add(entry.getKey());
            }
        }

        userMessage.append(resolved.cleanMessage());
        messages.add(new ChatMessage("user", userMessage.toString()));

        context.setMessages(messages);
        context.setIncludedFiles(new ArrayList<>(includedFiles));
        context.setEstimatedTokens(estimateTokens(messages));

        return context;
    }

    private void appendTreeListing(StringBuilder sb, com.assistant.model.FileNode node, String indent) {
        if (!".".equals(node.getPath())) {
            sb.append(indent).append(node.isDirectory() ? "📁 " : "📄 ").append(node.getName()).append("\n");
        }
        if (node.getChildren() != null) {
            for (var child : node.getChildren()) {
                appendTreeListing(sb, child, indent + "  ");
            }
        }
    }

    private int estimateTokens(List<ChatMessage> messages) {
        int totalChars = messages.stream()
                .mapToInt(m -> m.getContent().length())
                .sum();
        return totalChars / 4; // rough approximation: ~4 chars per token
    }
}
