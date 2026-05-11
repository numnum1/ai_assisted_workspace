export interface GlossaryPopupProps {
  glossaryPopup: { x: number; y: number; selectedText: string } | null;
  glossaryForm: { term: string; definition: string } | null;
  disabledToolkits: Set<string>;
  setGlossaryForm: (v: { term: string; definition: string } | null) => void;
}

export function GlossaryPopup({
  glossaryPopup,
  glossaryForm,
  disabledToolkits,
  setGlossaryForm,
}: GlossaryPopupProps) {
  if (!glossaryPopup || glossaryForm || disabledToolkits.has("glossary")) {
    return null;
  }

  return (
    <div
      className="glossary-selection-popup"
      style={{ left: glossaryPopup.x, top: glossaryPopup.y }}
    >
      <button
        className="glossary-selection-btn"
        onMouseDown={(e) => {
          e.preventDefault();
          setGlossaryForm({
            term: glossaryPopup.selectedText,
            definition: "",
          });
        }}
      >
        📖 Als Glossar-Begriff speichern
      </button>
    </div>
  );
}
