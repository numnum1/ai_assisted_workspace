import { useCallback, useContext, useMemo } from "react";
import type { ChatViewModel } from "../../chat-view-model";
import ChatContext from "../../chat-context";
import type { Tool } from "../../../toolkit/Tools";

export function ToolkitEntry({ id, label, Icon }: Tool) {
  const {
    settings: { enabledToolIds },
    enableToolById,
    disableToolById,
  } = useContext<ChatViewModel>(ChatContext);

  const toggleToolById = useCallback(() => {
    if (enabledToolIds.includes(id)) {
      disableToolById(id);
    } else {
      enableToolById(id);
    }
  }, [enabledToolIds, id, enableToolById, disableToolById]);

  const enabled = useMemo(() => {
    return enabledToolIds.includes(id);
  }, [enabledToolIds, id]);

  return (
    <>
      <Icon size={14} aria-hidden />
      <span>{label}</span>
      <button
        type="button"
        className={`chat-toolkit-row-toggle${enabled ? " chat-toolkit-row-toggle--on" : ""}`}
        role="menuitem"
        onClick={toggleToolById}
      >
        {enabled ? "An" : "Aus"}
      </button>
    </>
  );
}
