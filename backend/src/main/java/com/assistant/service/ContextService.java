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
    private final ChapterService chapterService;

    public ContextService(FileService fileService, ModeService modeService,
                          ReferenceResolver referenceResolver, AppConfig appConfig,
                          ProjectConfigService projectConfigService,
                          ChapterService chapterService) {
        this.fileService = fileService;
        this.modeService = modeService;
        this.referenceResolver = referenceResolver;
        this.appConfig = appConfig;
        this.projectConfigService = projectConfigService;
        this.chapterService = chapterService;
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

        // 2b. Inject workspace mode system prompt addition
        if (projectConfigService.hasProjectConfig()) {
            com.assistant.model.WorkspaceModeSchema wsMode = projectConfigService.getWorkspaceModeSchema();
            String addition = wsMode.getSystemPromptAddition();
            if (addition != null && !addition.isBlank()) {
                systemPrompt.append(addition).append("\n\n");
            }
        }

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

        systemPrompt.append("=== Story structure (ids ↔ titles) ===\n");
        systemPrompt.append("Use these ids with read_story_text(chapter_id, scene_id?). ");
        systemPrompt.append("Human titles are in meta JSON, not in file names — use search_story_structure " +
                "when you need to find a node by title or description.\n");
        try {
            systemPrompt.append(chapterService.buildStoryStructureOverview());
        } catch (IOException e) {
            systemPrompt.append("[Could not read story structure]\n");
        }
        systemPrompt.append("\n");

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

        // Include active file — always read fresh from disk so the AI sees the current state
        String activeFile = request.getActiveFile();
        if (activeFile != null && !activeFile.isBlank() && !seen.contains(activeFile)) {
            try {
                if (fileService.fileExists(activeFile)) {
                    String content = fileService.readFile(activeFile);
                    systemPrompt.append("=== Active File: ").append(activeFile).append(" ===\n");
                    systemPrompt.append(content).append("\n\n");
                    includedFiles.add(activeFile);
                    if (activeFile.endsWith(".json") && activeFile.contains(".project/chapter/")) {
                        appendFieldUpdateInstructions(systemPrompt);
                    }
                }
            } catch (IOException e) {
                systemPrompt.append("=== Active File: ").append(activeFile).append(" [read error] ===\n\n");
            }
        }

        // Focused field — tells the AI which single field the user is actively editing
        String activeFieldKey = request.getActiveFieldKey();
        if (activeFieldKey != null && !activeFieldKey.isBlank()) {
            systemPrompt.append("=== Focused Field ===\n");
            systemPrompt.append("The user has opened the dedicated editor for the field `").append(activeFieldKey)
                    .append("`. They are working EXCLUSIVELY on this field.\n\n");
            systemPrompt.append("**Your job:** Help the user write, rewrite, or improve the content for `")
                    .append(activeFieldKey).append("` only.\n\n");
            systemPrompt.append("**How to propose a value:** You MUST use a `field-update` fenced code block — the language tag must be exactly `field-update`. No exceptions:\n\n");
            systemPrompt.append("```field-update\n");
            systemPrompt.append("{\"field\": \"").append(activeFieldKey).append("\", \"value\": \"your proposed text here\"}\n");
            systemPrompt.append("```\n\n");
            systemPrompt.append("⚠️ CRITICAL: The language tag on the code fence must be `field-update` (not `json`, not blank, not anything else). ");
            systemPrompt.append("If you write the JSON as plain text, inline code, or a code block with any other tag, ");
            systemPrompt.append("the user will see the raw text but will have NO button to apply it — they cannot insert it into their document. ");
            systemPrompt.append("The `field-update` code block is the ONLY way to give the user an interactive 'Anwenden' (Apply) button.\n\n");
            systemPrompt.append("Rules:\n");
            systemPrompt.append("- The entire JSON must be on a single line inside the code block (one line = one JSON object).\n");
            systemPrompt.append("- Use `\\n` for line breaks inside the JSON string value (e.g. `\"value\": \"Line 1\\nLine 2\\nLine 3\"`).\n");
            systemPrompt.append("- Do NOT use pretty-printed / multi-line JSON — keep the whole object on one line.\n");
            systemPrompt.append("- Do NOT use `replace` blocks or propose changes to any other field.\n");
            systemPrompt.append("- You may discuss, ask questions, or offer alternatives in plain text before or after the block.\n\n");
        }

        // Tool usage instructions
        systemPrompt.append("=== Available Tools ===\n");
        systemPrompt.append("You have access to tools for project files and the project wiki:\n\n");
        systemPrompt.append("**Wiki (characters, locations, organizations, world-building):**\n");
        systemPrompt.append("- wiki_search(query, type?, limit?): Search the project wiki for entries. " +
                "Returns compact hit list with IDs.\n");
        systemPrompt.append("- wiki_read(id): Read the full content of a wiki entry by id (format: typeId/entryId, e.g. character/mara-voss).\n\n");
        systemPrompt.append("**Wiki lookup strategy:**\n");
        systemPrompt.append("1) If referenced story/scene JSON or markdown contains a wiki link or id in the form " +
                "`typeId/entryId` (e.g. markdown `@[Name](charakter/slug)` or `@@[Name](charakter/slug)`), " +
                "call **wiki_read** with that exact id first. Those paths are authoritative; do not skip lookup " +
                "just because wiki_search by display name returned nothing.\n");
        systemPrompt.append("2) wiki_search matches **substrings** only on entry ids and field values. " +
                "Hyphenated ids (e.g. `lupus-regina`) do **not** match the query `lupusregina`. " +
                "Underscores in a label (e.g. `Beobachter_A`) do not match a slug `beobachter-a`. " +
                "If the full name fails, retry with shorter tokens (e.g. `lupus`, `regina`, `beobachter`) " +
                "or obvious hyphen/underscore variants.\n");
        systemPrompt.append("3) The optional `type` filter matches the wiki **type id or type display name** as substring. " +
                "If a filtered search returns no hits, repeat **without** `type` or try the actual type id from the project " +
                "(German vs English names differ, e.g. `charakter` vs `character`).\n");
        systemPrompt.append("4) After wiki_search returns ids, use wiki_read for entities you rely on in your answer.\n\n");
        systemPrompt.append("**IMPORTANT:** For named entities, prefer the steps above over guessing. " +
                "If the user or attached content names a character, place, or organization, look it up in the wiki " +
                "before asserting facts. Use wiki_read to get full details when needed.\n\n");
        systemPrompt.append("**Project files & story:**\n");
        systemPrompt.append("- search_story_structure(query): Find chapters, scenes, or actions by **title/description** " +
                "in meta JSON (not by opaque ids like chapter_1). Returns ids and paths for read_file / read_story_text.\n");
        systemPrompt.append("- search_project(query): Search files/folders by **path and file name** only. " +
                "For human story titles, prefer search_story_structure.\n");
        systemPrompt.append("- read_file(path): Read the full content of a project file. " +
                "Use after searching to inspect relevant files.\n");
        systemPrompt.append("- read_story_text(chapter_id, scene_id?): Read the combined prose text " +
                "of all actions in a scene (if scene_id given) or an entire chapter. " +
                "Use this to read what has actually been written in the story.\n\n");

        // Editor selection replacement capability
        systemPrompt.append("=== Editor Selection Replacement ===\n");
        systemPrompt.append("If the user's message contains a [REFERENCED SELECTION] ... [END SELECTION] block, ");
        systemPrompt.append("they have highlighted text in their editor and may want you to propose a replacement.\n");
        systemPrompt.append("To offer a replacement, include a fenced code block with the language tag `replace`:\n\n");
        systemPrompt.append("```replace\n");
        systemPrompt.append("your proposed replacement text here\n");
        systemPrompt.append("```\n\n");
        systemPrompt.append("Only use a `replace` block when you are explicitly proposing a text replacement for the ");
        systemPrompt.append("highlighted selection. The user will see a one-click 'Replace' button in the chat.\n");
        systemPrompt.append("You may include multiple `replace` blocks if you want to offer alternatives.\n\n");

        // Clarification questions via multiple-choice
        systemPrompt.append("=== Clarification Questions ===\n");
        systemPrompt.append("When you genuinely need more information before you can give a good answer, you may ask ");
        systemPrompt.append("a clarification question by including exactly one fenced code block with the language tag `clarification`.\n");
        systemPrompt.append("The block must contain a single JSON object on one line with these fields:\n");
        systemPrompt.append("  - \"question\": the question text (string)\n");
        systemPrompt.append("  - \"options\": an array of 2–5 short answer options (strings)\n\n");
        systemPrompt.append("Example:\n");
        systemPrompt.append("```clarification\n");
        systemPrompt.append("{\"question\": \"Welchen Ansatz bevorzugst du?\", \"options\": [\"Ansatz A\", \"Ansatz B\", \"Ich bin offen\"]}\n");
        systemPrompt.append("```\n\n");
        systemPrompt.append("The user will see the options as clickable buttons and can select one with a single click.\n");
        systemPrompt.append("Use this sparingly — only when the ambiguity would lead to a significantly wrong or wasted answer.\n");
        systemPrompt.append("Do NOT use it for simple tasks where a reasonable assumption can be made.\n\n");

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

    private void appendFieldUpdateInstructions(StringBuilder systemPrompt) {
        systemPrompt.append("=== Scene Field Updates ===\n");
        systemPrompt.append("The active file above is a scene meta file (szene.json). ");
        systemPrompt.append("When you want to propose a value for a specific scene field, use a `field-update` code block:\n\n");
        systemPrompt.append("```field-update\n");
        systemPrompt.append("{\"field\": \"FIELD_KEY\", \"value\": \"proposed value\"}\n");
        systemPrompt.append("```\n\n");
        systemPrompt.append("Standard field keys:\n");
        systemPrompt.append("- title: Titel der Szene\n");
        systemPrompt.append("- description: Kurzbeschreibung\n");
        systemPrompt.append("- location: Ort / Schauplatz\n");
        systemPrompt.append("- time: Zeitpunkt oder Tageszeit\n");
        systemPrompt.append("- characters: Beteiligte Charaktere\n");
        systemPrompt.append("- initial_situation: Ausgangssituation — was ist die Lage zu Beginn der Szene?\n");
        systemPrompt.append("- goal: Ziel der Szene — was will der Protagonist erreichen?\n");
        systemPrompt.append("- outcome: Ergebnis — wie endet die Szene?\n");
        systemPrompt.append("- pov: POV-Charakter (Erzählperspektive)\n");
        systemPrompt.append("- tone: Stimmung / Atmosphäre\n");
        systemPrompt.append("Any key found under `extras` in the JSON above (e.g. beats, conflict, subtext, …) ");
        systemPrompt.append("is also a valid field key — use it exactly as it appears in the JSON.\n\n");
        systemPrompt.append("Only use `field-update` blocks when you are explicitly proposing a value to be saved. ");
        systemPrompt.append("The language tag must be exactly `field-update` — not `json`, not blank. ");
        systemPrompt.append("Use `\\n` for line breaks inside the JSON string value. ");
        systemPrompt.append("Keep the JSON on a single line inside the block. ");
        systemPrompt.append("If you write JSON as plain text or with any other code-block tag, ");
        systemPrompt.append("the user gets no Apply button and cannot insert the value. ");
        systemPrompt.append("For discussion or multiple alternatives, use plain text.\n\n");
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
