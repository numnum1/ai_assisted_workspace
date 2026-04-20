package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
@NoArgsConstructor
public class ReadLinesPart extends ReadFilePart {

    private int startLine;
    private int endLine;

    public ReadLinesPart(String toolCallId, String file, int startLine, int endLine) {
        super(toolCallId, file);
        this.startLine = startLine;
        this.endLine = endLine;
    }
}
