# Ziel: Generische Extra-Panels mit Dropdown-Selektor

## Ausgangslage

Die App hat ein bewährtes 3-Panel-Layout (Outliner | Editor | Chat).
In der Praxis sind meist nur 2 der 3 Panels gleichzeitig geöffnet.
Durch wachsende Features (Threads, State-Machine, Pläne, ...) wird das Chat-Panel überladen.

## Ziel

Zwei optionale Extra-Panels hinzufügen — jeweils ganz links und ganz rechts:

```
[Far-Left] | [Outliner] | [Editor] | [Chat] | [Far-Right]
```

Typische Nutzung: 2 Haupt-Panels + 1 Extra-Panel aktiv → insgesamt ~3 sichtbare Panels.

## UX-Konzept: JetBrains-Style Dropdown

Jedes Extra-Panel hat einen Header mit einem Dropdown-Menü (wie JetBrains Tool Windows).
Der Nutzer wählt selbst welches Tool im jeweiligen Slot angezeigt wird.

**Verfügbare Tools (initial):**
- Threads (Git-ähnliche Gesprächs-Branches)
- Navi State-Machine
- Pläne / Task-Listen
- (erweiterbar für zukünftige Features)

## Technische Umsetzung

- Neue Komponente `PanelSlot` mit:
  - Header + Dropdown zur Tool-Auswahl
  - Dynamisches Rendering des gewählten Tools
  - Persistenz des gewählten Tools in `localStorage`
- Integration in `App.tsx` via `react-resizable-panels` (links + rechts des bestehenden Layouts)
- Panels sind kollabierbar (wie die bestehenden 3 Panels)
- Gleicher Mechanismus könnte später auch auf das Chat-Panel angewendet werden

## Wichtige Prinzipien

- Bestehende 3-Panel-Struktur bleibt unverändert
- Extra-Panels sind rein optional — standardmäßig eingeklappt
- Kein Breaking Change an bestehenden Komponenten
- Neue Features werden einfach als neuer Dropdown-Eintrag ergänzt
