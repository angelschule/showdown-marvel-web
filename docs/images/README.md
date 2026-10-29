# Kartenbilder

Hier kannst du echte Bilder fuer die Karten ablegen. Jede Karte sucht automatisch nach
einer Datei namens `<bildSchluessel>.<endung>` in diesem Ordner - der Code probiert dabei
der Reihe nach `.jpg`, `.jpeg`, `.png` und `.webp` durch, bis eine davon existiert. Du musst
also nur den Dateinamen treffen, das Format ist egal, z. B.:

- `iron_man.png`
- `captain_america.jpg`
- `avengers.png` (Team-Karte)

Den exakten `bildSchluessel` einer Karte siehst du, wenn ein Bild fehlt (Platzhalter-Symbol
wird angezeigt) - oder leite ihn aus dem Namen ab: klein geschrieben, Leerzeichen zu `_`,
Umlaute zu ae/oe/ue, Sonderzeichen entfernt.

Fehlt jede Endung fuer eine Karte, zeigt sie automatisch einen abstrakten Platzhalter (kein
Marken-Logo, kein echtes Marvel-Bild) - kein Code muss dafuer angepasst werden.

Empfohlenes Format: JPG, PNG oder WebP, Hochformat oder quadratisch, mind. 400x400px.

**Wichtig:** Lade hier nur Bilder hoch, die du selbst erstellt hast oder fuer die du die
Rechte hast (eigene Zeichnungen, lizenzfreie Stock-Bilder, KI-generierte generische
Superhelden-Illustrationen). Keine echten Marvel-Comic-/Film-Bilder - das waere eine
Urheberrechtsverletzung, auch in einem privaten Repo.

## Artwork fuer den Ladebildschirm (Live-Animation)

Lege eine kurze, loop-faehige Videodatei hier als `lade-artwork.mp4` ab
(`docs/images/lade-artwork.mp4`) - sie wird auf dem Ladebildschirm automatisch
stumm und in Dauerschleife abgespielt (siehe `#lade-artwork-video` in
`index.html`). Bis die Datei existiert, bleibt dort einfach der
Platzhalter-Icon mit Schimmer-Effekt sichtbar, kein Code muss angepasst werden.

## Hintergrundmusik

Lege eine MP3-Datei unter `docs/audio/musik.mp3` ab (Ordner `audio` muss neu
angelegt werden) - der Musik-Knopf im Menue oben rechts spielt sie dann in
Dauerschleife ab, mit dem Lautstaerke-Regler daneben. Ohne Datei bleibt der
Knopf einfach wirkungslos (kein Fehler).
