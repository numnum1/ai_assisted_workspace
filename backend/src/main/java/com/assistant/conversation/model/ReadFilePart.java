package com.assistant.conversation.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
@NoArgsConstructor
public class ReadFilePart extends ToolCallPart {

    private String file;

    public ReadFilePart(String toolCallId, String file) {
        setToolCallId(toolCallId);
        this.file = file;
    }
}
