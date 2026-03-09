---
type: index
---

# Organizations

Lege hier pro Gruppe/Organisation/Fraktion eine eigene Datei an.

## Dateiname

`organisationsname.md` (Kleinbuchstaben, Bindestriche statt Leerzeichen).

## Frontmatter-Schema

```yaml
---
id: org-name                  # eindeutige ID, kebab-case
type: organization
aliases: [Kurzname, Spitzname]
tags: [faction, secret, guild] # Schlagwörter für Suche und Filterung
summary: >                    # Ein-Satz-Zusammenfassung für die KI (wichtig, kurz halten!)
  Kurzbeschreibung in einem Satz.
---
```

## Beispiel

```yaml
---
id: orden-der-stillen-waechter
type: organization
aliases: [Die Stillen, Wächter]
tags: [orden, geheim, nordreich]
summary: >
  Geheime Bruderschaft, die seit Jahrhunderten über das Gleichgewicht zwischen den Clans wacht.
---

## Ziel
Verhinderung eines erneuten Bürgerkriegs durch Kontrolle strategischer Informationen.

## Struktur
Angeführt von einem namenlosen Meister, drei Ränge: Beobachter, Bote, Wächter.

## Bekannte Mitglieder
- Lena Thorin (Beobachterin, verdeckt in der Hauptstadt)
```
