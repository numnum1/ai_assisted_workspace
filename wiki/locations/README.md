---
type: index
---

# Locations

Lege hier pro Ort/Schauplatz eine eigene Datei an.

## Dateiname

`ortsname.md` (Kleinbuchstaben, Bindestriche statt Leerzeichen).

## Frontmatter-Schema

```yaml
---
id: ortsname                  # eindeutige ID, kebab-case
type: location
aliases: [alterName]          # alternative Bezeichnungen
tags: [city, ruin, forest]    # Schlagwörter für Suche und Filterung
summary: >                    # Ein-Satz-Zusammenfassung für die KI (wichtig, kurz halten!)
  Kurzbeschreibung in einem Satz.
---
```

## Beispiel

```yaml
---
id: der-blaue-turm
type: location
aliases: [Blauer Turm, Wachturm am See]
tags: [turm, see, verlassen, nordreich]
summary: >
  Verlassener Wachturm am Nordrand des Silbersees, früher Sitz der Türmerwache.
---

## Beschreibung
Achteckiger Sandsteinturm, drei Stockwerke, Dach eingestürzt. Der blaue Schimmer des Steins
entsteht durch Mineraleinschlüsse, nicht durch Magie.

## Bedeutung
Gilt als neutraler Treffpunkt zwischen den verfeindeten Clans.
```
