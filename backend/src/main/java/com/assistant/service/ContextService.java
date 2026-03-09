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
    private final ProjectConfigService projectConfigService;

    public ContextService(FileService fileService, ModeService modeService,
                          ReferenceResolver referenceResolver, AppConfig appConfig,
                          ProjectConfigService projectConfigService) {
        this.fileService = fileService;
        this.modeService = modeService;
        this.referenceResolver = referenceResolver;
        this.appConfig = appConfig;
        this.projectConfigService = projectConfigService;
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

        // 2. Inject rules (global + per-mode) right after the mode system prompt
        appendRules(systemPrompt, mode);

        // 3. Determine "always include" files: prefer project config, fall back to application.yml
        List<String> alwaysInclude;
        if (projectConfigService.hasProjectConfig()) {
            alwaysInclude = new ArrayList<>(projectConfigService.getConfig().getAlwaysInclude());
        } else {
            alwaysInclude = new ArrayList<>(appConfig.getProject().getAlwaysInclude());
        }

        // 4. Include mode's auto-includes
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

        // Auto-inject scene/chapter context when active file is inside chapters/
        if (request.getActiveFile() != null) {
            injectSceneContext(systemPrompt, request.getActiveFile(), includedFiles);
        }

        // Tool usage instructions
        systemPrompt.append("=== Available Tools ===\n");
        systemPrompt.append("You have access to tools that let you search and read project files:\n");
        systemPrompt.append("- search_project(query): Search for files/folders by name or path. " +
                "Use this when discussing characters, locations, plot elements, or any topic that " +
                "might have corresponding files in the project.\n");
        systemPrompt.append("- read_file(path): Read the full content of a project file. " +
                "Use this after searching to inspect relevant files.\n");
        systemPrompt.append("- scene_search(query, chapter?): Search scene metadata (.scene.json files) " +
                "under chapters/. Returns summaries without loading full content.\n");
        systemPrompt.append("- scene_read(path): Read full metadata of a specific .scene.json file.\n");
        systemPrompt.append("- wiki_search(query, type?): Search the project wiki for characters, " +
                "locations, organizations.\n");
        systemPrompt.append("- wiki_read(path): Read a full wiki entry.\n");
        systemPrompt.append("Proactively use these tools when the conversation involves elements " +
                "that may have dedicated files in the project structure.\n\n");

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

    /**
     * When the active file is inside chapters/, auto-injects:
     * - The current scene's .scene.json (if it exists)
     * - The neighboring scenes' .scene.json (previous and next)
     * - The chapter's .chapter.json (if it exists)
     * This saves tool-call rounds for the most common co-author scenario.
     */
    private void injectSceneContext(StringBuilder systemPrompt, String activeFile, Set<String> includedFiles) {
        // activeFile must be like "chapters/<chapter>/<scene>.md" or "chapters/<chapter>/<scene>.scene.json"
        String normalized = activeFile.replace('\\', '/');
        if (!normalized.startsWith("chapters/")) return;

        String[] parts = normalized.split("/");
        if (parts.length < 3) return; // need at least chapters/<chapter>/<file>

        String chapterPath = parts[0] + "/" + parts[1];
        String chapterName = parts[1];
        String fileName = parts[2];

        // Derive scene base name
        String sceneName;
        if (fileName.endsWith(".scene.json")) {
            sceneName = fileName.substring(0, fileName.length() - ".scene.json".length());
        } else if (fileName.endsWith(".md")) {
            sceneName = fileName.substring(0, fileName.length() - ".md".length());
        } else {
            return;
        }

        // Inject chapter metadata
        String chapterMetaPath = chapterPath + "/" + chapterName + ".chapter.json";
        injectJsonFileIfExists(systemPrompt, chapterMetaPath, includedFiles);

        // Inject current scene metadata
        String currentSceneMeta = chapterPath + "/" + sceneName + ".scene.json";
        injectJsonFileIfExists(systemPrompt, currentSceneMeta, includedFiles);

        // Find neighbor scenes by listing the chapter directory
        try {
            java.util.List<String> chapterFiles = fileService.listFiles(chapterPath);
            java.util.List<String> sceneNames = chapterFiles.stream()
                    .filter(p -> p.endsWith(".md"))
                    .map(p -> {
                        String fn = p.contains("/") ? p.substring(p.lastIndexOf('/') + 1) : p;
                        return fn.substring(0, fn.length() - 3);
                    })
                    .sorted()
                    .toList();

            int idx = sceneNames.indexOf(sceneName);
            if (idx > 0) {
                String prevMeta = chapterPath + "/" + sceneNames.get(idx - 1) + ".scene.json";
                injectJsonFileIfExists(systemPrompt, prevMeta, includedFiles);
            }
            if (idx >= 0 && idx < sceneNames.size() - 1) {
                String nextMeta = chapterPath + "/" + sceneNames.get(idx + 1) + ".scene.json";
                injectJsonFileIfExists(systemPrompt, nextMeta, includedFiles);
            }
        } catch (java.io.IOException e) {
            // Not critical – silently skip
        }
    }

    private void injectJsonFileIfExists(StringBuilder sb, String path, Set<String> includedFiles) {
        if (includedFiles.contains(path)) return;
        if (!fileService.fileExists(path)) return;
        try {
            String content = fileService.readFile(path);
            sb.append("=== ").append(path).append(" ===\n");
            sb.append(content).append("\n\n");
            includedFiles.add(path);
        } catch (java.io.IOException e) {
            // Skip on error
        }
    }

    private void appendRules(StringBuilder systemPrompt, Mode mode) {
        if (!projectConfigService.hasProjectConfig()) return;

        // Collect global rules + per-mode rules, deduplicated
        Set<String> rulePaths = new LinkedHashSet<>();
        List<String> globalRules = projectConfigService.getConfig().getGlobalRules();
        if (globalRules != null) rulePaths.addAll(globalRules);
        if (mode.getRules() != null) rulePaths.addAll(mode.getRules());

        if (rulePaths.isEmpty()) return;

        Map<String, String> ruleContents = projectConfigService.getRuleContents(new ArrayList<>(rulePaths));
        if (ruleContents.isEmpty()) return;

        systemPrompt.append("=== Rules ===\n");
        for (Map.Entry<String, String> entry : ruleContents.entrySet()) {
            String fileName = entry.getKey().contains("/")
                    ? entry.getKey().substring(entry.getKey().lastIndexOf('/') + 1)
                    : entry.getKey();
            String ruleName = fileName.endsWith(".md") ? fileName.substring(0, fileName.length() - 3) : fileName;
            systemPrompt.append("--- ").append(ruleName).append(" ---\n");
            systemPrompt.append(entry.getValue()).append("\n\n");
        }
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
                .mapToInt(m -> m.getContent() != null ? m.getContent().length() : 0)
                .sum();
        return totalChars / 4;
    }
}
