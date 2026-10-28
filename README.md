# SHOWDOWN - Marvel Quartett (Web, Online-Multiplayer)

**Live spielen:** https://angelschule.github.io/showdown-marvel-web/
(Server auf Render: https://showdown-marvel-web.onrender.com - schlaeft nach Inaktivitaet ein,
erster Verbindungsaufbau kann dann 30-60s dauern)

Browser-Version der Konsolen-App unter `Projekt/ShowdownMarvelQuartett` - gleiche Regeln,
gleiche Charaktere, jetzt mit 2-4 Spielern über das Internet statt an einer Konsole,
plus ein Solo-Modus gegen einen Bot.

Reines Spass-Nebenprojekt: zaehlt nicht fuer M320 (Konsole) oder M322 (Figma/Papier, kein Code).

## Spielmodi

- **Gegen Bot** - sofortiges 1-gegen-1 gegen eine einfache KI (waehlt die Kategorie, in der
  ihre Karte am staerksten ist; setzt ihr Ultimate mit 30% Zufallschance ein, wenn verfuegbar).
- **Online-Raum (2-4 Spieler)** - der Host erstellt einen Raum, teilt den 4-Buchstaben-Code,
  bis zu 3 weitere Spieler treten bei. Der Host kann leere Plaetze mit Bots auffuellen und
  startet das Spiel manuell, sobald mindestens 2 Spieler da sind.

Bei mehr als 2 Spielern spielen alle noch aktiven Spieler jede Runde gleichzeitig eine Karte;
bei echtem Gleichstand (kein eindeutiger Schurke an der Spitze) wandern alle Karten dieser
Runde in den Pot, die naechste entschiedene Runde gewinnt alles.

**Antwortkarte frei waehlen:** Nur der aktive Spieler, der die Kategorie vorgibt, zieht blind
seine oberste Karte (wie bei einem klassischen Quartett). Alle anderen sehen danach die
Kategorie und duerfen sich frei die staerkste (oder taktisch beste) Karte aus ihrer kompletten
restlichen Hand aussuchen - jede Hand-Karte zeigt sofort ihren Wert in der aktuellen Kategorie.
Der Bot waehlt dabei automatisch seine staerkste Karte fuer die jeweilige Kategorie.

**Power-Grid-Skala:** 1-10 statt der urspruenglichen 1-7 (feinere Abstufung zwischen den
Charakteren). Team-Werte koennen durch "hoechster Wert + 1 pro weiterem Mitglied" deutlich
ueber 10 liegen - das ist beabsichtigt.

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
| 6 Power-Grid-Werte | `Karte.wert()` (Skala 1-7) | `karte.js: wert()` (Skala 1-10) | gleiche Struktur, Web hat feinere Skala |
| Team-Wert = hoechster + 1/Mitglied | `TeamKarte.wert()` | `TeamKarte.wert()` | identisch |
| Schurke gewinnt Gleichstand | `gewinntGleichstand()` | gleich | identisch, getestet |
| Ultimate 1x pro Spiel (pro Spieler) | `Spieler.nutzeUltimate()` | `SpielerZustand.nutzeUltimate()` | identisch |
| ASSEMBLE (3 Siege in Serie = doppelt) | `Spiel.spieleRunde()` | `Spiel.spieleRunde()` | identisch |
| 15 Runden, groesserer Stapel gewinnt | `Spiel.istVorbei()/gewinner()` | gleich | identisch |
| Gegnerkarte bis zur Aufloesung verdeckt | n/a (Konsole zeigt lokal eh beide) | Server sendet nur die eigene Karte | Web ist hier sogar fairer |
| 44 Charaktere | `Heldendaten.java` | `heldendaten.js` | gleiche Charaktere, Werte auf 1-10 umgerechnet |
| Kategorie-Wahl: oberste Karte | gilt fuer beide Spieler | gilt nur fuer den aktiven Waehler | bewusste Web-Erweiterung, siehe oben |
| Antwortkarte frei waehlen | nein (immer oberste Karte) | ja, aus der kompletten Hand | bewusste Web-Erweiterung |

Die Server-Datei validiert Kategorien und Spielzustand genauso wie die Java-Klassen
(ungueltige Kategorie oder zweites Ultimate wirft einen Fehler, der sauber als `fehler`-Event
an den Client zurueckgeht statt das Spiel stillschweigend zu verfaelschen).
