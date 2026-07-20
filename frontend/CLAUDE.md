*DO NOT START LOCAL WEB SERVER*. This will never work because of Bridge.

## Projektkontext

Dieses Repo ist ein Fork eines Buchschreib-/Markdown-Editor-Tools. Das einzige aktuell relevante Feature ist **Navi**, ein KI-Berater-Chat für Einzelhändler (ehrliche Beratung auf Ist-Zustand-Basis, kein Tool-Verkauf). Wiki/Glossar/Persona-Infrastruktur im Code ist größtenteils Altlast aus dem Buchschreib-Tool, wird aber teilweise für simulierte Händler-Personas in der Navi-Simulation weiterverwendet.

Vollständige Architekturdoku: [docs/navi.md](docs/navi.md).

### Architektur auf einen Blick

- **Kein separates Backend.** Navi läuft im Electron-Main-Prozess (`electron/`); der Renderer (React) kommuniziert per IPC. LLM-Calls gehen direkt an einen OpenAI-kompatiblen `/v1/chat/completions`-Endpoint (Provider-Config unter `~/.writing-assistant/ai-providers.json`).
- **Kernlogik:** `electron/services/conversation/naviChat.ts` (Turn-Loop mit stillen Tools `update_facts`/`advance_phase` + sichtbaren Antwort-Tools), `electron/services/naviVoice.ts` (Persona/Stimme), `src/naviStateMachine.ts` (State-Definitionen), `electron/services/naviKnowledgeBase.ts` (Use-Cases/Tools für Advisory-States).
- **State Machine:** 8 States (`greeting` → … → `closing`), deterministisches Slot-Gate, ein Redirect-Klassifizierer prüft nur Ausnahme-Übergänge.
- **Datenmodell:** `NaviFacts` (in `src/types.ts`) ist die zentrale Wahrheitsquelle (Slots, `currentProblem`, `hypothesis`, `recommendation`, …), vom Modell selbst per Tool-Call gepflegt.
- **Persistenz-Split:** Chat-Konversationen sind flüchtig/renderer-seitig (localStorage). Navi-**Konfiguration** (States, Tips, Persona) ist dateibasiert unter `~/.writing-assistant/navi/*.json` persistent (`naviStateConfigService.ts`).