import { getAppBridge } from "../../electron/bridge.ts";
import { useTopBarSlot, useTopBarBg } from "./TopBarContext.ts";

export function TopBar() {
  const slot = useTopBarSlot();
  const bg = useTopBarBg();
  return (
    <div className="top-bar">
      <div className="top-bar-slot">{slot}</div>
      <div
        className="window-controls-bar"
        style={bg ? { backgroundColor: bg } : undefined}
      >
        <button
          type="button"
          className="window-control window-control--minimize"
          aria-label="Minimieren"
          title="Minimieren"
          onClick={() => void getAppBridge()?.window?.minimize()}
        >
          &#x2212;
        </button>
        <button
          type="button"
          className="window-control window-control--close"
          aria-label="Schließen"
          title="Schließen"
          onClick={() => void getAppBridge()?.window?.close()}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
