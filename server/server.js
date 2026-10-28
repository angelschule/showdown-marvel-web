const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { KATEGORIEN, kategorieIndex } = require('./karte');
const { alleHelden } = require('./heldendaten');
const { Spiel, SpielerZustand } = require('./spiel');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Einmal aufgebaut und stateless (keine Ultimate-Flags mehr auf der Karte selbst) -
// kann darum von allen gleichzeitig laufenden Raeumen sicher wiederverwendet werden.
const STAMMKARTEN = alleHelden();

const raeume = new Map();

function mischen(array) {
  const kopie = [...array];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

function erzeugeRaumCode() {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne leicht verwechselbare Buchstaben
  let code;
  do {
    code = Array.from({ length: 4 }, () => zeichen[Math.floor(Math.random() * zeichen.length)]).join('');
  } while (raeume.has(code));
  return code;
}

function gegenseite(seite) {
  return seite === 'A' ? 'B' : 'A';
}

function kartenDaten(karte) {
  return {
    name: karte.name,
    typSymbol: karte.typSymbol(),
    farbe: karte.farbe(),
    bildSchluessel: karte.bildSchluessel,
    werte: KATEGORIEN.map((kategorie) => karte.wert(kategorie)),
    gesamtstaerke: karte.gesamtstaerke(),
  };
}

function sendeZugAnAktiven(raum) {
  const aktiv = raum.aktiverSeite;
  const wartend = gegenseite(aktiv);
  const spielerAktiv = raum.spieler[aktiv];
  io.to(raum.sockets[aktiv]).emit('deinZug', {
    eigeneKarte: kartenDaten(spielerAktiv.obersteKarte()),
    kategorien: KATEGORIEN,
  });
  io.to(raum.sockets[wartend]).emit('wartenAufGegner', {
    gegnerName: spielerAktiv.name,
  });
}

function starteUltimatePhase(raum) {
  raum.phase = 'warteAufUltimate';
  raum.antworten = { A: null, B: null };
  for (const seite of ['A', 'B']) {
    if (!raum.spieler[seite].istUltimateVerfuegbar()) {
      raum.antworten[seite] = false;
    } else {
      io.to(raum.sockets[seite]).emit('ultimateAbfrage');
    }
  }
  versucheRundeAufzuloesen(raum);
}

function versucheRundeAufzuloesen(raum) {
  if (raum.phase !== 'warteAufUltimate') return;
  if (raum.antworten.A === null || raum.antworten.B === null) return; // noch nicht beide Antworten da

  let ultimateSeite = null;
  if (raum.antworten.A === true) ultimateSeite = 'A';
  else if (raum.antworten.B === true) ultimateSeite = 'B';
  const ultimateSpieler = ultimateSeite ? raum.spieler[ultimateSeite] : null;

  let ergebnis;
  try {
    ergebnis = raum.spiel.spieleRunde(raum.ausgewaehlteKategorie, ultimateSpieler);
  } catch (e) {
    io.to(raum.sockets.A).emit('fehler', { nachricht: e.message });
    io.to(raum.sockets.B).emit('fehler', { nachricht: e.message });
    raum.phase = 'warteAufKategorie';
    sendeZugAnAktiven(raum);
    return;
  }

  const gewinnerSeite = ergebnis.gewinner === raum.spieler.A ? 'A' : ergebnis.gewinner === raum.spieler.B ? 'B' : null;
  const payload = {
    karteA: kartenDaten(ergebnis.karteA),
    karteB: kartenDaten(ergebnis.karteB),
    kategorie: ergebnis.kategorie,
    gewinnerSeite,
    gleichstand: ergebnis.gleichstand,
    assembleBonusAktiv: ergebnis.assembleBonusAktiv,
    ultimateMeldung: ergebnis.ultimateMeldung,
    staende: { A: raum.spieler.A.anzahlKarten(), B: raum.spieler.B.anzahlKarten() },
    runde: raum.spiel.runde,
  };
  io.to(raum.sockets.A).emit('rundenErgebnis', payload);
  io.to(raum.sockets.B).emit('rundenErgebnis', payload);

  raum.aktiverSeite = gegenseite(raum.aktiverSeite);
  raum.phase = 'rundeAufgeloest';

  // Kurze Pause, damit beide Spieler das Ergebnis lesen koennen, bevor der naechste Zug beginnt.
  setTimeout(() => {
    if (raum.spiel.istVorbei()) {
      raum.phase = 'vorbei';
      const spielGewinner = raum.spiel.gewinner();
      const gesamtGewinnerSeite = spielGewinner === raum.spieler.A ? 'A' : spielGewinner === raum.spieler.B ? 'B' : null;
      io.to(raum.sockets.A).emit('spielVorbei', { gewinnerSeite: gesamtGewinnerSeite });
      io.to(raum.sockets.B).emit('spielVorbei', { gewinnerSeite: gesamtGewinnerSeite });
    } else {
      raum.phase = 'warteAufKategorie';
      sendeZugAnAktiven(raum);
    }
  }, 3500);
}

io.on('connection', (socket) => {
  socket.on('raumErstellen', ({ name } = {}) => {
    const code = erzeugeRaumCode();
    const raum = {
      code,
      sockets: { A: socket.id, B: null },
      spieler: { A: new SpielerZustand(name || 'Spieler 1'), B: null },
      spiel: null,
      phase: 'warteAufSpieler2',
      aktiverSeite: 'A',
      ausgewaehlteKategorie: null,
      antworten: null,
    };
    raeume.set(code, raum);
    socket.join(code);
    socket.data.raumCode = code;
    socket.data.seite = 'A';
    socket.emit('raumErstellt', { code });
  });

  socket.on('raumBeitreten', ({ code, name } = {}) => {
    const raum = raeume.get((code || '').toUpperCase());
    if (!raum) {
      socket.emit('fehler', { nachricht: 'Raum nicht gefunden. Code pruefen.' });
      return;
    }
    if (raum.sockets.B) {
      socket.emit('fehler', { nachricht: 'Dieser Raum ist bereits voll.' });
      return;
    }

    raum.sockets.B = socket.id;
    raum.spieler.B = new SpielerZustand(name || 'Spieler 2');
    socket.join(raum.code);
    socket.data.raumCode = raum.code;
    socket.data.seite = 'B';

    const deck = mischen(STAMMKARTEN);
    deck.forEach((karte, i) => {
      (i % 2 === 0 ? raum.spieler.A : raum.spieler.B).stapel.push(karte);
    });
    raum.spiel = new Spiel(raum.spieler.A, raum.spieler.B);
    raum.phase = 'warteAufKategorie';

    io.to(raum.sockets.A).emit('spielGestartet', {
      eigenerName: raum.spieler.A.name,
      gegnerName: raum.spieler.B.name,
      kartenAnzahl: raum.spieler.A.anzahlKarten(),
    });
    io.to(raum.sockets.B).emit('spielGestartet', {
      eigenerName: raum.spieler.B.name,
      gegnerName: raum.spieler.A.name,
      kartenAnzahl: raum.spieler.B.anzahlKarten(),
    });

    sendeZugAnAktiven(raum);
  });

  socket.on('kategorieWaehlen', ({ kategorie } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'warteAufKategorie' || socket.data.seite !== raum.aktiverSeite) return;
    try {
      kategorieIndex(kategorie);
    } catch (e) {
      socket.emit('fehler', { nachricht: e.message });
      return;
    }
    raum.ausgewaehlteKategorie = kategorie;
    starteUltimatePhase(raum);
  });

  socket.on('ultimateAntwort', ({ ja } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'warteAufUltimate') return;
    const seite = socket.data.seite;
    if (raum.antworten[seite] !== null) return;
    raum.antworten[seite] = !!ja;
    versucheRundeAufzuloesen(raum);
  });

  socket.on('disconnect', () => {
    const code = socket.data.raumCode;
    if (!code) return;
    const raum = raeume.get(code);
    if (!raum) return;
    const andereSeite = gegenseite(socket.data.seite);
    if (raum.sockets[andereSeite]) {
      io.to(raum.sockets[andereSeite]).emit('gegnerVerbindungGetrennt');
    }
    raeume.delete(code);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SHOWDOWN-Server laeuft auf Port ${PORT}`);
});
