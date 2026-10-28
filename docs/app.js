// Nach dem Deployment anpassen, falls der Server umzieht.
const SOCKET_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `${location.protocol}//${location.hostname}:3001`
  : 'https://showdown-marvel-web.onrender.com';

const socket = io(SOCKET_URL);

const bildschirme = {
  start: document.getElementById('start-bildschirm'),
  lobby: document.getElementById('lobby-bildschirm'),
  spiel: document.getElementById('spiel-bildschirm'),
  ende: document.getElementById('ende-bildschirm'),
};

function zeigeBildschirm(name) {
  Object.values(bildschirme).forEach((el) => el.classList.add('versteckt'));
  bildschirme[name].classList.remove('versteckt');
}

function setzeFehler(text) {
  const istSpielAktiv = !bildschirme.spiel.classList.contains('versteckt');
  if (istSpielAktiv) {
    const status = document.getElementById('status-zeile');
    const alt = status.textContent;
    status.textContent = text;
    setTimeout(() => { status.textContent = alt; }, 2500);
  } else {
    document.getElementById('start-fehler').textContent = text || '';
  }
}

let meinIndex = null;
let spielerListe = [];
let KATEGORIEN_ANZEIGE = [];
let letzteStaende = [];

// ---------- Startbildschirm ----------

document.getElementById('btn-bot-starten').addEventListener('click', () => {
  const name = document.getElementById('name-bot').value.trim();
  setzeFehler('');
  socket.emit('botSpielStarten', { name });
});

document.getElementById('btn-raum-erstellen').addEventListener('click', () => {
  const name = document.getElementById('name-erstellen').value.trim();
  setzeFehler('');
  socket.emit('raumErstellen', { name });
});

document.getElementById('btn-raum-beitreten').addEventListener('click', () => {
  const name = document.getElementById('name-beitreten').value.trim();
  const code = document.getElementById('code-beitreten').value.trim().toUpperCase();
  if (!code) {
    setzeFehler('Bitte einen Raum-Code eingeben.');
    return;
  }
  setzeFehler('');
  socket.emit('raumBeitreten', { name, code });
});

socket.on('fehler', ({ nachricht }) => setzeFehler(nachricht));

// ---------- Lobby ----------

socket.on('raumErstellt', ({ code, meinIndex: idx }) => {
  meinIndex = idx;
  document.getElementById('raum-code-anzeige').textContent = code;
  zeigeBildschirm('lobby');
});

socket.on('raumBeigetreten', ({ code, meinIndex: idx }) => {
  meinIndex = idx;
  document.getElementById('raum-code-anzeige').textContent = code;
  zeigeBildschirm('lobby');
});

socket.on('lobbyUpdate', ({ hostIndex, spieler, maxSpieler }) => {
  const liste = document.getElementById('lobby-spielerliste');
  liste.innerHTML = '';
  spieler.forEach((s, i) => {
    const li = document.createElement('li');
    const tags = [];
    if (i === hostIndex) tags.push('<span class="tag host">HOST</span>');
    if (s.istBot) tags.push('<span class="tag bot">BOT</span>');
    li.innerHTML = `<span>${s.name}</span><span>${tags.join(' ')}</span>`;
    liste.appendChild(li);
  });

  const binHost = meinIndex === hostIndex;
  const steuerung = document.getElementById('lobby-host-steuerung');
  const hinweis = document.getElementById('lobby-hinweis');
  steuerung.classList.toggle('versteckt', !binHost);
  hinweis.classList.toggle('versteckt', binHost);

  if (binHost) {
    document.getElementById('btn-bot-hinzufuegen').disabled = spieler.length >= maxSpieler;
    document.getElementById('btn-spiel-starten').disabled = spieler.length < 2;
  }
});

document.getElementById('btn-bot-hinzufuegen').addEventListener('click', () => {
  socket.emit('botHinzufuegen');
});

document.getElementById('btn-spiel-starten').addEventListener('click', () => {
  socket.emit('spielStarten');
});

// ---------- Spielstart ----------

socket.on('spielGestartet', (daten) => {
  meinIndex = daten.meinIndex;
  spielerListe = daten.spieler;
  letzteStaende = daten.spieler;
  renderScoreLeiste(letzteStaende, null);
  document.getElementById('runden-anzeige').textContent = 'RUNDE 0 / 15';
  zeigeBildschirm('spiel');
});

function renderScoreLeiste(staendeArray, aktiverIndex) {
  const leiste = document.getElementById('score-leiste');
  leiste.innerHTML = '';
  staendeArray.forEach((s, i) => {
    const chip = document.createElement('div');
    chip.className = 'score-chip' + (i === aktiverIndex ? ' ist-dran' : '');
    const label = i === meinIndex ? `${s.name} (Du)` : s.name;
    chip.innerHTML = `<span class="punkt"></span>${label}: ${s.anzahl}`;
    leiste.appendChild(chip);
  });
}

// ---------- Kategorie waehlen ----------

const eigeneKarteBereich = document.getElementById('eigene-karte-bereich');
const ultimateBereich = document.getElementById('ultimate-bereich');
const ergebnisBereich = document.getElementById('ergebnis-bereich');
const statusZeile = document.getElementById('status-zeile');

const MAX_WERT = 10;

function kartenHtml(karte, besitzerLabel) {
  const typKlasse = karte.typSymbol.toLowerCase();
  const balken = karte.werte
    .map((wert, i) => {
      const kategorieName = KATEGORIEN_ANZEIGE[i] || '';
      const prozent = Math.round((wert / MAX_WERT) * 100);
      return `
        <div class="stat-zeile">
          <span>${kategorieName}</span>
          <div class="stat-balken"><div class="stat-balken-fuellung" data-ziel="${prozent}"></div></div>
          <span>${wert}</span>
        </div>`;
    })
    .join('');

  return `
    <div class="bild-rahmen">
      <img class="karten-bild" src="images/${karte.bildSchluessel}.jpg"
           onerror="this.onerror=null;this.closest('.spielkarte').classList.add('kein-bild');"
           alt="" />
      <div class="bild-platzhalter" aria-hidden="true"></div>
      <span class="typ-tag ${typKlasse}">${karte.typSymbol}</span>
      ${besitzerLabel ? `<div class="besitzer">${besitzerLabel}</div>` : ''}
    </div>
    <div class="karte-info">
      <div class="name">${karte.name}</div>
      ${balken}
      <div class="gesamtstaerke-zeile">GESAMT ${karte.gesamtstaerke}</div>
    </div>
  `;
}

function animiereBalken(scope) {
  requestAnimationFrame(() => {
    scope.querySelectorAll('.stat-balken-fuellung[data-ziel]').forEach((el) => {
      el.style.width = `${el.dataset.ziel}%`;
    });
  });
}

socket.on('deinZug', ({ eigeneKarte, kategorien, index }) => {
  KATEGORIEN_ANZEIGE = kategorien;
  statusZeile.textContent = 'Du bist am Zug - waehle eine Kategorie';
  eigeneKarteBereich.classList.remove('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  renderScoreLeiste(letzteStaende, index);

  const karteEl = document.getElementById('eigene-karte');
  karteEl.innerHTML = kartenHtml(eigeneKarte);
  karteEl.className = `spielkarte ${eigeneKarte.typSymbol.toLowerCase()}`;
  animiereBalken(karteEl);

  const buttons = document.getElementById('kategorie-buttons');
  buttons.innerHTML = '';
  kategorien.forEach((kategorie) => {
    const btn = document.createElement('button');
    btn.textContent = kategorie;
    btn.addEventListener('click', () => {
      socket.emit('kategorieWaehlen', { kategorie });
      buttons.innerHTML = '';
      statusZeile.textContent = `Kategorie gewaehlt: ${kategorie} - warte auf Aufloesung...`;
    });
    buttons.appendChild(btn);
  });
});

socket.on('wartenAufSpieler', ({ name, index }) => {
  statusZeile.textContent = `${name} waehlt gerade die Kategorie...`;
  eigeneKarteBereich.classList.add('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  renderScoreLeiste(letzteStaende, index);
});

// ---------- Antwortkarte frei waehlen ----------

const antwortkarteBereich = document.getElementById('antwortkarte-bereich');

function handKarteHtml(karte, kategorie, kategorien) {
  const index = kategorien.indexOf(kategorie);
  const wert = index >= 0 ? karte.werte[index] : '?';
  const typKlasse = karte.typSymbol.toLowerCase();
  return `
    <div class="hand-karte ${typKlasse}" data-name="${karte.name}">
      <span class="typ-tag ${typKlasse}">${karte.typSymbol}</span>
      <div class="hand-karte-name">${karte.name}</div>
      <div class="hand-karte-wert">${wert}</div>
      <div class="hand-karte-label">${kategorie}</div>
    </div>`;
}

socket.on('waehleAntwortkarte', ({ kategorie, kategorien, hand }) => {
  KATEGORIEN_ANZEIGE = kategorien;
  statusZeile.textContent = `Kategorie: ${kategorie} - waehle deine Antwortkarte`;
  eigeneKarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  antwortkarteBereich.classList.remove('versteckt');

  document.getElementById('antwortkarte-hinweis').textContent = `Kategorie: ${kategorie}`;
  const raster = document.getElementById('hand-raster');
  raster.innerHTML = hand.map((karte) => handKarteHtml(karte, kategorie, kategorien)).join('');
  raster.querySelectorAll('.hand-karte').forEach((el) => {
    el.addEventListener('click', () => {
      socket.emit('antwortKarteWaehlen', { kartenName: el.dataset.name });
      antwortkarteBereich.classList.add('versteckt');
      statusZeile.textContent = 'Warte auf die anderen Spieler...';
    });
  });
});

// ---------- Ultimate ----------

socket.on('ultimateAbfrage', () => {
  ultimateBereich.classList.remove('versteckt');
});

document.getElementById('btn-ultimate-ja').addEventListener('click', () => {
  socket.emit('ultimateAntwort', { ja: true });
  ultimateBereich.classList.add('versteckt');
  statusZeile.textContent = 'Warte auf Aufloesung...';
});

document.getElementById('btn-ultimate-nein').addEventListener('click', () => {
  socket.emit('ultimateAntwort', { ja: false });
  ultimateBereich.classList.add('versteckt');
  statusZeile.textContent = 'Warte auf Aufloesung...';
});

// ---------- Rundenergebnis ----------

socket.on('rundenErgebnis', (ergebnis) => {
  eigeneKarteBereich.classList.add('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.remove('versteckt');
  statusZeile.textContent = '';

  // Impact-Titel neu antriggern (Animation zuruecksetzen)
  const impakt = document.getElementById('impakt-titel');
  impakt.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  impakt.offsetHeight;
  impakt.style.animation = '';

  const raster = document.getElementById('duell-raster');
  raster.innerHTML = '';
  ergebnis.ergebnisse.forEach((e) => {
    const name = spielerListe[e.spielerIndex]?.name || `Spieler ${e.spielerIndex + 1}`;
    const label = e.spielerIndex === meinIndex ? `${name} (Du)` : name;
    const div = document.createElement('div');
    div.className = `spielkarte ${e.karte.typSymbol.toLowerCase()}` + (e.spielerIndex === ergebnis.gewinnerIndex ? ' gewonnen' : '');
    div.innerHTML = kartenHtml(e.karte, label);
    raster.appendChild(div);
    animiereBalken(div);
  });

  document.getElementById('ultimate-meldung').textContent = ergebnis.ultimateMeldung || '';

  const ergebnisText = document.getElementById('ergebnis-text');
  if (ergebnis.gewinnerIndex === null) {
    ergebnisText.textContent = 'Gleichstand - alle Karten in den Pot!';
    ergebnisText.className = 'ergebnis-text unentschieden';
  } else if (ergebnis.gewinnerIndex === meinIndex) {
    ergebnisText.textContent = `Du gewinnst die Runde!${ergebnis.assembleBonusAktiv ? ' ASSEMBLE!' : ''}`;
    ergebnisText.className = 'ergebnis-text sieg';
  } else {
    const siegerName = spielerListe[ergebnis.gewinnerIndex]?.name || '';
    ergebnisText.textContent = `${siegerName} gewinnt die Runde.${ergebnis.assembleBonusAktiv ? ' ASSEMBLE!' : ''}`;
    ergebnisText.className = 'ergebnis-text niederlage';
  }

  letzteStaende = ergebnis.staende;
  renderScoreLeiste(letzteStaende, null);
  document.getElementById('runden-anzeige').textContent = `RUNDE ${ergebnis.runde} / 15`;
});

// ---------- Spielende ----------

socket.on('spielVorbei', ({ gewinnerIndex, rangliste }) => {
  const titel = document.getElementById('ende-titel');
  if (gewinnerIndex === null) {
    titel.textContent = 'UNENTSCHIEDEN!';
  } else if (gewinnerIndex === meinIndex) {
    titel.textContent = 'DU GEWINNST! 🏆';
  } else {
    titel.textContent = `${spielerListe[gewinnerIndex]?.name || ''} GEWINNT!`;
  }

  const liste = document.getElementById('ende-rangliste');
  liste.innerHTML = '';
  rangliste.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === 0) li.classList.add('sieger');
    li.innerHTML = `<span>${s.name}</span><span>${s.anzahl} Karten</span>`;
    liste.appendChild(li);
  });

  zeigeBildschirm('ende');
});

document.getElementById('btn-neustart').addEventListener('click', () => {
  location.reload();
});

socket.on('spielerVerbindungGetrennt', ({ name }) => {
  document.getElementById('ende-titel').textContent = `Verbindung zu ${name || 'einem Spieler'} verloren`;
  document.getElementById('ende-rangliste').innerHTML = '';
  zeigeBildschirm('ende');
});
