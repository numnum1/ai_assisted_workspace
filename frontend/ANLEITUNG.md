# Anleitung

Bedienungsanleitung für Navi — den KI-Berater-Chat für Einzelhändler.

Diese Anleitung wächst mit dem Programm. Aktuell enthalten:

- [Profile](#profile)
- [Die Felder im Navi-Editor](#die-felder-im-navi-editor)

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
Der wichtigste Schalter der ganzen Phase. Er entscheidet, *wer* Navi in dieser Phase ist:

- **narrow — reiner Fragensteller:** Navi bekommt **keine** Berater-Identität, keine Rollenbeschreibung, keine Hinweise und keine Wissensbasis in den Prompt. Es weiß nur: „Ich führe ein strukturiertes Gespräch und stelle eine Frage." Das ist die Schutzschicht gegen voreilige Empfehlungen — ein Modell, das seine Beraterrolle gar nicht kennt, springt auch nicht mittendrin in Lösungsvorschläge.
- **full — voller Berater:** Navi bekommt Rollenbeschreibung, Full-Persona-Regeln, offene Hinweise und (falls unten angehakt) die Wissensbasis. Nötig überall dort, wo Navi bewerten, empfehlen oder sich vorstellen soll.

Die Wahl hat zwei Nebenwirkungen: nur **narrow**-Phasen *mit* Checkliste bekommen das automatische Slot-Gate (siehe unten), und nur **full**-Phasen können Hinweise und Wissensbasis einblenden.

**Instruction**
Der eigentliche Arbeitsauftrag der Phase, wortwörtlich in den Prompt eingesetzt („Deine Aufgabe in diesem Schritt: …"). Hier steht das *Was* — welches Ziel die Phase hat, was gefragt werden soll, was verboten ist, Beispiele für gute und schlechte Fragen.

Das *Wie* der Kommunikation (Tonfall, „der Händler kennt die Fachbegriffe nicht", erst erklären dann benennen) gehört **nicht** hierher, sondern zentral in den Reiter *Persona* — sonst musst du es in jeder Phase pflegen.

**Antwort muss eine Frage enthalten**
Eine Notbremse nach der Generierung: Enthält Navis Antwort kein Fragezeichen, wird automatisch eines angehängt. Sinnvoll in allen Phasen, die zwingend mit einer Frage enden sollen. Kein Ersatz für eine klare Instruction — nur ein Sicherheitsnetz für Ausreißer.

**Use-Cases einblenden (Wissensbasis-Tab)**
Hängt die Use-Case-Liste aus dem Reiter *Wissensbasis* an den Prompt an, zusammen mit der Anweisung, das Problem des Händlers einem Use-Case zuzuordnen (und ehrlich zu sagen, wenn keiner passt). Wirkt nur in **full**-Phasen. Anhaken, wo Navi einschätzt oder empfiehlt — nicht in reinen Frage-Phasen, dort lenkt es nur ab.

**Tool-Katalog einblenden**
Hängt zusätzlich den Katalog der KI-Tools an, nach Kategorie gruppiert und jeweils mit Link auf die Tool-Seite; dazu die Pflicht, bei einer konkreten Empfehlung den passenden Markdown-Link mitzugeben und keine URLs zu erfinden. Setzt **Use-Cases einblenden** voraus — ohne Use-Cases wird der Katalog gar nicht erst erzeugt. Denn: Es werden nur Tools eingeblendet, deren Kategorie bei mindestens einem Use-Case vorkommt.

**Offene Anliegen am Ende dieser Phase anhängen**
Hat der Händler im Gespräch weitere Themen erwähnt, die noch nicht behandelt wurden (Navi führt darüber intern eine Liste), wird an die Instruction dieser Phase ein Zusatz angehängt: Navi soll am Ende freundlich fragen, ob eines dieser Themen noch dran soll. Gedacht für die Abschlussphase. Gibt es keine offenen Anliegen, passiert nichts.

**Tools** (Häkchen `ask_question`, `ask_clarification`, `ask_yes_no`)
Legt fest, **wie** Navi in dieser Phase antworten darf:

| Häkchen | Wirkung |
|---|---|
| *keins gesetzt* | Navi antwortet als freier Fließtext. Richtig für Berater-Phasen (Einschätzung, Empfehlung, Abschluss). |
| `ask_question` | Eine offene Frage. Der Text wird ganz normal ausgegeben — für den Händler sieht das aus wie eine gewöhnliche Nachricht. |
| `ask_clarification` | Frage **mit vorgegebenen Antwortoptionen** als anklickbare Auswahl. |
| `ask_yes_no` | Frage als Ja/Nein-Auswahl. |

Wichtig: Sobald **mindestens ein Häkchen** gesetzt ist, ist freier Text in dieser Phase strukturell ausgeschlossen — Navi *muss* eines der erlaubten Werkzeuge benutzen. Mehrere Häkchen bedeuten „eines davon, Navi wählt". Genau das verhindert, dass eine Frage-Phase in einen Ratschlag abrutscht.

**Checkliste (workPlan)**
Die Punkte, die Navi in dieser Phase geklärt haben muss, bevor es weitergehen darf. Jeder Punkt wird zu einem **Slot**: Navi trägt selbst ein, was es dazu erfahren hat, und die Oberfläche zeigt dir live `[offen]` bzw. `[bekannt]`.

Der Effekt hängt an der Persona:

- **narrow-Phase mit mindestens einem Punkt:** Es entsteht ein **Slot-Gate**. Der Weiterschritt in die nächste Phase wird vom Programm geprüft, nicht vom Modell eingeschätzt — solange auch nur ein Punkt offen ist, wird ein Phasenwechsel schlicht abgelehnt, und Navi muss weiterfragen. Der Editor blendet in diesem Fall den Hinweis *„erster Übergang ist das Slot-Gate"* ein.
- **full-Phase oder leere Checkliste:** Kein Gate. Die Punkte dienen dann nur noch als Orientierung im Prompt und in der Anzeige.

Formuliere die Punkte als überprüfbaren Zustand („Online-Präsenz bekannt — auch ‚nur stationär' ist gültig"), nicht als Aufgabe („nach Online-Präsenz fragen"). Und halte sie so knapp wie möglich: Jeder Punkt ist eine Hürde, die das Gespräch verlängert.

Ein Achtung noch: Änderst du den **Wortlaut** eines Punktes, ändert sich seine interne ID mit. In bereits laufenden Gesprächen gilt der Punkt dann wieder als offen.

**Übergänge**
Wohin es von dieser Phase aus gehen kann. Jeder Übergang hat drei Teile:

| Feld | Bedeutung |
|---|---|
| Auswahlliste | Die **Zielphase**. Nur vorhandene Phasen sind wählbar. |
| Kurzbeschriftung (UI) | Reiner Anzeigetext im Navi-Panel („Problem genannt"). Wirkt nicht auf das Verhalten. |
| Bedingung | Der Text, an dem ein separater Klassifizierer erkennt, ob dieser Übergang greift. Beschreibe **beobachtbares Verhalten des Händlers** („Nutzer beschreibt ein konkretes Problem mit erkennbarem Kontext"), nicht eine Absicht. |

**Die Reihenfolge der Übergänge ist bedeutsam** — aber nur bei narrow-Phasen mit Checkliste: Dort ist der **erste** Übergang der automatische Weiterschritt (das Slot-Gate); seine Bedingung wird gar nicht ausgewertet, es zählt allein, ob alle Punkte gefüllt sind. Alle **weiteren** Übergänge sind Ausnahmen (Themenwechsel, Missverständnis) und werden vom Klassifizierer nach ihrer Bedingung geprüft.

Bei full-Phasen gibt es kein Gate: Dort entscheidet der Klassifizierer über *alle* Übergänge anhand der Bedingungen.

**Speichern:** Der Knopf **Phasen speichern** unten. Das Programm prüft vorher und lehnt bei Fehlern komplett ab — doppelte Phasen-ID, fehlende Startphase `greeting`, ein Übergang auf eine nicht existierende Phase, oder eine narrow-Phase mit Checkliste, aber ganz ohne Übergang (dem Slot-Gate fehlt dann das Ziel).

### Reiter „Persona"

Hier steht das *Wie* und das *Wer* — einmal zentral, statt in jeder Phase wiederholt.

**Rollenbeschreibung (roleIntro)**
Die Identitäts-Einweisung („Du bist Navi, ein ehrlicher KI-Berater für Einzelhändler …"). Sie steht als **erster Absatz** im Prompt jeder **full**-Phase. **narrow**-Phasen bekommen sie bewusst nicht — genau das macht den Schutz vor voreiliger Beratung aus. Darf nicht leer sein.

**Full-Persona-Regeln (Berater-Phasen)**
Eine Liste von Verhaltensregeln, die in jeder full-Phase hinter der Rollenbeschreibung landen: Tonfall, Umgang mit Fachbegriffen, Ehrlichkeit statt Verkaufe, Antwortlänge. Jede Regel ist ein eigener Eintrag — das hält sie im Prompt sauber getrennt und macht sie einzeln löschbar.

**Narrow-Persona-Regeln (Frage-Phasen)**
Dasselbe für die Frage-Phasen, und dort das **einzige** Verhaltensfundament (keine Rolle, keine Wissensbasis). Hier gehören Dinge hin wie „stelle genau eine Frage", „keine Bewertung", „keine Lösungsvorschläge".

Leere Regeln werden beim Speichern abgelehnt — lösche eine Regel lieber über 🗑️, statt ihr Feld zu leeren.

### Reiter „Hinweise"

Optionale Themen, die Navi **einmalig** im Gespräch unterbringen soll, sobald sie natürlich hineinpassen. Nur in **full**-Phasen; narrow-Phasen sehen sie nicht.

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
