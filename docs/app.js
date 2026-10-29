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

// Probiert nacheinander mehrere Dateiendungen fuer das Kartenbild durch, bevor
// auf den generischen Platzhalter zurueckgefallen wird. So reicht es, eine
// Bilddatei exakt "<bildSchluessel>.<eine dieser Endungen>" abzulegen - egal
// in welchem Format sie erzeugt wurde.
const BILD_ENDUNGEN = ['jpg', 'jpeg', 'png', 'webp'];

function bildFallback(img) {
  const naechsteIndex = BILD_ENDUNGEN.indexOf(img.dataset.endung) + 1;
  const naechsteEndung = BILD_ENDUNGEN[naechsteIndex];
  if (naechsteEndung) {
    img.dataset.endung = naechsteEndung;
    img.src = `images/${img.dataset.schluessel}.${naechsteEndung}`;
  } else {
    img.onerror = null;
    img.closest('.spielkarte').classList.add('kein-bild');
  }
}

// Generische, markenfreie Umriss-Icons. Kategorie-Icons zeigen, worum es in der
// Runde geht (fuer alle Kartentypen gleich); die Typ-Icons sind der Fallback,
// solange noch keine Kategorie feststeht (z. B. die eigene Karte vor der Wahl).
const KATEGORIE_ICONS = {
  'Intelligenz': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 6a14 14 0 0 0-8 25.5V36h16v-4.5A14 14 0 0 0 24 6Z"/><path d="M19 42h10M21 36v6M27 36v6"/></svg>',
  'Stärke': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="24" r="5"/><circle cx="38" cy="24" r="5"/><path d="M15 24h18" stroke-width="4"/></svg>',
  'Geschwindigkeit': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M26 4 10 28h10l-4 16 20-26H26l4-14Z" stroke-linejoin="round"/></svg>',
  'Widerstandsfähigkeit': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 5 8 11v12c0 11 7 17.5 16 20 9-2.5 16-9 16-20V11L24 5Z" stroke-linejoin="round"/></svg>',
  'Energieprojektion': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 4v10M24 34v10M4 24h10M34 24h10M10 10l7 7M31 31l7 7M38 10l-7 7M17 31l-7 7"/><circle cx="24" cy="24" r="7"/></svg>',
  'Kampffähigkeit': '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14 22 28M8 14l4-4 14 14M8 14l-2 6 6-2" stroke-linejoin="round"/><path d="M40 14 26 28M40 14l-4-4-14 14M40 14l2 6-6-2" stroke-linejoin="round"/></svg>',
};

const TYP_ICONS = {
  HELD: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 4 44 14v12c0 12-8.5 19.5-20 22C12.5 45.5 4 38 4 26V14Z" stroke-linejoin="round"/></svg>',
  SCHURKE: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 4 44 24 24 44 4 24Z" stroke-linejoin="round"/></svg>',
  TEAM: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="22" r="9"/><circle cx="30" cy="22" r="9"/></svg>',
};

function kartenHtml(karte, besitzerLabel, kategorie) {
  const typKlasse = karte.typSymbol.toLowerCase();
  const balken = karte.werte
    .map((wert, i) => {
      const kategorieName = KATEGORIEN_ANZEIGE[i] || '';
      const prozent = Math.round((wert / MAX_WERT) * 100);
      const istAktuelleKategorie = kategorieName === kategorie;
      return `
        <div class="stat-zeile${istAktuelleKategorie ? ' aktive-kategorie' : ''}">
          <span>${kategorieName}</span>
          <div class="stat-balken"><div class="stat-balken-fuellung" data-ziel="${prozent}"></div></div>
          <span>${wert}</span>
        </div>`;
    })
    .join('');

  const platzhalterInhalt = kategorie
    ? `<div class="kategorie-label">${kategorie}</div><div class="kategorie-icon">${KATEGORIE_ICONS[kategorie] || ''}</div>`
    : `<div class="kategorie-icon typ-icon">${TYP_ICONS[karte.typSymbol] || ''}</div>`;

  return `
    <div class="bild-rahmen">
      <img class="karten-bild" src="images/${karte.bildSchluessel}.jpg"
           data-schluessel="${karte.bildSchluessel}" data-endung="jpg"
           onerror="bildFallback(this)"
           alt="" />
      <div class="bild-platzhalter" aria-hidden="true">${platzhalterInhalt}</div>
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

// Kompakte Darstellung ohne Textbeschriftung: nur die 6 Kategorie-Icons in
// derselben Reihenfolge wie im Auswahl-Overlay, jedes mit seinem Wert darunter.
// Das Bild traegt zusaetzlich das (zunaechst versteckte) Kategorie-Overlay -
// kein separates Feld mehr unter der Karte.
function kartenHtmlIconReihe(karte) {
  const reihe = karte.werte
    .map((wert, i) => {
      const kategorie = KATEGORIEN_ANZEIGE[i] || '';
      return `
        <div class="icon-stat" title="${kategorie}">
          <div class="icon-stat-icon">${KATEGORIE_ICONS[kategorie] || ''}</div>
          <div class="icon-stat-wert">${wert}</div>
        </div>`;
    })
    .join('');

  const overlayButtons = KATEGORIEN_ANZEIGE
    .map((kategorie) => `
      <button class="kategorie-overlay-btn" data-kategorie="${kategorie}">
        <span class="kategorie-overlay-icon">${KATEGORIE_ICONS[kategorie] || ''}</span>
        <span class="kategorie-overlay-label">${kategorie}</span>
      </button>`)
    .join('');

  return `
    <div class="bild-rahmen">
      <img class="karten-bild" src="images/${karte.bildSchluessel}.jpg"
           data-schluessel="${karte.bildSchluessel}" data-endung="jpg"
           onerror="bildFallback(this)"
           alt="" />
      <div class="bild-platzhalter" aria-hidden="true"><div class="kategorie-icon typ-icon">${TYP_ICONS[karte.typSymbol] || ''}</div></div>
      <span class="typ-tag ${karte.typSymbol.toLowerCase()}">${karte.typSymbol}</span>
      <div class="klick-hinweis">Klicken zum Waehlen</div>
      <div class="kategorie-overlay versteckt">${overlayButtons}</div>
    </div>
    <div class="karte-info">
      <div class="name">${karte.name}</div>
      <div class="icon-stat-reihe">${reihe}</div>
      <div class="gesamtstaerke-zeile">GESAMT ${karte.gesamtstaerke}</div>
    </div>
  `;
}

// Macht die Karte selbst zum Kategorie-Waehler: Hover hebt sie hervor, ein
// Klick blendet das Icon-Raster (3 pro Reihe) direkt ueber dem Bild ein.
function aktiviereKategorieOverlay(karteEl) {
  const overlay = karteEl.querySelector('.kategorie-overlay');
  const hinweis = karteEl.querySelector('.klick-hinweis');

  karteEl.addEventListener('click', (e) => {
    if (e.target.closest('.kategorie-overlay-btn')) return;
    overlay.classList.toggle('versteckt');
    hinweis.classList.toggle('versteckt');
  });

  overlay.querySelectorAll('.kategorie-overlay-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const kategorie = btn.dataset.kategorie;
      socket.emit('kategorieWaehlen', { kategorie });
      statusZeile.textContent = `Kategorie gewaehlt: ${kategorie} - warte auf Aufloesung...`;
    });
  });
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
  karteEl.innerHTML = kartenHtmlIconReihe(eigeneKarte);
  karteEl.className = `spielkarte kompakt ${eigeneKarte.typSymbol.toLowerCase()}`;
  aktiviereKategorieOverlay(karteEl);
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
    div.innerHTML = kartenHtml(e.karte, label, ergebnis.kategorie);
    raster.appendChild(div);
    animiereBalken(div);
  });

  const potAnzeige = document.getElementById('pot-anzeige');
  if (ergebnis.potGroesse > 0) {
    document.getElementById('pot-anzahl').textContent = ergebnis.potGroesse;
    potAnzeige.classList.remove('versteckt');
  } else {
    potAnzeige.classList.add('versteckt');
  }

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
