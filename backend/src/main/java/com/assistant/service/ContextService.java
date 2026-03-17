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

        // TODO: inject chapter metadata as AI context
        // Replace the project file listing below with a structured summary of chapters/scenes/actions
        // using ChapterService.listChapters() and ChapterService.getChapter() so the AI understands
        // the narrative structure without reading full .md content.

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

        // Tool usage instructions
        systemPrompt.append("=== Available Tools ===\n");
        systemPrompt.append("You have access to tools for project files and the project wiki:\n\n");
        systemPrompt.append("**Wiki (characters, locations, organizations, world-building):**\n");
        systemPrompt.append("- wiki_search(query, type?, limit?): Search the project wiki for entries. " +
                "Returns compact hit list with IDs.\n");
        systemPrompt.append("- wiki_read(id): Read the full content of a wiki entry by id (format: typeId/entryId, e.g. character/mara-voss).\n\n");
        systemPrompt.append("**IMPORTANT:** When you see a character name, location, organization, or other named entity " +
                "in the user's message or in referenced content, call wiki_search with that name to look it up in the wiki. " +
                "Do not assume you know the character — always search first. Use wiki_read to get full details when needed.\n\n");
        systemPrompt.append("**Project files:**\n");
        systemPrompt.append("- search_project(query): Search for files/folders by name or path. " +
                "Use for story chapters, notes, or other non-wiki project files.\n");
        systemPrompt.append("- read_file(path): Read the full content of a project file. " +
                "Use after searching to inspect relevant files.\n");
        systemPrompt.append("- read_story_text(chapter_id, scene_id?): Read the combined prose text " +
                "of all actions in a scene (if scene_id given) or an entire chapter. " +
                "Use this to read what has actually been written in the story.\n\n");

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
