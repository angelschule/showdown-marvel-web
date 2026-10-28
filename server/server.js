const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { KATEGORIEN, kategorieIndex } = require('./karte');
const { alleHelden } = require('./heldendaten');
const { Spiel, SpielerZustand } = require('./spiel');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'docs')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const MAX_SPIELER = 4;
const RUNDEN_PAUSE_MS = 3500;
const BOT_DENKPAUSE_MS = 900;

// Einmal aufgebaut und stateless - kann von allen gleichzeitig laufenden Raeumen
// sicher wiederverwendet werden.
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

function botKategorie(karte) {
  let beste = KATEGORIEN[0];
  let bestWert = karte.wert(beste);
  for (const kategorie of KATEGORIEN) {
    const wert = karte.wert(kategorie);
    if (wert > bestWert) {
      bestWert = wert;
      beste = kategorie;
    }
  }
  return beste;
}

function botNutztUltimate() {
  return Math.random() < 0.3; // einfache Heuristik: 30% Chance, wenn verfuegbar
}

function lobbyDaten(raum) {
  return {
    code: raum.code,
    hostIndex: raum.hostIndex,
    spieler: raum.spieler.map((s) => ({ name: s.zustand.name, istBot: s.zustand.istBot })),
    maxSpieler: MAX_SPIELER,
  };
}

function sendeAnSitz(raum, index, ereignis, daten) {
  const socketId = raum.spieler[index]?.socketId;
  if (!socketId) return; // Bots haben keinen Socket
  io.to(socketId).emit(ereignis, daten);
}

function sendeAnAlle(raum, ereignis, daten) {
  raum.spieler.forEach((_, i) => sendeAnSitz(raum, i, ereignis, daten));
}

function staende(raum) {
  return raum.spieler.map((s) => ({ name: s.zustand.name, anzahl: s.zustand.anzahlKarten() }));
}

function naechsterAktiverIndex(raum, von) {
  const n = raum.spieler.length;
  for (let schritt = 1; schritt <= n; schritt += 1) {
    const kandidat = (von + schritt) % n;
    if (raum.spieler[kandidat].zustand.hatKarten()) return kandidat;
  }
  return von;
}

function naechsterZug(raum) {
  raum.phase = 'warteAufKategorie';
  const aktiv = raum.spieler[raum.aktiverIndex];
  sendeAnSitz(raum, raum.aktiverIndex, 'deinZug', {
    eigeneKarte: kartenDaten(aktiv.zustand.obersteKarte()),
    kategorien: KATEGORIEN,
    index: raum.aktiverIndex,
  });
  raum.spieler.forEach((_, i) => {
    if (i !== raum.aktiverIndex) {
      sendeAnSitz(raum, i, 'wartenAufSpieler', { name: aktiv.zustand.name, index: raum.aktiverIndex });
    }
  });

  if (aktiv.zustand.istBot) {
    setTimeout(() => {
      if (raum.phase !== 'warteAufKategorie') return; // Raum wurde inzwischen aufgeloest/beendet
      const kategorie = botKategorie(aktiv.zustand.obersteKarte());
      raum.ausgewaehlteKategorie = kategorie;
      starteUltimatePhase(raum);
    }, BOT_DENKPAUSE_MS);
  }
}

function starteUltimatePhase(raum) {
  raum.phase = 'warteAufUltimate';
  raum.antworten = {};

  raum.spieler.forEach((s, i) => {
    if (!s.zustand.hatKarten() || !s.zustand.istUltimateVerfuegbar()) return;
    if (s.zustand.istBot) {
      raum.antworten[i] = botNutztUltimate();
    } else {
      raum.antworten[i] = null;
      sendeAnSitz(raum, i, 'ultimateAbfrage', {});
    }
  });

  versucheRundeAufzuloesen(raum);
}

function versucheRundeAufzuloesen(raum) {
  if (raum.phase !== 'warteAufUltimate') return;
  const nochOffen = Object.values(raum.antworten).some((wert) => wert === null);
  if (nochOffen) return;

  let ultimateSpielerIndex = null;
  for (const [index, ja] of Object.entries(raum.antworten)) {
    if (ja === true) {
      ultimateSpielerIndex = Number(index);
      break;
    }
  }

  let ergebnis;
  try {
    ergebnis = raum.spiel.spieleRunde(raum.ausgewaehlteKategorie, ultimateSpielerIndex);
  } catch (e) {
    sendeAnAlle(raum, 'fehler', { nachricht: e.message });
    naechsterZug(raum);
    return;
  }

  const payload = {
    kategorie: ergebnis.kategorie,
    ergebnisse: ergebnis.ergebnisse.map((e) => ({
      spielerIndex: e.spielerIndex,
      karte: kartenDaten(e.karte),
      wert: e.wert,
    })),
    gewinnerIndex: ergebnis.gewinnerIndex,
    assembleBonusAktiv: ergebnis.assembleBonusAktiv,
    ultimateMeldung: ergebnis.ultimateMeldung,
    staende: staende(raum),
    runde: raum.spiel.runde,
  };
  sendeAnAlle(raum, 'rundenErgebnis', payload);

  raum.phase = 'rundeAufgeloest';
  raum.aktiverIndex = naechsterAktiverIndex(raum, raum.aktiverIndex);

  setTimeout(() => {
    if (!raeume.has(raum.code)) return;
    if (raum.spiel.istVorbei()) {
      raum.phase = 'vorbei';
      const gewinnerIndex = raum.spiel.gewinnerIndex();
      sendeAnAlle(raum, 'spielVorbei', {
        gewinnerIndex,
        rangliste: raum.spiel.rangliste().map((s) => ({ name: s.name, anzahl: s.anzahlKarten() })),
      });
    } else {
      naechsterZug(raum);
    }
  }, RUNDEN_PAUSE_MS);
}

function starteSpiel(raum) {
  const deck = mischen(STAMMKARTEN);
  deck.forEach((karte, i) => {
    raum.spieler[i % raum.spieler.length].zustand.stapel.push(karte);
  });

  raum.spiel = new Spiel(raum.spieler.map((s) => s.zustand));
  raum.aktiverIndex = 0;

  raum.spieler.forEach((_, i) => {
    sendeAnSitz(raum, i, 'spielGestartet', {
      meinIndex: i,
      spieler: raum.spieler.map((s) => ({
        name: s.zustand.name,
        istBot: s.zustand.istBot,
        anzahl: s.zustand.anzahlKarten(),
      })),
    });
  });

  naechsterZug(raum);
}

io.on('connection', (socket) => {
  socket.on('botSpielStarten', ({ name } = {}) => {
    const code = erzeugeRaumCode();
    const raum = {
      code,
      hostIndex: 0,
      spieler: [
        { socketId: socket.id, zustand: new SpielerZustand(name || 'Spieler 1', false) },
        { socketId: null, zustand: new SpielerZustand('Bot', true) },
      ],
      spiel: null,
      phase: 'lobby',
      aktiverIndex: 0,
      ausgewaehlteKategorie: null,
      antworten: null,
    };
    raeume.set(code, raum);
    socket.join(code);
    socket.data.raumCode = code;
    socket.data.sitz = 0;
    starteSpiel(raum);
  });

  socket.on('raumErstellen', ({ name } = {}) => {
    const code = erzeugeRaumCode();
    const raum = {
      code,
      hostIndex: 0,
      spieler: [{ socketId: socket.id, zustand: new SpielerZustand(name || 'Spieler 1', false) }],
      spiel: null,
      phase: 'lobby',
      aktiverIndex: 0,
      ausgewaehlteKategorie: null,
      antworten: null,
    };
    raeume.set(code, raum);
    socket.join(code);
    socket.data.raumCode = code;
    socket.data.sitz = 0;
    socket.emit('raumErstellt', { code, meinIndex: 0 });
    sendeAnAlle(raum, 'lobbyUpdate', lobbyDaten(raum));
  });

  socket.on('raumBeitreten', ({ code, name } = {}) => {
    const raum = raeume.get((code || '').toUpperCase());
    if (!raum) {
      socket.emit('fehler', { nachricht: 'Raum nicht gefunden. Code pruefen.' });
      return;
    }
    if (raum.phase !== 'lobby') {
      socket.emit('fehler', { nachricht: 'Dieses Spiel hat schon begonnen.' });
      return;
    }
    if (raum.spieler.length >= MAX_SPIELER) {
      socket.emit('fehler', { nachricht: 'Dieser Raum ist bereits voll.' });
      return;
    }

    const index = raum.spieler.length;
    raum.spieler.push({ socketId: socket.id, zustand: new SpielerZustand(name || `Spieler ${index + 1}`, false) });
    socket.join(raum.code);
    socket.data.raumCode = raum.code;
    socket.data.sitz = index;

    socket.emit('raumBeigetreten', { code: raum.code, meinIndex: index });
    sendeAnAlle(raum, 'lobbyUpdate', lobbyDaten(raum));
  });

  socket.on('botHinzufuegen', () => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'lobby' || socket.data.sitz !== raum.hostIndex) return;
    if (raum.spieler.length >= MAX_SPIELER) return;
    const botNummer = raum.spieler.filter((s) => s.zustand.istBot).length + 1;
    raum.spieler.push({ socketId: null, zustand: new SpielerZustand(`Bot ${botNummer}`, true) });
    sendeAnAlle(raum, 'lobbyUpdate', lobbyDaten(raum));
  });

  socket.on('spielStarten', () => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'lobby' || socket.data.sitz !== raum.hostIndex) return;
    if (raum.spieler.length < 2) {
      socket.emit('fehler', { nachricht: 'Mindestens 2 Spieler noetig.' });
      return;
    }
    starteSpiel(raum);
  });

  socket.on('kategorieWaehlen', ({ kategorie } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'warteAufKategorie' || socket.data.sitz !== raum.aktiverIndex) return;
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
    const sitz = socket.data.sitz;
    if (!(sitz in raum.antworten) || raum.antworten[sitz] !== null) return;
    raum.antworten[sitz] = !!ja;
    versucheRundeAufzuloesen(raum);
  });

  socket.on('disconnect', () => {
    const code = socket.data.raumCode;
    if (!code) return;
    const raum = raeume.get(code);
    if (!raum) return;

    if (raum.phase === 'lobby') {
      raum.spieler = raum.spieler.filter((s) => s.socketId !== socket.id);
      if (raum.spieler.length === 0) {
        raeume.delete(code);
      } else {
        sendeAnAlle(raum, 'lobbyUpdate', lobbyDaten(raum));
      }
      return;
    }

    sendeAnAlle(raum, 'spielerVerbindungGetrennt', { name: raum.spieler[socket.data.sitz]?.zustand.name });
    raeume.delete(code);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SHOWDOWN-Server laeuft auf Port ${PORT}`);
});
