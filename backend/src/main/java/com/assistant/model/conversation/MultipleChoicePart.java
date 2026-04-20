package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
@Getter
@Setter
public class MultipleChoicePart extends MessagePart {

    @Setter(AccessLevel.NONE)
    private List<MultipleChoiceOption> options = new ArrayList<>();
    private boolean hasAlternativeSelected;
    private String alternative;

    public void setOptions(List<MultipleChoiceOption> options) {
        this.options = options != null ? options : new ArrayList<>();
    }
}
