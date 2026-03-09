---
type: index
---

# Characters

Lege hier pro Charakter eine eigene Datei an.

## Dateiname

`vorname-nachname.md` oder `alias.md` (Kleinbuchstaben, Bindestriche statt Leerzeichen).

## Frontmatter-Schema

```yaml
---
id: vorname-nachname          # eindeutige ID, snake_case oder kebab-case
type: character
aliases: [Spitzname, Titel]   # alternative Namen, unter denen der Charakter bekannt ist
tags: [protagonist, mage]     # Schlagwörter für Suche und Filterung
summary: >                    # Ein-Satz-Zusammenfassung für die KI (wichtig, kurz halten!)
  Kurzbeschreibung in einem Satz.
---
```

## Beispiel

```yaml
---
id: mara-voss
type: character
aliases: [Die Erzählerin, Mara]
tags: [protagonist, journalist, berlin]
summary: >
  Investigativjournalistin Mitte 30, sucht die Wahrheit hinter dem Verschwinden ihres Bruders.
---

## Erscheinung
Kurzes, dunkles Haar, trägt immer ein abgenutztes Notizbuch bei sich.

## Persönlichkeit
Hartnäckig, skeptisch, schlechtes Schläferin.

## Hintergrund
Aufgewachsen in Bremen, arbeitet seit 8 Jahren für eine Berliner Onlinezeitung.
```
