import { useCallback, useContext, useMemo } from "react";
import type { ChatViewModel } from "../../../chat-view-model";
import ChatContext from "../../../chat-context";
import type { Toolkit } from "../../../../tools/toolkit";

export function ToolkitEntry({ id, label, icon: Icon }: Toolkit) {
  const {
    settings: { enabledToolkitIds },
    enableToolById,
    disableToolById,
  } = useContext<ChatViewModel>(ChatContext);

  const toggleToolById = useCallback(() => {
    if (enabledToolkitIds.includes(id)) {
      disableToolById(id);
    } else {
      enableToolById(id);
    }
  }, [enabledToolkitIds, id, enableToolById, disableToolById]);

  const enabled = useMemo(() => {
    return enabledToolkitIds.includes(id);
  }, [enabledToolkitIds, id]);

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
