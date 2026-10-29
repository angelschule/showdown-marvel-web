const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { KATEGORIEN, kategorieIndex } = require('./karte');
const { alleHelden } = require('./heldendaten');
const { Spiel, SpielerZustand, HAND_GROESSE } = require('./spiel');

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
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
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

function besteKategorieFuer(karte) {
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

function botWaehltKarteUndKategorie(hand) {
  let besteKarte = hand[0];
  let besteKategorie = besteKategorieFuer(besteKarte);
  let bestWert = besteKarte.wert(besteKategorie);
  for (const karte of hand) {
    const kategorie = besteKategorieFuer(karte);
    const wert = karte.wert(kategorie);
    if (wert > bestWert) {
      bestWert = wert;
      besteKarte = karte;
      besteKategorie = kategorie;
    }
  }
  return { karte: besteKarte, kategorie: besteKategorie };
}

function botWaehltAntwortkarte(hand, kategorie) {
  let beste = hand[0];
  let bestWert = beste.wert(kategorie);
  for (const karte of hand) {
    const wert = karte.wert(kategorie);
    if (wert > bestWert) {
      bestWert = wert;
      beste = karte;
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

function sendeAnAlleAusser(raum, ausgenommenIndex, ereignis, daten) {
  raum.spieler.forEach((_, i) => {
    if (i !== ausgenommenIndex) sendeAnSitz(raum, i, ereignis, daten);
  });
}

function staende(raum) {
  return raum.spieler.map((s) => ({
    name: s.zustand.name,
    anzahl: s.zustand.gesamtAnzahlKarten(),
    handAnzahl: s.zustand.anzahlHand(),
    nachziehAnzahl: s.zustand.anzahlNachziehstapel(),
    gewonnenAnzahl: s.zustand.anzahlGewonnen(),
  }));
}

function naechsterAktiverIndex(raum, von) {
  const n = raum.spieler.length;
  for (let schritt = 1; schritt <= n; schritt += 1) {
    const kandidat = (von + schritt) % n;
    if (raum.spieler[kandidat].zustand.hatSpielbareKarten()) return kandidat;
  }
  return von;
}

// ---------- Schritt 1: aktiver Spieler waehlt eine Karte aus seiner Hand ----------

function naechsterZug(raum) {
  raum.phase = 'warteAufEigeneKarte';
  raum.kartenAuswahl = new Map();
  const aktiv = raum.spieler[raum.aktiverIndex];

  sendeAnSitz(raum, raum.aktiverIndex, 'waehleEigeneKarte', {
    hand: aktiv.zustand.hand.map(kartenDaten),
  });
  raum.spieler.forEach((_, i) => {
    if (i !== raum.aktiverIndex) {
      sendeAnSitz(raum, i, 'wartenAufSpieler', { name: aktiv.zustand.name, index: raum.aktiverIndex });
    }
  });

  if (aktiv.zustand.istBot) {
    setTimeout(() => {
      if (raum.phase !== 'warteAufEigeneKarte') return;
      const { karte, kategorie } = botWaehltKarteUndKategorie(aktiv.zustand.hand);
      waehleEigeneKarte(raum, karte.name);
      // Kleine zusaetzliche Pause, damit die Kategoriewahl des Bots nicht
      // im selben Tick wie die Kartenwahl passiert.
      setTimeout(() => {
        if (raum.phase !== 'warteAufKategorie') return;
        waehleKategorie(raum, kategorie);
      }, BOT_DENKPAUSE_MS);
    }, BOT_DENKPAUSE_MS);
  }
}

function waehleEigeneKarte(raum, kartenName) {
  if (raum.phase !== 'warteAufEigeneKarte') return;
  const aktiv = raum.spieler[raum.aktiverIndex];
  const karte = aktiv.zustand.entferneAusHand(kartenName);
  if (!karte) return;
  raum.aktiveKarte = karte;
  raum.phase = 'warteAufKategorie';
  sendeAnSitz(raum, raum.aktiverIndex, 'waehleKategorieFuerKarte', {
    karte: kartenDaten(karte),
    kategorien: KATEGORIEN,
  });
  sendeAnAlle(raum, 'kartePlatziert', { spielerIndex: raum.aktiverIndex });
}

// ---------- Schritt 2: aktiver Spieler waehlt die Kategorie fuer diese Karte ----------

function waehleKategorie(raum, kategorie) {
  if (raum.phase !== 'warteAufKategorie') return;
  raum.ausgewaehlteKategorie = kategorie;
  raum.kartenAuswahl.set(raum.aktiverIndex, raum.aktiveKarte);
  raum.aktiveKarte = null;

  // Alle anderen aktiven Spieler duerfen jetzt frei aus ihrer Hand antworten.
  raum.phase = 'warteAufAntwortkarten';
  raum.antwortenAusstehend = new Set();

  raum.spieler.forEach((s, i) => {
    if (i === raum.aktiverIndex || !s.zustand.hatSpielbareKarten()) return;
    raum.antwortenAusstehend.add(i);
    if (s.zustand.istBot) {
      setTimeout(() => {
        if (raum.phase !== 'warteAufAntwortkarten' || !raum.antwortenAusstehend.has(i)) return;
        const karte = botWaehltAntwortkarte(s.zustand.hand, kategorie);
        waehleAntwortkarte(raum, i, karte.name);
      }, BOT_DENKPAUSE_MS);
    } else {
      sendeAnSitz(raum, i, 'waehleAntwortkarte', {
        kategorie,
        kategorien: KATEGORIEN,
        hand: s.zustand.hand.map(kartenDaten),
      });
    }
  });

  if (raum.antwortenAusstehend.size === 0) {
    starteUltimatePhase(raum);
  }
}

function waehleAntwortkarte(raum, index, kartenName) {
  if (raum.phase !== 'warteAufAntwortkarten' || !raum.antwortenAusstehend.has(index)) return;
  const karte = raum.spieler[index].zustand.entferneAusHand(kartenName);
  if (!karte) return;
  raum.kartenAuswahl.set(index, karte);
  raum.antwortenAusstehend.delete(index);
  sendeAnAlle(raum, 'kartePlatziert', { spielerIndex: index });

  if (raum.antwortenAusstehend.size === 0) {
    starteUltimatePhase(raum);
  }
}

function starteUltimatePhase(raum) {
  raum.phase = 'warteAufUltimate';
  raum.antworten = {};

  for (const [index] of raum.kartenAuswahl) {
    const s = raum.spieler[index].zustand;
    if (!s.istUltimateVerfuegbar()) continue;
    if (s.istBot) {
      raum.antworten[index] = botNutztUltimate();
    } else {
      raum.antworten[index] = null;
      sendeAnSitz(raum, index, 'ultimateAbfrage', {});
    }
  }

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
    ergebnis = raum.spiel.loeseRundeAuf(raum.ausgewaehlteKategorie, raum.kartenAuswahl, ultimateSpielerIndex);
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
    potGroesse: raum.spiel.pot.length,
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
        rangliste: raum.spiel.rangliste().map((s) => ({ name: s.name, anzahl: s.gesamtAnzahlKarten() })),
      });
    } else {
      naechsterZug(raum);
    }
  }, RUNDEN_PAUSE_MS);
}

function starteSpiel(raum) {
  const deck = mischen(STAMMKARTEN);
  deck.forEach((karte, i) => {
    raum.spieler[i % raum.spieler.length].zustand.nachziehstapel.push(karte);
  });
  raum.spieler.forEach((s) => s.zustand.ziehNach());

  raum.spiel = new Spiel(raum.spieler.map((s) => s.zustand));
  raum.aktiverIndex = 0;

  raum.spieler.forEach((_, i) => {
    sendeAnSitz(raum, i, 'spielGestartet', {
      meinIndex: i,
      spieler: raum.spieler.map((s) => ({
        name: s.zustand.name,
        istBot: s.zustand.istBot,
      })),
      staende: staende(raum),
      handGroesse: HAND_GROESSE,
      kategorien: KATEGORIEN,
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
      aktiveKarte: null,
      kartenAuswahl: new Map(),
      antwortenAusstehend: new Set(),
      antworten: null,
      sprachTeilnehmer: new Set(),
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
      aktiveKarte: null,
      kartenAuswahl: new Map(),
      antwortenAusstehend: new Set(),
      antworten: null,
      sprachTeilnehmer: new Set(),
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

  socket.on('eigeneKarteWaehlen', ({ kartenName } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'warteAufEigeneKarte' || socket.data.sitz !== raum.aktiverIndex) return;
    waehleEigeneKarte(raum, kartenName);
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
    waehleKategorie(raum, kategorie);
  });

  socket.on('antwortKarteWaehlen', ({ kartenName } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    waehleAntwortkarte(raum, socket.data.sitz, kartenName);
  });

  socket.on('ultimateAntwort', ({ ja } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || raum.phase !== 'warteAufUltimate') return;
    const sitz = socket.data.sitz;
    if (!(sitz in raum.antworten) || raum.antworten[sitz] !== null) return;
    raum.antworten[sitz] = !!ja;
    versucheRundeAufzuloesen(raum);
  });

  // Rein kosmetisch: laesst Mitspieler live sehen, welche Karte man gerade in
  // der eigenen Hand ueberfliegt (ohne die Karte selbst zu verraten).
  socket.on('handHover', ({ index } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    sendeAnAlleAusser(raum, socket.data.sitz, 'gegnerHandHover', {
      spielerIndex: socket.data.sitz,
      index: Number.isInteger(index) ? index : null,
    });
  });

  // Chat: wie am selben Tisch sitzen - an alle im Raum, solange er existiert
  // (Lobby, Spiel oder Ende), auch gegen einen Bot (der ihn einfach ignoriert).
  socket.on('chatNachricht', ({ text } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    const spieler = raum.spieler[socket.data.sitz];
    if (!spieler) return;
    const getrimmt = String(text || '').trim().slice(0, 200);
    if (!getrimmt) return;
    sendeAnAlle(raum, 'chatNachricht', {
      spielerIndex: socket.data.sitz,
      name: spieler.zustand.name,
      text: getrimmt,
    });
  });

  // Sprachchat (WebRTC): der Server versteht nichts von Audio, er reicht nur
  // die Signalisierung (Angebote/Antworten/ICE-Kandidaten) zwischen den
  // Sitzen im selben Raum durch - wie ein Vermittlungsschrank.
  socket.on('sprachBeitreten', () => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    const eigenerSitz = socket.data.sitz;
    const bestehende = [...raum.sprachTeilnehmer];
    raum.sprachTeilnehmer.add(eigenerSitz);
    // Der neu Beigetretene bekommt die Liste der schon Anwesenden und
    // initiiert zu jedem von ihnen die Verbindung (verhindert, dass beide
    // Seiten gleichzeitig ein Angebot schicken).
    socket.emit('sprachTeilnehmerListe', { teilnehmer: bestehende });
    sendeAnAlleAusser(raum, eigenerSitz, 'sprachTeilnehmerBeigetreten', { spielerIndex: eigenerSitz });
  });

  socket.on('sprachVerlassen', () => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    raum.sprachTeilnehmer.delete(socket.data.sitz);
    sendeAnAlleAusser(raum, socket.data.sitz, 'sprachTeilnehmerVerlassen', { spielerIndex: socket.data.sitz });
  });

  socket.on('sprachSignal', ({ an, daten } = {}) => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum || !Number.isInteger(an)) return;
    sendeAnSitz(raum, an, 'sprachSignal', { von: socket.data.sitz, daten });
  });

  // Vorschau der eigenen gewonnenen Karten - nur an den anfragenden Spieler.
  socket.on('gewonneneKartenAnfragen', () => {
    const raum = raeume.get(socket.data.raumCode);
    if (!raum) return;
    const spieler = raum.spieler[socket.data.sitz];
    if (!spieler) return;
    socket.emit('gewonneneKartenAntwort', {
      karten: spieler.zustand.gewonneneKarten.map(kartenDaten),
    });
  });

  socket.on('disconnect', () => {
    const code = socket.data.raumCode;
    if (!code) return;
    const raum = raeume.get(code);
    if (!raum) return;

    if (raum.sprachTeilnehmer?.has(socket.data.sitz)) {
      raum.sprachTeilnehmer.delete(socket.data.sitz);
      sendeAnAlleAusser(raum, socket.data.sitz, 'sprachTeilnehmerVerlassen', { spielerIndex: socket.data.sitz });
    }

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
