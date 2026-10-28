# SHOWDOWN - Marvel Quartett (Web, Online-Multiplayer)

Browser-Version der Konsolen-App unter `Projekt/ShowdownMarvelQuartett` - gleiche Regeln,
gleiche Charaktere, jetzt mit zwei Spielern über das Internet statt an einer Konsole.

Reines Spass-Nebenprojekt: zaehlt nicht fuer M320 (Konsole) oder M322 (Figma/Papier, kein Code).

## Architektur

- `server/` - Node.js + Express + Socket.IO. Haelt den Spielzustand (wer welche Karten hat,
  wer am Zug ist) und validiert jede Aktion ueber dieselbe Spiellogik wie die Java-Version.
  Muss dauerhaft laufen (z. B. auf Render.com), weil GitHub Pages keine Server ausfuehrt.
- `docs/` - reines HTML/CSS/JS, verbindet sich per WebSocket (Socket.IO) zum Server.
  Heisst bewusst `docs/`, weil GitHub Pages diesen Ordnernamen direkt unterstuetzt
  (Settings -> Pages -> Branch `main`, Ordner `/docs`), ohne Workaround.

Warum zwei getrennte Teile? GitHub Pages kann nur Dateien ausliefern, aber online mit
zwei Leuten in Echtzeit spielen braucht einen Server, der beide Browser miteinander verbindet.

## Lokal testen

```bash
cd server
npm install
npm start
```

Dann im Browser `http://localhost:3001` oeffnen - zweimal, in zwei Tabs (oder zwei Geraeten
im selben Netzwerk ueber die lokale IP), um als Spieler 1 und Spieler 2 zu spielen.

## Deployment (damit Freunde von ueberall mitspielen koennen)

### 1. Server hosten (z. B. Render.com, kostenlos)

1. Auf [render.com](https://render.com) mit GitHub-Account anmelden.
2. "New +" -> "Web Service" -> dieses GitHub-Repo auswaehlen.
3. Root Directory: `Projekt/ShowdownWeb/server`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Nach dem Deploy bekommst du eine URL wie `https://showdown-xyz.onrender.com`.

(Kostenloser Plan: der Server "schlaeft" nach Inaktivitaet ein und braucht beim ersten
Verbinden ca. 30-60 Sekunden zum Aufwachen - danach laeuft er normal.)

### 2. Frontend auf GitHub Pages

1. In `docs/app.js` die Zeile mit `DEIN-SERVER.onrender.com` durch deine echte Render-URL ersetzen, committen, pushen.
2. Im GitHub-Repo: Settings -> Pages -> Source: "Deploy from a branch" -> Branch `main`, Ordner `/docs` -> Save.
3. GitHub gibt dir nach ein bis zwei Minuten eine URL wie `https://angelschule.github.io/showdown-marvel-web/` -
   die schickst du deinen Freunden.

## Regel-Abgleich mit der Java-Version

| Regel | Java (Konsole) | Web | Status |
|---|---|---|---|
| 6 Power-Grid-Werte, 1-7 | `Karte.wert()` | `karte.js: wert()` | identisch |
| Team-Wert = hoechster + 1/Mitglied | `TeamKarte.wert()` | `TeamKarte.wert()` | identisch |
| Schurke gewinnt Gleichstand | `gewinntGleichstand()` | gleich | identisch, getestet |
| Ultimate 1x pro Spiel (pro Spieler) | `Spieler.nutzeUltimate()` | `SpielerZustand.nutzeUltimate()` | identisch |
| ASSEMBLE (3 Siege in Serie = doppelt) | `Spiel.spieleRunde()` | `Spiel.spieleRunde()` | identisch |
| 15 Runden, groesserer Stapel gewinnt | `Spiel.istVorbei()/gewinner()` | gleich | identisch |
| Gegnerkarte bis zur Aufloesung verdeckt | n/a (Konsole zeigt lokal eh beide) | Server sendet nur die eigene Karte | Web ist hier sogar fairer |
| 44 Charaktere, gleiche Werte | `Heldendaten.java` | `heldendaten.js` | 1:1 abgeschrieben |

Die Server-Datei validiert Kategorien und Spielzustand genauso wie die Java-Klassen
(ungueltige Kategorie oder zweites Ultimate wirft einen Fehler, der sauber als `fehler`-Event
an den Client zurueckgeht statt das Spiel stillschweigend zu verfaelschen).
