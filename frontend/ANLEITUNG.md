# Anleitung

Bedienungsanleitung für Navi — den KI-Berater-Chat für Einzelhändler.

Diese Anleitung wächst mit dem Programm. Aktuell enthalten:

- [Profile](#profile)

---

## Profile

Ein **Profil** enthält die komplette Konfiguration von Navi:

| Bereich | Was darin steckt |
|---|---|
| Phasen | Die Gesprächsphasen: Reihenfolge, Anweisungen, Checklisten, Übergänge |
| Persona | Rollenbeschreibung und Verhaltensregeln von Navi |
| Hinweise | Optionale Tipps, die Navi im Gespräch einstreuen soll |
| Wissensbasis | Use-Cases und die dazugehörigen Tools |

Profile erlauben es, mehrere Varianten dieser Konfiguration nebeneinander zu haben, zwischen ihnen umzuschalten und sie als Datei an andere weiterzugeben.

Die Einstellungen für das Verbesserungs-LLM (API-URL, Modell, API-Key) gehören **nicht** zum Profil. Sie gelten programmweit und werden deshalb auch nicht mitexportiert — so landet dein API-Key nie in einer Datei, die du weitergibst.

### Wo finde ich die Profile?

Ganz oben im Navi-Panel (rechte Seitenleiste) steht die Profilleiste: links das Dropdown mit dem aktuell verwendeten Profil, rechts daneben die Schaltflächen.

| Symbol | Funktion |
|---|---|
| ➕ | Neues Profil auf Basis der Standardeinstellungen |
| ⧉ | Aktuelles Profil duplizieren |
| ✏️ | Aktuelles Profil umbenennen |
| 🗑️ | Aktuelles Profil löschen |
| ⬇️ | Aktuelles Profil in eine Datei exportieren |
| ⬆️ | Profil aus einer Datei importieren |

### Das Standardprofil „Marc"

„Marc" ist das mitgelieferte Profil und **schreibgeschützt** — erkennbar am Schloss-Symbol neben dem Dropdown. Es enthält immer exakt die Auslieferungseinstellungen und lässt sich weder ändern, noch umbenennen, noch löschen.

Damit hast du jederzeit einen sauberen Ausgangspunkt, zu dem du zurückkehren kannst: einfach „Marc" im Dropdown auswählen.

Du kannst trotzdem in den Editor gehen und dort etwas ausprobieren, während „Marc" aktiv ist. **Beim Speichern** legt das Programm dann automatisch ein neues Profil namens „Marc (Kopie)" an, aktiviert es und schreibt deine Änderung dorthin. Ein Hinweistext im Panel sagt dir, dass das passiert ist. Danach kannst du die Kopie über ✏️ sinnvoll umbenennen.

### Ein Profil anlegen

Es gibt zwei Wege:

**Von den Standardeinstellungen aus** — ➕ anklicken. Im Eingabefeld steht bereits „Neues Profil"; überschreibe es mit einem eigenen Namen und bestätige mit ✓ oder der Eingabetaste. Abbrechen geht über ✕ oder die Escape-Taste. Das neue Profil startet mit den Auslieferungseinstellungen und ist sofort aktiv.

**Als Kopie des aktuellen Profils** — ⧉ anklicken. Vorgeschlagen wird „<aktueller Name> (Kopie)". Das neue Profil übernimmt alle Einstellungen des aktuellen und ist danach aktiv. Das ist der richtige Weg, wenn du eine funktionierende Konfiguration als Basis für eine Variante nehmen willst.

Ist der Name schon vergeben, hängt das Programm automatisch „(2)", „(3)" usw. an.

### Ein Profil bearbeiten

1. Stelle im Dropdown das Profil ein, das du ändern willst.
2. Klicke im Panel auf **Bearbeiten**.
3. Wähle den passenden Reiter: *Phasen*, *Persona*, *Hinweise*, *Wissensbasis* oder *Verbesserungs-LLM*.
4. Nimm die Änderungen vor und klicke unten auf den Speichern-Knopf des Bereichs — zum Beispiel **Phasen speichern**.

Wichtig: **Jeder Bereich wird einzeln gespeichert.** Der Reiter *Wissensbasis* hat sogar zwei getrennte Knöpfe, *Use-Cases speichern* und *Tools speichern*. Wenn du an mehreren Stellen etwas änderst, musst du entsprechend mehrfach speichern; ein Reiterwechsel speichert nicht automatisch.

Der Knopf **Standard** setzt nur den jeweiligen Bereich des aktuellen Profils auf die Auslieferungswerte zurück — alle anderen bleiben unberührt. Bei „Marc" hat er keine Wirkung, weil dessen Inhalt bereits der Standard ist.

Wenn eine Eingabe nicht plausibel ist (zum Beispiel eine doppelte Phasen-ID oder ein Übergang, der ins Leere zeigt), lehnt das Programm das Speichern mit einer Fehlermeldung ab und ändert nichts.

### Ein Profil wechseln

Einfach im Dropdown ein anderes Profil auswählen. Die Konfiguration wird sofort neu geladen und gilt ab dem nächsten Chat-Turn.

Bereits laufende Gespräche behalten ihre bisherigen Antworten; sie arbeiten ab dem Wechsel aber mit dem neuen Profil weiter. Für einen sauberen Vergleich zweier Profile solltest du also jeweils ein neues Gespräch starten.

### Ein Profil löschen

🗑️ anklicken und die Rückfrage bestätigen. Das Löschen lässt sich **nicht rückgängig machen** — exportiere das Profil vorher, wenn du unsicher bist. Nach dem Löschen schaltet das Programm auf „Marc" zurück.

### Ein Profil exportieren

1. Das gewünschte Profil im Dropdown auswählen.
2. ⬇️ anklicken.
3. Im Speichern-Dialog Ordner und Dateinamen wählen. Vorgeschlagen wird `navi-profil-<name>.json`.

Herauskommt eine einzelne JSON-Datei mit allen vier Konfigurationsbereichen. Die kannst du per Mail, Chat oder USB-Stick weitergeben — sie enthält keine Zugangsdaten und keine Gesprächsinhalte.

### Ein Profil importieren

1. ⬆️ anklicken.
2. Die `.json`-Datei im Öffnen-Dialog auswählen.

Der Import legt immer ein **neues** Profil an und aktiviert es. Bestehende Profile werden nie überschrieben. Trägt das importierte Profil einen Namen, den es schon gibt, bekommt es automatisch eine Nummer angehängt.

Vor dem Anlegen prüft das Programm die Datei vollständig. Ist sie beschädigt, keine Navi-Profildatei oder enthält sie eine unstimmige Konfiguration, erscheint eine Fehlermeldung und es wird nichts angelegt.

### Wo liegen die Profile?

Auf der Festplatte unter:

```
C:\Users\<benutzer>\.writing-assistant\navi\
  profiles.json          ← Liste der Profile + welches aktiv ist
  profiles\<id>\         ← ein Ordner pro Profil
```

Das Standardprofil „Marc" hat bewusst keinen Ordner — es steckt fest im Programm und kann darum gar nicht verändert werden.

Vor jedem Überschreiben legt das Programm zusätzlich eine Sicherungskopie unter `navi\backups\` ab. Falls einmal etwas schiefgeht, lässt sich von dort per Hand zurückkopieren.

### Häufige Fragen

**Ich habe etwas geändert, aber Navi verhält sich unverändert.**
Vermutlich wurde der Reiter nicht gespeichert — jeder Reiter hat seinen eigenen Speichern-Knopf. Prüfe außerdem im Dropdown, ob wirklich das Profil aktiv ist, das du bearbeitet hast.

**Ich habe aus Versehen „Marc" bearbeitet.**
Das kann nicht passieren. Deine Änderung ist beim Speichern in einer Kopie gelandet, die im Dropdown steht. „Marc" ist unverändert.

**Ich möchte alles auf Anfang zurücksetzen.**
Wähle „Marc" im Dropdown. Deine eigenen Profile bleiben dabei erhalten und du kannst jederzeit zurückwechseln.
