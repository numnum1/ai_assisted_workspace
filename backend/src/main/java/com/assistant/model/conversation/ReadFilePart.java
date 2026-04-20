package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class ReadFilePart extends ToolCallPart {

    private String file;

    public ReadFilePart() {}

    public ReadFilePart(String toolCallId, String file) {
        setToolCallId(toolCallId);
        this.file = file;
    }

    public String getFile() {
        return file;
    }

    public void setFile(String file) {
        this.file = file;
    }
}
