package com.assistant.service.tools;

import com.assistant.service.GlossaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * AI tool that appends a new term and definition to the project glossary
 * (.assistant/glossary.md). The glossary is automatically included in every
 * chat context, so terms added here will be available in future conversations.
 */
@Component
public class GlossaryAddTool extends AbstractTool {

    private static final Logger log = LoggerFactory.getLogger(GlossaryAddTool.class);

    private final GlossaryService glossaryService;

    public GlossaryAddTool(GlossaryService glossaryService) {
        this.glossaryService = glossaryService;
    }

    @Override
    public String getName() {
        return "glossary_add";
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Add a new term and its definition to the project glossary " +
                        "(.assistant/glossary.md). The glossary is included in every AI chat context, " +
                        "so the term will be available in future conversations. " +
                        "Use this when you recognize a recurring concept, character name, or project-specific term " +
                        "that should be remembered for future sessions.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "term", Map.of(
                            "type", "string",
                            "description", "The term or concept to add (e.g. 'TeamA', 'Lupusregina Beta')"
                        ),
                        "definition", Map.of(
                            "type", "string",
                            "description", "A concise definition or description of the term"
                        )
                    ),
                    "required", List.of("term", "definition")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String term = extractArg(argsJson, "term");
        String definition = extractArg(argsJson, "definition");

        if (term == null || term.isBlank()) {
            return "Error: missing 'term' parameter";
        }
        if (definition == null || definition.isBlank()) {
            return "Error: missing 'definition' parameter";
        }

        log.trace("Received request to execute glossary_add for term: {}", term);
        try {
            glossaryService.addEntry(term, definition);
            log.trace("Finished successfully glossary_add for term: {}", term);
            return "glossary_add:success:" + term.trim();
        } catch (IOException e) {
            log.error("Error adding glossary entry: {}", term, e);
            return "Error adding glossary entry: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        String term = extractArg(argsJson, "term");
        return "Adding glossary entry: " + (term != null ? term : "unknown");
    }
}
