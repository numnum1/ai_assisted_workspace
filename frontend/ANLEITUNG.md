# Anleitung

Bedienungsanleitung für Navi — den KI-Berater-Chat für Einzelhändler.

Diese Anleitung wächst mit dem Programm. Aktuell enthalten:

- [Was ist das KI-Navi?](#was-ist-das-ki-navi)
- [Die Oberfläche und das erste Gespräch](#die-oberfläche-und-das-erste-gespräch)
- [Profile](#profile)
- [Die Felder im Navi-Editor](#die-felder-im-navi-editor)
- [Selbstverbesserung: aus Feedback lernen](#selbstverbesserung-aus-feedback-lernen)
- [Simulations-Modus](#simulations-modus)
- [Wo liegen meine Daten?](#wo-liegen-meine-daten)
- [Glossar](#glossar)

---

## Was ist das KI-Navi?

### Das Ziel

Das KI-Navi ist ein Chat-Berater für Einzelhändler. Ein Händler beschreibt ein Problem aus seinem Alltag — zu wenig Laufkundschaft, zu viel Zeit in der Kundenkommunikation, unübersichtliches Lager — und Navi arbeitet mit ihm heraus, **ob** Software oder KI dabei überhaupt helfen kann, und wenn ja, **was** konkret.

Der entscheidende Punkt ist das „ob". Navi ist ausdrücklich **kein Verkaufsgespräch**:

- Die Beratung setzt am **Ist-Zustand** an. Erst wird verstanden, was der Händler tatsächlich hat und tut — dann wird empfohlen. Ein Vorschlag, der einen kompletten Umbau voraussetzt, ist meist der falsche.
- **„Das lohnt sich für dich nicht" ist eine gültige Antwort.** Navi darf und soll abraten, wenn ein Problem nicht software-lösbar ist oder der Aufwand nicht zum Nutzen passt.
- Die **Investitionsbereitschaft ist Randbedingung, nicht Verhandlungsmasse.** Navi fragt vor jeder Empfehlung, wie viel Zeit, laufendes Geld und einmaliges Startbudget realistisch drin sind — und schlägt dann bewusst die schlankere Lösung vor, wenn eine der drei Dimensionen eng ist.
- KI wird **nicht aufgedrängt.** Der Hauptpfad des Gesprächs gibt den ehrlichsten Rat, ganz gleich ob er mit KI zu tun hat. Erst wenn der Händler mit der Empfehlung zufrieden ist, fragt Navi **einmalig** nach, ob er sich gezielt KI-Tools ansehen möchte — ein „nein" ändert nichts am bereits gegebenen Rat.

### Wie ein Gespräch abläuft

Navi plaudert nicht frei, sondern arbeitet sich durch feste **Phasen**. Jede Phase hat genau einen Auftrag, und Navi weiß in jedem Moment nur, was für diese eine Phase nötig ist:

```
Begrüßung → Problem erfragen → Problem klären → Software-Stack →
Aufwandbereitschaft → Verständnis bestätigen → Einschätzung →
Empfehlung → (Anpassen) → KI-Erkundung anbieten → (KI-Lösungen) → Abschluss
```

Grob in drei Abschnitten: Navi **fragt** erst (Problem, vorhandene Software, Budget), **fasst zusammen** und lässt sich bestätigen, und **berät** dann (Einschätzung, Empfehlung, Nachschärfen).

Damit Navi nicht vorschnell in den Beratungsmodus springt — der klassische Fehler solcher Assistenten — verlässt sich das Programm auf einen einzigen **festen, vom Programm selbst geprüften Mechanismus**, der nicht vom Wohlwollen des Modells abhängt: das **Slot-Gate**.

Jede Phase mit einer **Checkliste** (z.B. „Problem klären", „Software-Stack") hat einen ersten, festen Übergang in die nächste Phase. Solange auch nur ein Checklisten-Punkt offen ist, lehnt das Programm genau diesen Übergang ab — unabhängig davon, für wie fertig sich das Modell selbst hält. Das gilt für jede Phase mit Checkliste, ohne Ausnahme.

Alle anderen Übergänge — Themenwechsel, „das war ein Missverständnis", „Händler ist zufrieden" — entscheidet Navi selbst, direkt in derselben Antwort, mit der es auch spricht. Es gibt dafür keinen separaten Prüf-Schritt mehr: Navi wählt die passende Zielphase selbst, anhand der Bedingungstexte, die im Editor bei jedem Übergang hinterlegt sind.

Ob Navi dabei zu früh berät oder zu lange fragt, hängt also stärker als früher an der **Formulierung von Instruction und Persona-Regeln** — und weniger an technischen Sperren. Das ist Absicht: Ein Sprachmodell, das einem Arbeitsplan zuverlässig folgt, muss man nicht mehr künstlich an der kurzen Leine führen.

### Das Fakten-Blatt

Parallel zum Gespräch führt Navi ein **Fakten-Blatt**: was der Händler gesagt hat, was Navi daraus schließt, welche Anliegen noch offen sind, welche Empfehlung im Raum steht. Navi pflegt es nach **jeder** Nachricht selbst und bekommt es bei jeder Antwort vollständig wieder vorgelegt.

Das ist der Grund, warum Navi im späteren Gesprächsverlauf nichts vergisst und nichts doppelt fragt — es arbeitet nicht mit einem Gesprächsausschnitt, sondern mit einer durchgehend gepflegten Zusammenfassung.

### Die Oberfläche

Links der Chat, rechts das **Navi-Panel**. Das Panel ist das Beobachtungsfenster: Es zeigt, was intern gerade passiert.

| Abschnitt | Was du dort siehst |
|---|---|
| Profilleiste (ganz oben) | Welche Konfiguration gerade aktiv ist → [Profile](#profile) |
| **Bearbeiten** / **Aus Feedback verbessern** | Öffnet den Editor → [Die Felder im Navi-Editor](#die-felder-im-navi-editor) |
| Schalter „Änderungen im Chat anzeigen" | Blendet die Begründung zusätzlich direkt unter jeder Navi-Antwort im Chat ein, siehe unten |
| State | Aktuelle Phase mit dem kompletten Arbeitsauftrag, den Navi gerade hat (die Persona-Kennzeichnung dort ist inzwischen nur noch Anzeige, siehe [Persona](#die-felder-im-navi-editor)) |
| Slot-Checkliste (Gate) | Was in dieser Phase noch offen ist und was bereits als bekannt gilt |
| Begründung (letzte Turns) | Das Protokoll der letzten Züge: welche Fakten neu erfasst wurden, ob ein Phasenwechsel versucht und angenommen oder abgelehnt wurde (mit den noch offenen Punkten), ob ein Themenwechsel erkannt wurde. Die erste Anlaufstelle, wenn Navi sich unerwartet verhält. |
| Probleme | Das aktuell behandelte Anliegen plus die Anliegen, die der Händler nebenbei erwähnt hat und die später drankommen |
| Faktenlage | Das gesammelte Fakten-Blatt über alle Phasen hinweg |
| Hinweise | Optionale Themen und ob sie im Gespräch schon untergebracht wurden |
| Übergänge / Flow | Wohin es von hier aus gehen kann, und wo im Gesamtablauf das Gespräch steht |

### Navi anpassen

Nichts an Navis Verhalten ist fest verdrahtet — Phasen, Arbeitsaufträge, Checklisten, Tonfall, Use-Cases und Tool-Katalog sind alle im **Editor** änderbar (Knopf **Bearbeiten**). Eine komplette solche Konfiguration heißt **Profil**; du kannst mehrere davon nebeneinander halten, umschalten und als Datei weitergeben.

Zwei Wege führen zu Änderungen:

- **Von Hand** — im Editor, Feld für Feld. Alle Felder sind unter [Die Felder im Navi-Editor](#die-felder-im-navi-editor) erklärt.
- **Aus Feedback** — bewerte einzelne Navi-Antworten im Chat und klicke dann **Aus Feedback verbessern**. Ein Sprachmodell leitet daraus Änderungsvorschläge ab und füllt sie in den Editor vor. Übernommen wird nichts automatisch: Du prüfst die Vorschläge und speicherst, was du behalten willst.

Zum Ausprobieren gibt es außerdem einen **Simulations-Modus**: Ein simulierter Händler mit vorgegebener Persona führt das Gespräch automatisch von Anfang bis Ende, danach wird der Verlauf bewertet (Punktzahl 0–100, Stärken, Schwächen, Verbesserungsvorschläge). So lassen sich zwei Profile vergleichen, ohne jedes Mal selbst zu tippen.

### Wo läuft das Ganze?

Das Programm ist eine Desktop-Anwendung; es gibt keinen Server, der zwischengeschaltet wäre. Gespräche und Konfiguration liegen auf deinem Rechner (Konfiguration unter `.writing-assistant` in deinem Benutzerordner). Nach außen geht ausschließlich das, was für die Antwort des Sprachmodells nötig ist — an den KI-Anbieter, den du in den Einstellungen hinterlegt hast.

Chat-Verläufe sind bewusst **flüchtig** und hängen am lokalen Speicher der App; die **Konfiguration** dagegen ist dauerhaft in Dateien abgelegt und überlebt Neustarts. Ausführlich: [Wo liegen meine Daten?](#wo-liegen-meine-daten)

---

## Die Oberfläche und das erste Gespräch

### Der Aufbau

Das Fenster ist zweigeteilt:

- **Links das Navi-Panel** — das Beobachtungsfenster in Navis Innenleben (Phase, Checkliste, Faktenlage, Begründung) sowie der Zugang zu Profilen, Editor und Selbstverbesserung. Die Abschnitte sind oben in [Die Oberfläche](#die-oberfläche) tabellarisch aufgeführt.
- **Rechts der Chat** — überschrieben mit „KI-Navi Handel".

Die Trennlinie zwischen beiden lässt sich mit der Maus verschieben, wenn dir das Panel zu breit oder zu schmal ist.

In der Kopfzeile über dem Chat sitzen drei Schaltflächen:

| Symbol | Funktion |
|---|---|
| ⚗️ (Erlenmeyerkolben) | [Simulation starten](#simulations-modus) |
| 🕘 (Uhr) | Frühere Simulationsläufe ansehen |
| ✏️ (neues Blatt) | Neues Gespräch beginnen |

### Ein Gespräch führen

**Navi fängt an.** Sobald ein Gespräch existiert, schickt Navi von sich aus die Begrüßung — du musst nicht anfangen zu tippen. Danach antwortest du unten im Eingabefeld wie in jedem Chat.

**Manche Fragen sind anklickbar.** Stellt Navi eine Frage mit vorgegebenen Optionen (Werkzeug `ask_clarification`) oder eine Ja/Nein-Frage (`ask_yes_no`), erscheinen statt des freien Eingabefelds Schaltflächen. Bei Mehrfachauswahl kannst du mehrere anklicken. Welche Phase welches dieser Werkzeuge zur Auswahl hat, steuerst du im Editor unter [Tools](#die-felder-im-navi-editor) — benutzt wird es nur, wenn Navi es für die konkrete Frage passend findet; sonst antwortet es normal im Fließtext.

**Bewerten nicht vergessen.** Unter jeder Navi-Antwort sitzen 👍/👎. Sie sind der Rohstoff für die [Selbstverbesserung](#selbstverbesserung-aus-feedback-lernen) — wer Navi weiterentwickeln will, bewertet im Vorbeigehen mit.

**Ein neues Gespräch** startest du über die Schaltfläche in der Kopfzeile. Wichtig zu wissen: Die Navi-Ansicht zeigt immer **genau ein** Gespräch; eine Liste, über die du zu einem früheren zurückspringen könntest, gibt es hier nicht. Was du behalten willst, kopier dir vorher heraus.

### Änderungen direkt im Chat verfolgen

Der Abschnitt *Begründung* im Panel zeigt die letzten Turns — bei einem längeren Gespräch musst du dabei scrollen und selbst zuordnen, welche Chat-Nachricht zu welchem Protokolleintrag gehört. Der Schalter **„Änderungen im Chat anzeigen"** oben im Panel blendet dieselbe Information stattdessen direkt **unter der jeweiligen Navi-Antwort** ein — als schmale, aufklappbare Zeile.

Eingeklappt zeigt sie eine Kurzfassung: den Phasenwechsel dieses Zugs (z.B. „clarify_problem → explore_software_stack"), die Anzahl neu erfasster Fakten, und ein Warndreieck, falls Navi versucht hat, die Phase zu wechseln, und das Slot-Gate den Übergang abgelehnt hat. Aufgeklappt siehst du Details: welche Fakten mit welchem Wert neu eingetragen wurden, welche Checklisten-Punkte noch offen sind, und — falls blockiert — welcher Übergang an welchen fehlenden Punkten hing.

Der Schalter ist reine Ansichtssache für dich als Betrachter, nicht Teil dessen, was ein Händler in einer echten Beratung sehen würde. Die Einstellung wird gemerkt und übersteht einen Neustart des Programms.

### Welches KI-Modell benutzt Navi?

Das Modell für den Händler-Chat kommt aus der Anwendungskonfiguration (die hinterlegten KI-Anbieter) — in der Navi-Ansicht gibt es dafür bewusst keine Auswahl, damit ein Testlauf nicht versehentlich mit einem anderen Modell läuft als der vorige.

Die einzige Modellauswahl, die dir hier begegnet, ist das [Verbesserungs-LLM](#reiter-verbesserungs-llm) im Editor — und das betrifft ausschließlich die Selbstverbesserung, nie das Gespräch selbst.

> **Hinweis:** Das Einrichten der KI-Anbieter selbst ist in dieser Anleitung noch nicht beschrieben. Läuft der Chat gar nicht an oder brechen Antworten sofort mit einem Fehler ab, liegt es fast immer daran.

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

---

## Die Felder im Navi-Editor

Dieser Abschnitt erklärt, was jedes einzelne Eingabefeld bewirkt — also was sich am Verhalten von Navi ändert, wenn du es anfasst.

**Grundprinzip vorweg:** Navi ist ein LLM, das pro Antwort einen frisch zusammengebauten System-Prompt bekommt. Fast alles, was du hier einträgst, landet als Text in genau diesem Prompt. Ausnahmen sind die Felder, die *technisch* wirken (Persona-Umschalter, Werkzeug-Häkchen, Checkliste, Übergangsziele) — die steuern, was Navi überhaupt tun *kann*, nicht nur was ihm gesagt wird.

### Reiter „Phasen"

Ein Gespräch läuft durch Phasen (Begrüßung → Problem erfragen → … → Abschluss). Jede Phase hat einen eigenen Auftrag und einen eigenen Prompt. Die Liste zeigt alle Phasen; ein Klick auf eine Zeile klappt ihre Felder auf.

#### In der Kopfzeile jeder Phase

| Element | Bedeutung |
|---|---|
| Graues Kürzel links | Die **Phasen-ID** (z.B. `clarify_problem`). Wird beim Anlegen automatisch aus dem Anzeigenamen gebildet und ist danach **nicht mehr änderbar** — Übergänge und gespeicherte Gespräche zeigen darauf. |
| ▲ / ▼ | Verschiebt die Phase in der Liste. Das ist **nur die Anzeige-Reihenfolge** — der tatsächliche Ablauf ergibt sich ausschließlich aus den Übergängen. |
| 🗑️ | Löscht die Phase. Übergänge anderer Phasen, die hierher zeigten, verschwinden mit. Die Startphase `greeting` lässt sich nicht löschen. |

#### Die Felder

**Anzeigename**
Reiner Anzeigetext für die Oberfläche (Phasenliste, Fortschrittsanzeige im Navi-Panel). Navi selbst sieht ihn nicht. Leer lassen zeigt stattdessen die ID.

**Kurzbeschreibung**
Ebenfalls nur Anzeige: die Zeile unter dem Phasennamen im Navi-Panel, damit beim Zuschauen klar ist, was gerade passiert. Beeinflusst Navis Verhalten nicht.

**Persona**
Ein Auswahlfeld mit den Werten `narrow` und `full` — historisch der wichtigste Schalter der Phase, inzwischen aber **ohne Wirkung auf das Gespräch**. Jede Phase bekommt heute dieselbe volle Rollenbeschreibung, dieselben Verhaltensregeln, dieselben offenen Hinweise und (falls unten angehakt) dieselbe Wissensbasis in den Prompt — unabhängig vom hier gewählten Wert. Das Feld bleibt aus zwei Gründen bestehen: Es speist die Persona-Kennzeichnung im Navi-Panel (rein informativ), und ältere Profile/Exporte enthalten den Wert noch. Ändere es, wenn du magst — es hat keinen Effekt mehr auf Navis Antworten.

Was in dieser Phase tatsächlich strukturell erzwungen wird, steuerst du stattdessen über die **Checkliste** (Slot-Gate, siehe unten) — die Persona spielt dabei keine Rolle mehr.

**Instruction**
Der eigentliche Arbeitsauftrag der Phase, wortwörtlich in den Prompt eingesetzt („Deine Aufgabe in diesem Schritt: …"). Hier steht das *Was* — welches Ziel die Phase hat, was gefragt werden soll, was verboten ist, Beispiele für gute und schlechte Fragen.

Das *Wie* der Kommunikation (Tonfall, „der Händler kennt die Fachbegriffe nicht", erst erklären dann benennen) gehört **nicht** hierher, sondern zentral in den Reiter *Persona* — sonst musst du es in jeder Phase pflegen.

**Antwort muss eine Frage enthalten**
Ohne Funktion — die zugehörige Notbremse (automatisch ein „?" anhängen) gehörte zu einem Werkzeug, das es nicht mehr gibt. Das Häkchen bleibt im Editor nur aus Kompatibilitätsgründen bestehen. Willst du erzwingen, dass eine Phase mit einer Frage endet, formuliere das in der **Instruction**.

**Use-Cases einblenden (Wissensbasis-Tab)**
Hängt die Use-Case-Liste aus dem Reiter *Wissensbasis* an den Prompt an, zusammen mit der Anweisung, das Problem des Händlers einem Use-Case zuzuordnen (und ehrlich zu sagen, wenn keiner passt). Anhaken, wo Navi einschätzt oder empfiehlt — nicht in reinen Frage-Phasen, dort lenkt es nur ab.

**Tool-Katalog einblenden**
Hängt zusätzlich den Katalog der KI-Tools an, nach Kategorie gruppiert und jeweils mit Link auf die Tool-Seite; dazu die Pflicht, bei einer konkreten Empfehlung den passenden Markdown-Link mitzugeben und keine URLs zu erfinden. Setzt **Use-Cases einblenden** voraus — ohne Use-Cases wird der Katalog gar nicht erst erzeugt. Denn: Es werden nur Tools eingeblendet, deren Kategorie bei mindestens einem Use-Case vorkommt.

**Offene Anliegen am Ende dieser Phase anhängen**
Hat der Händler im Gespräch weitere Themen erwähnt, die noch nicht behandelt wurden (Navi führt darüber intern eine Liste), wird an die Instruction dieser Phase ein Zusatz angehängt: Navi soll am Ende freundlich fragen, ob eines dieser Themen noch dran soll. Gedacht für die Abschlussphase. Gibt es keine offenen Anliegen, passiert nichts.

**Tools** (Häkchen `ask_question`, `ask_clarification`, `ask_yes_no`)
Legt fest, welche **zusätzlichen** Antwort-Werkzeuge Navi in dieser Phase zur Verfügung stehen — Navi *kann* sie benutzen, ist aber zu nichts gezwungen:

| Häkchen | Wirkung, wenn Navi es benutzt |
|---|---|
| `ask_question` | Ohne Funktion — ein früheres Werkzeug für offene Fragen, heute nicht mehr implementiert. Ankreuzen ändert nichts. |
| `ask_clarification` | Frage **mit vorgegebenen Antwortoptionen** als anklickbare Auswahl. |
| `ask_yes_no` | Frage als Ja/Nein-Auswahl. |

Setzt Navi keines der funktionierenden Häkchen ein (oder ist keines angehakt), antwortet es als freier Fließtext — das ist inzwischen der Normalfall in **jeder** Phase, auch in den Frage-Phasen. Ob Navi ein angehaktes Werkzeug tatsächlich benutzt oder lieber frei antwortet, entscheidet das Modell selbst anhand der Instruction; anders als früher gibt es dafür keine technische Pflicht mehr.

**Checkliste (workPlan)**
Die Punkte, die Navi in dieser Phase geklärt haben muss, bevor es weitergehen darf. Jeder Punkt wird zu einem **Slot**: Navi trägt selbst ein, was es dazu erfahren hat, und die Oberfläche zeigt dir live `[offen]` bzw. `[bekannt]`.

Der Effekt hängt allein an der **Checkliste selbst**, nicht mehr an der Persona:

- **Mindestens ein Punkt:** Es entsteht ein **Slot-Gate** auf dem **ersten** Übergang dieser Phase (siehe *Übergänge* unten). Der Weiterschritt dorthin wird vom Programm geprüft, nicht vom Modell eingeschätzt — solange auch nur ein Punkt offen ist, wird genau dieser eine Übergang abgelehnt, und Navi muss weiterfragen. Der Editor blendet in diesem Fall den Hinweis *„erster Übergang ist das Slot-Gate"* ein.
- **Leere Checkliste:** Kein Gate. Navi entscheidet alle Übergänge dieser Phase frei anhand ihrer Bedingung.

Formuliere die Punkte als überprüfbaren Zustand („Online-Präsenz bekannt — auch ‚nur stationär' ist gültig"), nicht als Aufgabe („nach Online-Präsenz fragen"). Und halte sie so knapp wie möglich: Jeder Punkt ist eine Hürde, die das Gespräch verlängert.

Ein Achtung noch: Änderst du den **Wortlaut** eines Punktes, ändert sich seine interne ID mit. In bereits laufenden Gesprächen gilt der Punkt dann wieder als offen.

**Übergänge**
Wohin es von dieser Phase aus gehen kann. Jeder Übergang hat drei Teile:

| Feld | Bedeutung |
|---|---|
| Auswahlliste | Die **Zielphase**. Nur vorhandene Phasen sind wählbar. |
| Kurzbeschriftung (UI) | Reiner Anzeigetext im Navi-Panel („Problem genannt"). Wirkt nicht auf das Verhalten. |
| Bedingung | Der Text, den Navi selbst im Prompt vorgelegt bekommt, um zu entscheiden, ob dieser Übergang gerade passt. Beschreibe **beobachtbares Verhalten des Händlers** („Nutzer beschreibt ein konkretes Problem mit erkennbarem Kontext"), nicht eine Absicht. |

Es gibt keinen separaten Prüf-Schritt mehr: Navi wählt die Zielphase über dasselbe Werkzeug, mit dem es auch antwortet, und orientiert sich dabei an den Bedingungstexten aller Übergänge dieser Phase.

**Die Reihenfolge der Übergänge ist bedeutsam** — aber nur bei Phasen **mit Checkliste**: Dort ist der **erste** Übergang der automatische Weiterschritt (das Slot-Gate); seine Bedingung ist reine Doku für dich, sie wird vom Programm gar nicht ausgewertet — es zählt allein, ob alle Checklisten-Punkte gefüllt sind. Alle **weiteren** Übergänge sind Ausnahmen (Themenwechsel, Missverständnis, Zufriedenheit) und wählt Navi selbst anhand ihrer Bedingung.

Bei Phasen **ohne Checkliste** gibt es kein Gate: Navi wählt *alle* Übergänge frei anhand der Bedingungen — oder bleibt in der Phase und antwortet normal weiter, wenn keine passt.

Versucht Navi einen Übergang, den es in dieser Phase gar nicht gibt, wird das schlicht verworfen (sichtbar im Abschnitt *Begründung*) — Navi bleibt dann in der aktuellen Phase.

**Speichern:** Der Knopf **Phasen speichern** unten. Das Programm prüft vorher und lehnt bei Fehlern komplett ab — doppelte Phasen-ID, fehlende Startphase `greeting`, ein Übergang auf eine nicht existierende Phase, oder eine Phase mit Checkliste, aber ganz ohne Übergang (dem Slot-Gate fehlt dann das Ziel).

### Reiter „Persona"

Hier steht das *Wie* und das *Wer* — einmal zentral, statt in jeder Phase wiederholt. Beide Felder unten gelten inzwischen für **jede** Phase gleichermaßen (siehe Hinweis zum Feld *Persona* im Reiter *Phasen*) — die Aufteilung „Full" vs. „Narrow" ist nur noch in der Editor-Struktur sichtbar, nicht mehr im tatsächlichen Verhalten.

**Rollenbeschreibung (roleIntro)**
Die Identitäts-Einweisung („Du bist Navi, ein ehrlicher KI-Berater für Einzelhändler …"). Sie steht als **erster Absatz** im Prompt **jeder** Phase. Darf nicht leer sein.

**Full-Persona-Regeln**
Die Liste von Verhaltensregeln, die in jeder Phase hinter der Rollenbeschreibung landen: Tonfall, Umgang mit Fachbegriffen, Ehrlichkeit statt Verkaufe, Antwortlänge, „stelle genau eine Frage". Jede Regel ist ein eigener Eintrag — das hält sie im Prompt sauber getrennt und macht sie einzeln löschbar. Das ist inzwischen das **einzige** Regelwerk, das tatsächlich verwendet wird.

**Narrow-Persona-Regeln**
Wird **nicht mehr in den Prompt eingesetzt** — ein Überbleibsel aus der Zeit, als Frage-Phasen eine eigene, schmalere Persona hatten. Das Feld bleibt im Editor nur, damit ältere Profile beim Laden nicht kaputtgehen. Trag hier nichts Neues ein; es hätte keine Wirkung.

Leere Regeln werden beim Speichern abgelehnt — lösche eine Regel lieber über 🗑️, statt ihr Feld zu leeren.

### Reiter „Hinweise"

Optionale Themen, die Navi **einmalig** im Gespräch unterbringen soll, sobald sie natürlich hineinpassen. Werden in jeder Phase in den Prompt eingesetzt, solange sie noch nicht als abgedeckt gelten.

| Feld | Bedeutung |
|---|---|
| Name (obere Zeile) | Anzeigename in der Oberfläche. Navi sieht ihn nicht. |
| Anweisung (wann/wie einbringen) | Wird in den Prompt eingesetzt: „Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich passen …". Formuliere hier den Inhalt und den passenden Anlass. |
| Wann gilt der Hinweis als angesprochen? | Das Erkennungskriterium. Nach jeder Antwort prüft ein separater, unsichtbarer Aufruf anhand dieses Textes, ob der Hinweis abgehakt werden kann. |

Ist ein Hinweis abgehakt, verschwindet er aus allen weiteren Prompts dieses Gesprächs — so wiederholt Navi sich nicht. Bleibt das Kriterium zu streng formuliert, wird der Hinweis nie abgehakt und Navi bringt ihn womöglich mehrfach; ist es zu locker, gilt er als erledigt, bevor er wirklich gesagt wurde.

### Reiter „Wissensbasis"

Zwei getrennte Listen mit **zwei getrennten Speichern-Knöpfen**. Beide wirken nur in Phasen, bei denen *Use-Cases einblenden* bzw. zusätzlich *Tool-Katalog einblenden* angehakt ist.

#### Use-Cases

Die Beratungs-Kategorien, denen Navi das Problem des Händlers zuordnen soll.

| Feld | Bedeutung |
|---|---|
| Name | Bezeichnung des Use-Cases, steht so im Prompt. Muss eindeutig sein. |
| Beschreibung | Woran Navi erkennt, dass ein Problem hierher gehört. Das ist das eigentliche Zuordnungskriterium — je konkreter, desto treffsicherer. |
| Kategorien (kommagetrennt) | **Die Verbindung zum Tool-Katalog.** Nur Tools, deren Kategorie hier bei mindestens einem Use-Case vorkommt, werden Navi überhaupt gezeigt. Schreibweise muss exakt übereinstimmen (z.B. `social_media`). Mindestens eine Kategorie ist Pflicht. |

Ein Tool mit einer Kategorie, die in keinem Use-Case auftaucht, ist für Navi unsichtbar — das ist die häufigste Ursache, wenn ein neu angelegtes Tool nie empfohlen wird.

#### Tool-Katalog

Die konkreten KI-Tools, die Navi empfehlen darf.

| Feld | Bedeutung |
|---|---|
| Name | Wird im Prompt und in der Empfehlung genannt. |
| Kategorie | Ordnet das Tool einem Use-Case zu (siehe oben). Pflichtfeld. |
| Beschreibung | Was das Tool tut. Navi nutzt sie, um zu entscheiden, ob es zum Problem und Stack des Händlers passt, und um es dem Händler zu erklären. Pflichtfeld. |
| Slug (optional) | Bestimmt den Link auf die Tool-Seite (`https://www.ki-navi.net/<slug>`). Leer lassen leitet ihn automatisch aus dem Namen ab. Nur ausfüllen, wenn die tatsächliche Seiten-Adresse vom Namen abweicht — sonst empfiehlt Navi ein Tool mit einem Link, der ins Leere führt. |

### Reiter „Verbesserungs-LLM"

Betrifft **nicht** das Gespräch mit dem Händler, sondern ausschließlich die Funktion „Aus Feedback verbessern", die aus deinem Feedback zu einem Gespräch Änderungsvorschläge für die Konfiguration erzeugt. Damit kannst du dafür ein stärkeres (oder einfach anderes) Modell verwenden als im Chat.

| Feld | Bedeutung |
|---|---|
| API-URL | Adresse des Endpunkts, z.B. `https://api.openai.com/v1`. |
| Modell | Modellname, z.B. `gpt-5`. |
| API-Key | Zugangsschlüssel. Wird nur geschrieben, nie zurück angezeigt — steht bereits einer, zeigt das Feld nur „(gesetzt)". Leer lassen behält den gespeicherten Schlüssel; **API-Key entfernen** löscht ihn. |

Alle drei müssen gesetzt sein, damit dieser Endpunkt greift. Fehlt eines, verwendet die Verbesserungsfunktion still das Modell, das im Chat gerade ausgewählt ist.

Diese Einstellungen sind **programmweit**, nicht Teil des Profils — sie werden weder mitexportiert noch beim Profilwechsel getauscht. Grund: der API-Key soll nie in einer Datei landen, die du weitergibst.

### Was passiert, wenn ein KI-Änderungsvorschlag vorliegt?

Öffnet sich der Editor mit einem gelben Hinweis oben („KI-Änderungsvorschlag … noch nicht gespeichert"), sind die Felder bereits mit den vorgeschlagenen Werten gefüllt — **gespeichert ist aber nichts**. Geh die Reiter durch, prüfe die Änderungen und speichere jeden Bereich einzeln, den du übernehmen willst. Alles, was du nicht speicherst, verfällt beim Schließen. Konnte ein Bereich nicht übernommen werden, weil der Vorschlag die Prüfung nicht bestanden hat, steht der Grund als Warnung im selben Kasten.

Wie so ein Vorschlag zustande kommt, steht im nächsten Abschnitt.

---

## Selbstverbesserung: aus Feedback lernen

Navi kann seine eigene Konfiguration verbessern — aus deinem Feedback zu einem konkreten Gespräch. Der Knopf dafür heißt **Aus Feedback verbessern** und sitzt im Navi-Panel neben **Bearbeiten**.

### Was das ist — und was nicht

Der Ablauf in einem Satz: Du bewertest im Chat einzelne Navi-Antworten mit 👍/👎 und einem Kommentar; ein Sprachmodell bekommt dieses Gespräch samt Bewertungen und die **aktuelle Konfiguration** vorgelegt und schlägt daraufhin konkrete Änderungen an Phasen, Persona, Hinweisen oder Wissensbasis vor; diese Vorschläge landen im Editor, wo du sie prüfst und einzeln übernimmst.

Wichtig ist, was **nicht** passiert:

- **Navi lernt nicht im Gespräch.** Ein Kommentar ändert nichts an der laufenden Unterhaltung. Navi merkt sich auch nichts von einem Gespräch zum nächsten.
- **Es wird nichts automatisch gespeichert.** Der Vorschlag füllt nur die Editor-Felder vor. Ohne deinen Klick auf einen Speichern-Knopf verfällt er beim Schließen restlos.
- **Es ist kein Training.** Das Modell selbst bleibt unverändert — geändert wird ausschließlich der Konfigurationstext, den Navi als Anweisung bekommt. Alles, was hier vorgeschlagen wird, hättest du im Editor auch von Hand tippen können.

Kurz: Die Selbstverbesserung ist ein Schreibassistent für deine Navi-Konfiguration, kein Automatismus.

### Schritt 1 — Antworten bewerten

Fahre im Chat über eine Navi-Antwort; unter ihr erscheinen ein Daumen hoch und ein Daumen runter.

1. Klicke 👍 oder 👎. Es öffnet sich sofort ein Kommentarfeld.
2. **Der Kommentar ist Pflicht** — der Speichern-Knopf bleibt bei leerem Feld gesperrt. Erst mit dem Speichern ist die Bewertung gesetzt.
3. Eine gesetzte Bewertung erkennst du am hervorgehobenen Daumen. Über das Sprechblasen-Symbol daneben kannst du den Kommentar später nachbearbeiten; ein erneuter Klick auf denselben Daumen entfernt die Bewertung wieder.

Dass der Kommentar erzwungen wird, hat einen Grund: Ein nacktes 👎 sagt dem Modell nur, dass *irgendetwas* nicht stimmte — daraus lässt sich keine Änderung ableiten. Die Qualität des Vorschlags hängt fast vollständig an der Qualität deiner Kommentare.

Gute Kommentare benennen das beobachtete Verhalten und das gewünschte:

- Statt „schlecht" → „fragt nach dem Schaufenster, obwohl der Händler gerade gesagt hat, dass es ein allgemeines Problem in der Straße ist"
- Statt „passt nicht" → „empfiehlt einen eigenen Webshop, obwohl der Händler vorher gesagt hat, dass kein Startbudget da ist"
- Statt „gut" → „gut, dass hier zuerst der Nutzen erklärt wird, bevor die Frage kommt"

**Bewerte auch das Gute.** Die 👍-Kommentare werden ausdrücklich als Schutz gegen Rückschritte mitgegeben: Sie sagen dem Modell, was es beim Reparieren nicht kaputtmachen darf. Ein Durchgang, der nur aus 👎 besteht, verbessert oft die eine Stelle und ruiniert eine andere.

### Schritt 2 — Vorschlag erzeugen

Sobald **mindestens eine** bewertete Antwort im aktuellen Gespräch existiert, wird der Knopf **Aus Feedback verbessern** aktiv (vorher erklärt sein Tooltip, was noch fehlt). Ein Klick startet den Vorgang; der Knopf zeigt so lange „Erzeuge Vorschlag …".

Übergeben werden zwei Dinge:

- **Das ganze Gespräch** als Textprotokoll — alle sichtbaren Nachrichten, die Werkzeug-Aufrufe dazu, deine Bewertungen an der jeweiligen Stelle und eine Feedback-Zusammenfassung am Ende. Immer nur **das eine, gerade offene Gespräch**; es gibt keine Auswertung über mehrere Gespräche hinweg.
- **Die vollständige aktuelle Konfiguration** des aktiven Profils: Persona, Phasen, Hinweise, Use-Cases, Tools.

Welches Modell das übernimmt, steuerst du im Editor-Reiter *Verbesserungs-LLM*. Ist er vollständig ausgefüllt (URL, Modell **und** API-Key), wird dieser Endpunkt verwendet — sonst still das Modell, das im Chat ausgewählt ist. Für diese Aufgabe lohnt ein starkes Modell: Sie ist deutlich anspruchsvoller als das Beratungsgespräch selbst.

### Schritt 3 — Was das Modell tun darf

Das Modell arbeitet unter festen Regeln, die es nicht umgehen kann:

- **Es muss die Leitprinzipien wahren** — ehrliche Beratung auf Ist-Zustand-Basis, kein Tool-Verkauf, kein Drängen zum Software-Umbau. Feedback, das in diese Richtung zöge, soll nicht umgesetzt werden.
- **Nur belegte Änderungen.** Geändert werden darf nur, wofür es einen konkreten Beleg im Feedback gibt — keine ungefragten „Verbesserungen" nebenbei.
- **Bestehende Phasen-IDs und Checklisten-Bezeichner bleiben erhalten**, außer das Feedback verlangt ausdrücklich einen strukturellen Umbau. Jeder Übergang muss auf eine tatsächlich existierende Phase zeigen.
- **Nur betroffene Bereiche.** Bereiche ohne Änderungsbedarf lässt das Modell komplett weg — der zugehörige Reiter im Editor bleibt dann unverändert.

Ein Detail mit Folgen: Liefert das Modell einen Bereich, **ersetzt dieser Bereich den bisherigen vollständig**. Es gibt keine punktuelle Änderung einzelner Zeilen. Schlägt das Modell also etwas an einer Phase vor, bekommst du die komplette Phasenliste zurück — inklusive aller Phasen, die es eigentlich nicht anfassen wollte. Genau deshalb lohnt es sich, vor dem Speichern auch die Stellen anzusehen, um die es gar nicht ging.

### Schritt 4 — Prüfung und Übernahme

Jeder vorgeschlagene Bereich läuft durch **dieselbe Prüfung wie ein Speichern von Hand**. Fällt einer durch (etwa: ein Übergang zeigt auf eine gelöschte Phase, ein Use-Case ohne Kategorie), wird **nur dieser Bereich verworfen** — die übrigen bleiben erhalten, und der Grund erscheint als Warnung.

Danach öffnet sich der Editor automatisch mit einem Hinweiskasten oben:

| Element im Kasten | Bedeutung |
|---|---|
| „… noch nicht gespeichert" | Erinnerung: Die Felder sind vorgefüllt, aber nichts ist übernommen. |
| Begründung | Welcher Feedback-Kommentar welche Änderung ausgelöst hat, nach Bereichen getrennt. Der wichtigste Text — lies ihn, bevor du die Reiter durchgehst. |
| Warnungen (falls vorhanden) | Bereiche, die das Modell ändern wollte, die aber die Prüfung nicht bestanden haben und deshalb **nicht** übernommen wurden. |

Nun gehst du die Reiter durch, vergleichst mit der Begründung und klickst in jedem Bereich, den du behalten willst, den zugehörigen Speichern-Knopf — der Reiter *Wissensbasis* hat wie immer zwei. Ein Bereich, den du nicht speicherst, verfällt beim Schließen des Editors.

Zwei Dinge, die dabei greifen wie sonst auch:

- Ist gerade das schreibgeschützte Profil „Marc" aktiv, forkt das erste Speichern automatisch in „Marc (Kopie)". Der Auslieferungsstand bleibt unangetastet.
- Gefällt dir eine übernommene Änderung im Nachhinein nicht, setzt der Knopf **Standard** den betroffenen Bereich auf die Auslieferungswerte zurück — allerdings *ganz*, nicht nur die letzte Änderung. Es gibt keine Rücknahme einzelner Schritte.

### Wie man damit sinnvoll arbeitet

- **Auf einer Kopie arbeiten.** Dupliziere dein Profil (⧉), bevor du eine Verbesserungsrunde fährst. Dann hast du jederzeit den Vergleichsstand und kannst im Zweifel zurückschalten.
- **Kleine Runden statt einer großen.** Zwei bis fünf gezielte Bewertungen pro Gespräch führen zu übersichtlichen Vorschlägen. Zwanzig Kommentare auf einmal ergeben einen Vorschlag, der alles gleichzeitig anfasst und kaum noch prüfbar ist.
- **Danach gegentesten.** Führe nach dem Übernehmen ein neues Gespräch — am besten über den Simulations-Modus mit derselben Händler-Persona wie zuvor. Die Bewertung am Ende (Punktzahl, Stärken, Schwächen) zeigt, ob die Änderung wirklich etwas gebracht hat oder nur an anderer Stelle wehtut.
- **Der Begründung nicht blind glauben.** Sie beschreibt, was das Modell zu tun *meinte*. Ob das im Feld auch so steht, siehst du nur im Reiter selbst.

### Wenn es nicht klappt

| Meldung / Beobachtung | Ursache |
|---|---|
| Knopf ist ausgegraut | Im aktuellen Gespräch ist noch keine Antwort bewertet. Der Tooltip sagt es dir. |
| „LLM-Anfrage fehlgeschlagen" | Der Endpunkt hat abgelehnt — meist ein falscher API-Key, eine falsche URL oder ein unbekannter Modellname im Reiter *Verbesserungs-LLM*. |
| „Die Modellantwort war kein gültiges JSON" / „keine Antwort geliefert" | Das gewählte Modell kommt mit der Aufgabe nicht zurecht. Ein stärkeres Modell im Reiter *Verbesserungs-LLM* hinterlegen. |
| Editor öffnet sich, aber nichts hat sich geändert | Das Modell sah im Feedback keinen belegten Änderungsbedarf. Meist helfen konkretere Kommentare. |
| Warnung „… Vorschlag verworfen" | Der Vorschlag für diesen einen Bereich war in sich unstimmig und wurde fallengelassen. Die anderen Bereiche kannst du trotzdem übernehmen. |

---

## Simulations-Modus

Um Navi zu testen, musst du nicht selbst den Händler spielen. Im Simulations-Modus übernimmt ein zweites Sprachmodell diese Rolle und führt das Gespräch von der Begrüßung bis zum Abschluss durch — danach wird der Verlauf automatisch bewertet.

Das ist das Gegenstück zur Selbstverbesserung: Dort änderst du die Konfiguration, hier prüfst du, ob die Änderung etwas gebracht hat.

### Einen Lauf starten

Klick auf ⚗️ in der Kopfzeile des Chats. Der Dialog „Navi-Simulation" fragt drei Dinge:

**Persona — wen soll die KI als Händler spielen?**
Wähle einen gespeicherten Händler aus der Liste, oder leg über 👤➕ einen neuen an (Name + Beschreibung, beide Pflicht). Die Beschreibung ist der eigentliche Hebel: Laden, Alter, Technik-Affinität, Budget, Probleme, Grundhaltung. Je konkreter, desto realistischer verhält sich der simulierte Händler — „Bäckerei in Köln, 55, nutzt nur Excel und Papier, kleines Budget, skeptisch gegenüber Software" liefert brauchbarere Läufe als „ein Bäcker".

Angelegte Personas bleiben erhalten und stehen bei jedem weiteren Lauf zur Auswahl. Genau darin liegt der Nutzen: Dieselbe Persona zweimal laufen zu lassen — vor und nach einer Konfigurationsänderung — ist der einzige halbwegs faire Vergleich, den du hast.

**Testfokus**
Worauf du bei diesem Lauf achten willst, z.B. „Erreicht Navi die Empfehlung in höchstens 5 Zügen?". Bei gewählter Persona optional; **ohne** Persona ist dieses Feld Pflicht und beschreibt dann selbst den zu spielenden Händler.

**Titel**
Optional. Bleibt er leer, wird er aus Persona und Testfokus abgeleitet.

Mindestens eines von beidem — Persona oder Testfokus — muss ausgefüllt sein, sonst bleibt **Simulation starten** gesperrt.

### Was dann passiert

Das Gespräch läuft von allein: Navi antwortet, der simulierte Händler antwortet darauf, und so weiter. Ein Banner über dem Chat erinnert daran, dass es sich um einen Simulationslauf handelt. Du kannst live zusehen — im Navi-Panel wandert die Phasenanzeige mit, und der Abschnitt *Begründung* zeigt zu jedem Zug, warum Navi so entschieden hat.

Der Lauf endet automatisch, sobald **eines** davon eintritt:

- Navi erreicht die Abschlussphase, **oder**
- der simulierte Händler hat **12 Nachrichten** geschickt (Notbremse gegen Endlosschleifen).

Danach bewertet ein weiterer Aufruf das gesamte Gespräch und stellt das Ergebnis als Nachricht in den Chat: **Punktzahl 0–100**, ein kurzes Gesamturteil, Stärken, Schwächen und Verbesserungsvorschläge. Bewertet wird gegen Persona, Protokoll und den erreichten Endzustand — also auch, ob Navi überhaupt bis zu einer Empfehlung gekommen ist.

Endet ein Lauf bei 12 Zügen statt in der Abschlussphase, ist das für sich genommen schon ein Befund: Navi hat sich irgendwo festgefragt. Der Abschnitt *Begründung* im Panel zeigt dir dann meist einen Checklisten-Punkt, der nie als beantwortet erkannt wurde.

### Frühere Läufe ansehen

Das Uhr-Symbol 🕘 in der Kopfzeile öffnet das Archiv. Links die Liste aller Läufe mit farbiger Punktzahl (ab 70 grün, ab 40 gelb, darunter rot), rechts zum ausgewählten Lauf die vollständige Bewertung und das komplette Gesprächsprotokoll.

Läufe werden dauerhaft als Dateien gespeichert und überleben Neustarts.

**Ein Vorbehalt, den du kennen solltest:** Ein gespeicherter Lauf hält Persona, Protokoll, Endzustand und Bewertung fest — **aber nicht, welches Navi-Profil aktiv war**. Zwei Läufe derselben Persona lassen sich später also nicht mehr eindeutig einer Konfiguration zuordnen. Wenn du systematisch vergleichst, schreib das Profil in den Titel des Laufs (z.B. „Bäcker — Profil B, kürzere Klärungsphase").

### Wie man damit vergleicht

1. Persona anlegen und einen Lauf mit dem aktuellen Profil fahren — das ist der Ausgangswert.
2. Profil duplizieren (⧉), die Änderung im Editor vornehmen.
3. Denselben Lauf mit derselben Persona wiederholen, das Profil im Titel vermerken.
4. Beide Bewertungen im Archiv nebeneinanderlegen.

Erwarte dabei keine Messgenauigkeit: Sowohl der simulierte Händler als auch die Bewertung sind Sprachmodell-Ausgaben und schwanken zwischen zwei Läufen auch ohne jede Änderung. Ein Unterschied von wenigen Punkten sagt nichts. Aussagekräftig sind die Stärken/Schwächen-Texte und offensichtliche Sprünge — etwa wenn ein Lauf plötzlich die Abschlussphase erreicht, der vorige aber ins Zugslimit lief.

---

## Wo liegen meine Daten?

Alles bleibt auf deinem Rechner. Nach außen geht nur das, was das Sprachmodell für seine Antwort braucht — an den KI-Anbieter, den du hinterlegt hast.

| Was | Wo | Überlebt Neustart? |
|---|---|---|
| Navi-Konfiguration (Profile) | `.writing-assistant\navi\profiles\` im Benutzerordner | ja, als Datei |
| Sicherungskopien | `.writing-assistant\navi\backups\` | ja — vor **jedem** Überschreiben automatisch angelegt |
| Simulationsläufe | `.writing-assistant\navi\` | ja, als Datei |
| Händler-Personas | `.writing-assistant\personas\` | ja, als Datei |
| Verbesserungs-LLM (inkl. API-Key) | `.writing-assistant\navi\`, **außerhalb** der Profile | ja, als Datei |
| Chat-Verläufe | interner Speicher der Anwendung | ja, aber **nicht als Datei** |

Der letzte Punkt ist der wichtige: Gespräche liegen nicht in einer Datei, die du sichern oder weitergeben könntest, und die Navi-Ansicht bietet keine Liste, über die du ein früheres Gespräch wieder aufrufen könntest. **Behandle Chat-Verläufe als flüchtig.** Was du behalten willst — eine gelungene Antwortformulierung, ein aufschlussreicher Gesprächsverlauf — kopier es heraus, solange es am Bildschirm steht.

Dass die Sicherungskopien der Konfiguration vor jedem Überschreiben entstehen, ist dein Rettungsanker, wenn eine übernommene Änderung sich als Fehlgriff erweist: Die vorige Fassung liegt noch im `backups`-Ordner und kann von Hand zurückkopiert werden.

---

## Glossar

Die Begriffe, die in der Oberfläche und in dieser Anleitung auftauchen — kurz erklärt.

| Begriff | Bedeutung |
|---|---|
| **Phase** (auch *State*) | Ein Abschnitt des Gesprächs mit genau einem Auftrag, z.B. „Problem klären". Navi bekommt pro Phase einen eigenen Arbeitsauftrag. |
| **Phasen-ID** | Der technische Name einer Phase (`clarify_problem`). Wird beim Anlegen vergeben und ist danach fest — Übergänge zeigen darauf. |
| **Persona** (`narrow` / `full`) | Historisches Feld pro Phase — heute ohne Wirkung auf das Gespräch. Jede Phase nutzt dieselbe volle Berater-Persona, egal welcher Wert hier steht. |
| **Instruction** | Der Arbeitsauftrag einer Phase — was Navi hier erreichen soll. |
| **Checkliste / workPlan** | Was in einer Phase geklärt sein muss, bevor der erste Übergang möglich ist. |
| **Slot** | Ein einzelner Checklisten-Punkt samt dem Wert, den Navi dazu erfahren hat. |
| **Slot-Gate** | Die Sperre, die den ersten Übergang einer Phase mit Checkliste verhindert, solange ein Slot offen ist. Wird gerechnet, nicht vom Modell eingeschätzt — der einzige rein technische Schutzmechanismus, der noch übrig ist. |
| **Übergang** | Ein möglicher Wechsel in eine andere Phase, mit einer Bedingung, anhand derer Navi selbst entscheidet, ob er passt (Ausnahme: der erste Übergang einer Phase mit Checkliste, siehe Slot-Gate). |
| **Fakten-Blatt** | Navis laufend gepflegte Zusammenfassung des Gesprächs — im Panel als *Faktenlage* sichtbar. |
| **Hinweis / Tip** | Ein Thema, das Navi einmalig im Gespräch unterbringen soll. |
| **Use-Case** | Eine Beratungs-Kategorie, der Navi das Problem des Händlers zuordnet. |
| **Tool** (Wissensbasis) | Ein konkretes KI-Produkt, das Navi empfehlen darf. **Nicht** zu verwechseln mit → |
| **Werkzeug** (`ask_clarification`, `ask_yes_no`) | Eine optionale Antwortform, die Navi zusätzlich zum freien Fließtext benutzen kann: Auswahlfrage, Ja/Nein-Frage. `ask_question` steht zwar noch als Häkchen im Editor, ist aber ohne Funktion. Im Editor stehen beide unter dem Wort „Tools" — das obere Häkchenfeld meint die Antwortform, der Reiter *Wissensbasis* die empfehlbaren Produkte. |
| **Änderungen im Chat** | Schalter im Panel, der die Begründung eines Zugs zusätzlich als aufklappbare Zeile unter der jeweiligen Navi-Antwort im Chat einblendet. |
| **Profil** | Ein kompletter Satz Navi-Konfiguration, umschaltbar und weitergebbar. |
| **Verbesserungs-LLM** | Das Modell, das aus deinem Feedback Änderungsvorschläge erzeugt — nicht das Modell, das den Chat führt. |
| **Persona** (Simulation) | Achtung, zweite Bedeutung: der simulierte Händler in einem Testlauf. Hat mit der Navi-Persona oben nichts zu tun. |
