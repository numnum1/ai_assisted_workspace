package com.assistant.meta_files;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

@JsonIgnoreProperties(ignoreUnknown = true)
@Getter
@Setter
public class SubprojectConfig {

    @Setter(AccessLevel.NONE)
    private String type = "";
    @Setter(AccessLevel.NONE)
    private String name = "";

    public void setType(String type) {
        this.type = type != null ? type : "";
    }

    public void setName(String name) {
        this.name = name != null ? name : "";
    }
}
