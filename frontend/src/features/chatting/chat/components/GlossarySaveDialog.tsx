export interface GlossarySaveDialogProps {
  glossaryForm: { term: string; definition: string } | null;
  setGlossaryForm: (v: { term: string; definition: string } | null) => void;
  glossaryPopup: { x: number; y: number; selectedText: string } | null;
  setGlossaryPopup: (v: { x: number; y: number; selectedText: string } | null) => void;
  glossarySaving: boolean;
  setGlossarySaving: (v: boolean) => void;
  disabledToolkits: Set<string>;
}

export function GlossarySaveDialog({
  glossaryForm,
  setGlossaryForm,
  glossaryPopup,
  setGlossaryPopup,
  glossarySaving,
  setGlossarySaving,
  disabledToolkits,
}: GlossarySaveDialogProps) {
  if (!glossaryForm || disabledToolkits.has("glossary")) return null;

  const handleCancel = () => {
    setGlossaryForm(null);
    setGlossaryPopup(null);
  };

  const handleSave = () => {
    setGlossarySaving(true);
    setTimeout(() => {
      setGlossarySaving(false);
      setGlossaryForm(null);
      setGlossaryPopup(null);
    }, 500);
  };

  return (
    <div
      className="glossary-save-overlay"
      onClick={handleCancel}
    >
      <div
        className="glossary-save-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glossary-save-title">
          Glossar-Eintrag speichern
        </div>
        <label className="glossary-save-label">
          Begriff
          <input
            className="glossary-save-input"
            value={glossaryForm.term}
            onChange={(e) =>
              setGlossaryForm({ ...glossaryForm, term: e.target.value })
            }
            autoFocus
          />
        </label>
        <label className="glossary-save-label">
          Definition
          <textarea
            className="glossary-save-textarea"
            value={glossaryForm.definition}
            onChange={(e) =>
              setGlossaryForm({
                ...glossaryForm,
                definition: e.target.value,
              })
            }
            rows={3}
            placeholder="Kurze Erklärung..."
          />
        </label>
        <div className="glossary-save-actions">
          <button className="glossary-save-cancel" onClick={handleCancel}>
            Abbrechen
          </button>
          <button
            className="glossary-save-confirm"
            disabled={
              !glossaryForm.term.trim() ||
              !glossaryForm.definition.trim() ||
              glossarySaving
            }
            onClick={handleSave}
          >
            {glossarySaving ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
