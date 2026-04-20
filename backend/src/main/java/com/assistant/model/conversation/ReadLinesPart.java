package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ReadLinesPart extends ReadFilePart {

    private int startLine;
    private int endLine;

    public ReadLinesPart() {}

    public ReadLinesPart(String toolCallId, String file, int startLine, int endLine) {
        super(toolCallId, file);
        this.startLine = startLine;
        this.endLine = endLine;
    }

    public int getStartLine() {
        return startLine;
    }

    public void setStartLine(int startLine) {
        this.startLine = startLine;
    }

    public int getEndLine() {
        return endLine;
    }

    public void setEndLine(int endLine) {
        this.endLine = endLine;
    }
}
