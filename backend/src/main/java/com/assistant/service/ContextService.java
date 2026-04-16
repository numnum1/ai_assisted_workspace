package com.assistant.service;

import com.assistant.config.AppConfig;
import com.assistant.model.AssembledContext;
import com.assistant.model.ChatMessage;
import com.assistant.model.ChatRequest;
import com.assistant.model.Mode;
import com.assistant.service.tools.ToolkitIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.*;


@Service
public class ContextService {

    private static final Logger log = LoggerFactory.getLogger(ContextService.class);

    private final FileService fileService;
    private final ModeService modeService;
    private final ReferenceResolver referenceResolver;
    private final AppConfig appConfig;
    private final ProjectConfigService projectConfigService;
    private final ChapterService chapterService;
    private final GlossaryService glossaryService;

    public ContextService(FileService fileService, ModeService modeService,
                          ReferenceResolver referenceResolver, AppConfig appConfig,
                          ProjectConfigService projectConfigService,
                          ChapterService chapterService,
                          GlossaryService glossaryService) {
        this.fileService = fileService;
        this.modeService = modeService;
        this.referenceResolver = referenceResolver;
        this.appConfig = appConfig;
        this.projectConfigService = projectConfigService;
        this.chapterService = chapterService;
        this.glossaryService = glossaryService;
    }

    public AssembledContext assemble(ChatRequest request) {
        if (request.isQuickChat()) {
            return assembleQuickChat(request);
        }

        log.trace("Received request to assemble context: mode={}, historyTurns={}, referencedFiles={}, activeFile={}",
                request.getMode(),
                request.getHistory() != null ? request.getHistory().size() : 0,
                request.getReferencedFiles(),
                request.getActiveFile());

        AssembledContext context = new AssembledContext();
        List<ChatMessage> messages = new ArrayList<>();
        Set<String> includedFiles = new LinkedHashSet<>();
        List<AssembledContext.ContextBlock> blocks = new ArrayList<>();

        // 1. Build system prompt from mode
        Mode mode = request.getMode() != null
                ? modeService.getMode(request.getMode())
                : modeService.getDefaultMode();
        if (mode == null) {
            mode = modeService.getDefaultMode();
        }

        StringBuilder systemPrompt = new StringBuilder();
        int blockStart = 0;
        systemPrompt.append(mode.getSystemPrompt()).append("\n\n");
        blocks.add(new AssembledContext.ContextBlock("mode", "Mode: " + (mode.getName() != null ? mode.getName() : "default"),
                mode.getSystemPrompt(), (systemPrompt.length() - blockStart) / 4));
        log.debug("System prompt after mode base: {} chars", systemPrompt.length());

        // 2. Inject workspace mode system prompt addition
        if (projectConfigService.hasProjectConfig()) {
            com.assistant.model.WorkspaceModeSchema wsMode = projectConfigService.getWorkspaceModeSchema();
            String addition = wsMode.getSystemPromptAddition();
            if (addition != null && !addition.isBlank()) {
                blockStart = systemPrompt.length();
                systemPrompt.append(addition).append("\n\n");
                blocks.add(new AssembledContext.ContextBlock("workspace-mode", "Workspace Mode",
                        addition, (systemPrompt.length() - blockStart) / 4));
            }
        }

        // 2b. Inject glossary if it exists
        String glossaryContent = glossaryService.readGlossary();
        if (glossaryContent != null && !glossaryContent.isBlank()) {
            blockStart = systemPrompt.length();
            systemPrompt.append("=== Glossary ===\n");
            systemPrompt.append(glossaryContent).append("\n\n");
            blocks.add(new AssembledContext.ContextBlock("glossary", "Glossary (.assistant/glossary.md)",
                    glossaryContent, (systemPrompt.length() - blockStart) / 4));
            log.debug("Injected glossary: {} chars", glossaryContent.length());
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

        blockStart = systemPrompt.length();
        systemPrompt.append("=== Project Structure ===\n");
        StringBuilder storyStructure = new StringBuilder();
        try {
            String structureContent = chapterService.buildStoryStructureOverview();
            systemPrompt.append(structureContent);
            storyStructure.append(structureContent);
        } catch (IOException e) {
            log.warn("Could not read story structure overview", e);
            systemPrompt.append("[Could not read story structure]\n");
        }
        log.debug("System prompt after story structure: {} chars (+{} for story overview)",
                systemPrompt.length(), systemPrompt.length() - blockStart);
        systemPrompt.append("\n");
        blocks.add(new AssembledContext.ContextBlock("structure", "Project Structure",
                storyStructure.toString(), (systemPrompt.length() - blockStart) / 4));

        // Build project file listing
        blockStart = systemPrompt.length();
        systemPrompt.append("=== Project Files ===\n");
        StringBuilder fileTreeContent = new StringBuilder();
        try {
            var tree = fileService.getFileTree();
            appendTreeListing(systemPrompt, tree, "");
            appendTreeListing(fileTreeContent, tree, "");
        } catch (IOException e) {
            log.warn("Could not read project file tree", e);
            systemPrompt.append("[Could not read project structure]\n");
        }
        log.debug("System prompt after file tree: {} chars (+{} for tree)",
                systemPrompt.length(), systemPrompt.length() - blockStart);
        systemPrompt.append("\n");
        blocks.add(new AssembledContext.ContextBlock("file-tree", "Project Files (tree)",
                fileTreeContent.toString(), (systemPrompt.length() - blockStart) / 4));

        // Include always-included files
        log.debug("Always-include files to inject: {}", seen);
        for (String filePath : seen) {
            try {
                if (fileService.fileExists(filePath)) {
                    blockStart = systemPrompt.length();
                    String content = fileService.readFile(filePath);
                    systemPrompt.append("=== ").append(filePath).append(" ===\n");
                    systemPrompt.append(content).append("\n\n");
                    includedFiles.add(filePath);
                    blocks.add(new AssembledContext.ContextBlock("file", filePath, content, (systemPrompt.length() - blockStart) / 4));
                    log.debug("Injected always-include file '{}': {} chars", filePath, systemPrompt.length() - blockStart);
                } else {
                    log.debug("Always-include file '{}' not found, skipping", filePath);
                }
            } catch (IOException e) {
                log.warn("Failed to read always-include file '{}'", filePath, e);
                systemPrompt.append("=== ").append(filePath).append(" [read error] ===\n\n");
            }
        }

        // Active file content: only when the user opened a dedicated meta field editor (activeFieldKey).
        // Otherwise do not attach the passively open tab — use @-references or read_file.
        String activeFieldKey = request.getActiveFieldKey();
        boolean focusedMetaField = activeFieldKey != null && !activeFieldKey.isBlank();
        String activeFile = request.getActiveFile();
        if (focusedMetaField && activeFile != null && !activeFile.isBlank() && !seen.contains(activeFile)) {
            try {
                if (fileService.fileExists(activeFile)) {
                    blockStart = systemPrompt.length();
                    String content = fileService.readFile(activeFile);
                    systemPrompt.append("=== Active File: ").append(activeFile).append(" ===\n");
                    systemPrompt.append(content).append("\n\n");
                    includedFiles.add(activeFile);
                    blocks.add(new AssembledContext.ContextBlock("active-file", "Active File: " + activeFile, content, (systemPrompt.length() - blockStart) / 4));
                    log.debug("Injected active file for focused field '{}': path={}, {} chars", activeFieldKey, activeFile, systemPrompt.length() - blockStart);
                    if (activeFile.endsWith(".json") && activeFile.contains(".project/chapter/")) {
                        appendFieldUpdateInstructions(systemPrompt);
                    }
                } else {
                    log.debug("Active file '{}' not found on disk (focused field), skipping content injection", activeFile);
                }
            } catch (IOException e) {
                log.warn("Failed to read active file '{}'", activeFile, e);
                systemPrompt.append("=== Active File: ").append(activeFile).append(" [read error] ===\n\n");
            }
        } else if (!focusedMetaField && activeFile != null && !activeFile.isBlank()) {
            log.debug("Skipping automatic active-file context injection for path={} (no focused meta field)", activeFile);
        }

        // Focused field — tells the AI which single field the user is actively editing
        if (focusedMetaField) {
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

        Set<String> disabledKits = disabledToolkitSet(request);
        boolean wikiToolsOn = !disabledKits.contains(ToolkitIds.WIKI);
        boolean filesystemToolsOn = !disabledKits.contains(ToolkitIds.DATEISYSTEM);
        boolean assistantToolsOn = !disabledKits.contains(ToolkitIds.ASSISTANT);

        // Tool usage instructions (omitted when client disables tools — API must not advertise unavailable tools)
        if (!request.isDisableTools()) {
            if (wikiToolsOn || filesystemToolsOn || assistantToolsOn) {
                systemPrompt.append("=== Available Tools ===\n");
                systemPrompt.append("You have access to these tools as enabled for this session:\n\n");
                if (wikiToolsOn) {
                    systemPrompt.append("**Wiki (characters, locations, organizations, world-building):**\n");
                    systemPrompt.append("Wiki entries are **Markdown files (`.md`)** stored under `wiki/` at the project root.\n");
                    systemPrompt.append("There are no JSON wiki files — always use `.md` when creating or updating a wiki entry.\n");
                    systemPrompt.append("Example path for a new character entry: `wiki/characters/lupusregina.md`\n\n");
                    systemPrompt.append("- wiki_search(query, limit?): Search the project wiki under `wiki/` for entries by text. " +
                            "Returns matching file paths and a snippet.\n");
                    systemPrompt.append("- wiki_read(path): Read the full content of a wiki file by its path relative to the project root " +
                            "(e.g. `wiki/characters/lupusregina.md`).\n\n");
                }
                if (filesystemToolsOn) {
                    systemPrompt.append("**Project files:**\n");
                    systemPrompt.append("- search_project(query): Search files/folders by **path and file name**.\n");
                    systemPrompt.append("- read_file(path): Read the full content of any project file by relative path.\n\n");
                    systemPrompt.append("**File Writing:**\n");
                    systemPrompt.append("- write_file(path, content, description): Write (create or overwrite) a project file. " +
                            "Saves a revert snapshot automatically. Always provide the complete file content.\n");
                    systemPrompt.append("  - Wiki entries → `wiki/<subfolder>/<name>.md` (Markdown, **never** JSON)\n");
                    systemPrompt.append("  - The 'description' parameter is a short human-readable summary of what was changed and why.\n\n");
                }
                if (assistantToolsOn) {
                    systemPrompt.append("**Glossary:**\n");
                    systemPrompt.append("- glossary_add(term, definition): Add a new term and definition to the project glossary " +
                            "(.assistant/glossary.md). The glossary is always included in context — use this when you recognize a " +
                            "recurring concept or project-specific term worth remembering.\n\n");
                }
            }
        }

        if (GuidedSessionPrompts.isGuidedSession(request)) {
            blockStart = systemPrompt.length();
            String guided = GuidedSessionPrompts.guidedBehaviourBlock();
            systemPrompt.append(guided);
            blocks.add(new AssembledContext.ContextBlock("guided-instructions", "Guided session (AI-led)",
                    guided, (systemPrompt.length() - blockStart) / 4));
            log.debug("Injected guided session instructions: {} chars", guided.length());
            String planSection = GuidedSessionPrompts.steeringPlanSection(request.getSteeringPlan());
            if (!planSection.isEmpty()) {
                blockStart = systemPrompt.length();
                systemPrompt.append(planSection);
                blocks.add(new AssembledContext.ContextBlock("steering-plan", "Aktueller Gesprächsplan",
                        planSection.trim(), (systemPrompt.length() - blockStart) / 4));
                log.debug("Injected steering plan: {} chars", planSection.length());
            }
        }

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

        // Clarification questions via tool call (only when ask_clarification is available)
        if (!request.isDisableTools() && assistantToolsOn) {
            systemPrompt.append("=== Clarification Questions ===\n");
            systemPrompt.append("When you genuinely need more information before you can give a good answer, call the\n");
            systemPrompt.append("`ask_clarification` tool. Pass a `questions` array — each entry has:\n");
            systemPrompt.append("  - \"question\": the question text (string)\n");
            systemPrompt.append("  - \"options\": an array of 2–5 short answer options (strings)\n");
            systemPrompt.append("  - \"allow_multiple\": true if the user may pick more than one option (optional, default false)\n\n");
            systemPrompt.append("Rules:\n");
            systemPrompt.append("  - Call `ask_clarification` as your ONLY action — write NO other text before or after the tool call.\n");
            systemPrompt.append("  - You may group several related questions into one call (1–3 questions max).\n");
            systemPrompt.append("  - If you intend to offer **two or more fixed answer choices** (multiple choice), you **must** use this tool — "
                    + "do **not** list those choices as bullets, numbers, or separate lines in normal assistant message text.\n");
            if (GuidedSessionPrompts.isGuidedSession(request)) {
                systemPrompt.append("  - **Guided session:** Keep driving the steering plan. Use `ask_clarification` when you need a **discrete choice** "
                        + "(e.g. which topic, problem area, or priority to tackle next; which format; which of a few concrete directions) — not only for "
                        + "**design, modeling, class layout, APIs, or domain structure**. For those technical steps, call it **before** you lock in a concrete structure "
                        + "when the user has not fixed key representation choices (do not silently pick types, enums, or fields that embody an unstated assumption). "
                        + "Offer an \"Egal / du entscheidest\" (or similar) option when useful. "
                        + "Do not use `ask_clarification` to replace plan-driven progress with a vague \"what should we do?\" when the plan already names the next step. "
                        + "After the user answers, continue with a concrete proposal and a full updated `plan` block (unless that turn was clarification-only — see guided instructions).\n");
            } else {
                systemPrompt.append("  - Use this when ambiguity would lead to a wrong or unfocused answer, or whenever you would otherwise show a small fixed set of options — "
                        + "prefer the tool over a prose list so the user gets one-click choices.\n");
                systemPrompt.append("  - Do NOT use it for simple tasks where a reasonable assumption is enough and no real choice is needed.\n");
            }
            systemPrompt.append("  - The user will see the questions as a form with radio buttons or checkboxes and a submit button.\n\n");

            systemPrompt.append("=== Guided thread offer ===\n");
            systemPrompt.append("When a **separate** multi-step workflow would work better as its own **guided** session (binding steering plan), call the\n");
            systemPrompt.append("`propose_guided_thread` tool. Pass `steeringPlanMarkdown`: full markdown for the **initial** plan ");
            systemPrompt.append("(same style as guided plans: e.g. ## Ziel, ## Rahmen, ## Status, ## Vorgehen, ## Nächster Schritt, ## Abschlusskriterien).\n");
            systemPrompt.append("Optional: `threadTitle`, `summary` (one line for the offer card), `modeId` (existing chat mode id), `agentPresetId` (project agent template id).\n");
            systemPrompt.append("Rules:\n");
            systemPrompt.append("  - Call `propose_guided_thread` as your **ONLY** action in the turn — no other assistant text in the same turn.\n");
            systemPrompt.append("  - Do not use this for trivial follow-ups; use it when a branched guided thread genuinely helps the user.\n");
            systemPrompt.append("  - The user will see a card to confirm opening a new guided thread with your plan.\n");
            if (GuidedSessionPrompts.isGuidedSession(request)) {
                systemPrompt.append("  - **Guided session:** Offer only when a **standalone** sub-workflow with a clearly scoped **new** plan makes sense — not for minor continuation of the current plan.\n");
            }
            systemPrompt.append("\n");
        }

        int finalSystemPromptChars = systemPrompt.length();
        int estimatedSystemTokens = finalSystemPromptChars / 4;
        boolean toolInstructionsIncluded =
                !request.isDisableTools() && (wikiToolsOn || filesystemToolsOn || assistantToolsOn);
        log.info(
                "Final system prompt: {} chars (~{} tokens). disableTools={}, disabledToolkits={}, tool instructions block {}",
                finalSystemPromptChars,
                estimatedSystemTokens,
                request.isDisableTools(),
                request.getDisabledToolkits(),
                toolInstructionsIncluded ? "included (partial or full)" : "omitted");
        if (estimatedSystemTokens > 60_000) {
            log.warn(
                    "System prompt is very large (~{} tokens) — this may cause context overflow for models with limited context windows!",
                    estimatedSystemTokens);
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
        context.setContextBlocks(blocks);

        log.trace("Finished successfully assembling context: totalMessages={}, includedFiles={}, estimatedTokens={}",
                messages.size(), includedFiles, context.getEstimatedTokens());
        return context;
    }

    /**
     * Minimal context for Quick Chat: no project files, tree, wiki, or story structure — plain text only.
     */
    private AssembledContext assembleQuickChat(ChatRequest request) {
        int historySize = request.getHistory() != null ? request.getHistory().size() : 0;
        log.trace(
                "Received request to assemble Quick Chat context: historyTurns={}, messageLen={}",
                historySize,
                request.getMessage() != null ? request.getMessage().length() : 0);

        AssembledContext context = new AssembledContext();
        List<ChatMessage> messages = new ArrayList<>();

        boolean quickChatNoTools = request.isDisableTools() || quickChatWebToolkitDisabled(request);
        String systemText = quickChatNoTools
                ? """
                Du bist ein kompakter Hilfs-Assistent (Quick Chat) für kurze, selbstständige Fragen — z. B. Begriffe \
                erklären, Formulierungen vorschlagen oder Fakten erläutern.

                Du hast keinen Zugriff auf das Schreibprojekt, Dateien oder die Projekt-Wiki. Behandle jede Anfrage \
                unabhängig; nimm keine Story-, Manuskript- oder Projektdateien an.

                Du hast keine Tool-Funktionen (keine Websuche). Antworte aus deinem Wissen.

                Antworte auf Deutsch, sachlich und möglichst knapp. Nutze normalen Fließtext — keine Projekt-spezifischen \
                Code-Blöcke (kein field-update, kein replace für Editor-Auswahl). Du kannst bei Bedarf normale \
                Markdown-Formatierung (Listen, Fettdruck) verwenden.
                """
                : """
                Du bist ein kompakter Hilfs-Assistent (Quick Chat) für kurze, selbstständige Fragen — z. B. Begriffe \
                erklären, Formulierungen vorschlagen oder Fakten recherchieren.

                Du hast keinen Zugriff auf das Schreibprojekt, Dateien oder die Projekt-Wiki. Behandle jede Anfrage \
                unabhängig; nimm keine Story-, Manuskript- oder Projektdateien an.

                Wenn aktuelle oder allgemeine Web-Informationen nötig sind, nutze das Tool **web_search** mit einer \
                präzisen Suchanfrage. Wenn keine Websuche verfügbar ist oder nicht nötig, antworte aus deinem Wissen.

                Antworte auf Deutsch, sachlich und möglichst knapp. Nutze normalen Fließtext — keine Projekt-spezifischen \
                Code-Blöcke (kein field-update, kein replace für Editor-Auswahl). Du kannst bei Bedarf normale \
                Markdown-Formatierung (Listen, Fettdruck) verwenden.
                """;

        messages.add(new ChatMessage("system", systemText.trim()));

        if (request.getHistory() != null) {
            for (ChatMessage m : request.getHistory()) {
                if (m == null || m.getRole() == null) {
                    continue;
                }
                String role = m.getRole();
                if ("system".equalsIgnoreCase(role)) {
                    continue;
                }
                if ("user".equals(role) || "assistant".equals(role) || "tool".equals(role)) {
                    messages.add(m);
                }
            }
        }

        String userText = request.getMessage() != null ? request.getMessage() : "";
        messages.add(new ChatMessage("user", userText));

        context.setMessages(messages);
        context.setIncludedFiles(List.of());
        context.setEstimatedTokens(estimateTokens(messages));

        log.info(
                "Quick Chat context assembled: totalMessages={}, estimatedTokens={}, userChars={}, disableTools={}, disabledToolkits={}, quickChatNoWebTools={}",
                messages.size(),
                context.getEstimatedTokens(),
                userText.length(),
                request.isDisableTools(),
                request.getDisabledToolkits(),
                quickChatNoTools);
        log.trace("Finished successfully assembling Quick Chat context");
        return context;
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

    public int estimateTokensForMessages(List<ChatMessage> messages) {
        return estimateTokens(messages);
    }

    private int estimateTokens(List<ChatMessage> messages) {
        int totalChars = messages.stream()
                .mapToInt(m -> m.getContent() != null ? m.getContent().length() : 0)
                .sum();
        return totalChars / 4;
    }

    private static Set<String> disabledToolkitSet(ChatRequest request) {
        Set<String> s = new HashSet<>();
        if (request.getDisabledToolkits() != null) {
            for (String k : request.getDisabledToolkits()) {
                if (k != null && !k.isBlank()) {
                    s.add(k.trim());
                }
            }
        }
        return s;
    }

    private static boolean quickChatWebToolkitDisabled(ChatRequest request) {
        if (request.getDisabledToolkits() == null) {
            return false;
        }
        for (String k : request.getDisabledToolkits()) {
            if (k != null && ToolkitIds.WEB.equals(k.trim())) {
                return true;
            }
        }
        return false;
    }

}
