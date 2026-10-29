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
// Optimistische, sofortige Korrektur der angezeigten Handgroesse eines Gegners,
// bevor der naechste volle Stand (rundenErgebnis) eintrifft - fuer das Live-Gefuehl.
let liveHandAbzug = {};
let aktuellerPot = 0;

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
  letzteStaende = daten.staende;
  if (daten.kategorien) KATEGORIEN_ANZEIGE = daten.kategorien;
  liveHandAbzug = {};
  aktuellerPot = 0;
  renderScoreLeiste(letzteStaende, null);
  renderGegnerTisch(letzteStaende);
  renderEigenerTisch(letzteStaende[meinIndex]);
  renderPot(0);
  document.getElementById('mitte-spielflaeche').innerHTML = '';
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
    chip.innerHTML = `<span class="punkt"></span>${label}: ${s.anzahl} <span class="gewonnen-badge" title="Gewonnene Karten">🏆${s.gewonnenAnzahl}</span>`;
    leiste.appendChild(chip);
  });
}

function stapelGrafikHtml(anzahl, { gewonnen = false, titel } = {}) {
  return `
    <div class="stapel-gruppe">
      <div class="stapel-grafik${gewonnen ? ' stapel-gewonnen' : ''}${anzahl === 0 ? ' stapel-leer' : ''}">
        <span class="stapel-anzahl">${anzahl}</span>
      </div>
      <div class="stapel-titel">${titel}</div>
    </div>`;
}

// Platz am Tisch fuer die anderen Spieler: Name, verdeckte Kartenrueckseiten
// (man sieht wie viele Karten sie auf der Hand haben, nicht welche) sowie ihr
// eigener Nachzieh- und Gewinn-Stapel, damit es wie ein echter Platz am
// Pokertisch wirkt statt wie eine blosse Zahl.
function renderGegnerTisch(staendeArray) {
  const container = document.getElementById('gegner-haende');
  container.innerHTML = '';
  staendeArray.forEach((s, i) => {
    if (i === meinIndex) return;
    const sichtbareHandAnzahl = Math.max(0, s.handAnzahl - (liveHandAbzug[i] || 0));
    const gruppe = document.createElement('div');
    gruppe.className = 'gegner-hand-gruppe';
    let rueckseiten = '';
    for (let k = 0; k < sichtbareHandAnzahl; k += 1) {
      rueckseiten += '<div class="karten-rueckseite"></div>';
    }
    gruppe.innerHTML = `
      <div class="gegner-hand-label">${s.name}</div>
      <div class="gegner-hand-reihe">${rueckseiten}</div>
      <div class="gegner-stapel-reihe">
        ${stapelGrafikHtml(s.nachziehAnzahl, { titel: 'Nachziehstapel' })}
        ${stapelGrafikHtml(s.gewonnenAnzahl, { gewonnen: true, titel: 'Gewonnen' })}
      </div>`;
    container.appendChild(gruppe);
  });
}

// Eigener Nachzieh- und Gewinn-Stapel ("Pocket") - immer sichtbar am eigenen
// Platz, analog zu den Stapeln der Gegner.
function renderEigenerTisch(stand) {
  const el = document.getElementById('eigener-tisch');
  if (!stand) { el.innerHTML = ''; return; }
  el.innerHTML = `
    ${stapelGrafikHtml(stand.nachziehAnzahl, { titel: 'Nachziehstapel' })}
    ${stapelGrafikHtml(stand.gewonnenAnzahl, { gewonnen: true, titel: 'Gewonnen' })}`;
}

// Gemeinsamer Pot in der Tischmitte - bleibt sichtbar, solange Karten darin
// liegen (nicht nur waehrend des Rundenergebnis-Bildschirms).
function renderPot(groesse) {
  aktuellerPot = groesse;
  const anzeige = document.getElementById('pot-anzeige-tisch');
  document.getElementById('pot-anzahl-tisch').textContent = groesse;
  anzeige.classList.toggle('versteckt', groesse <= 0);
}

// ---------- Kategorie waehlen ----------

const eigeneKarteBereich = document.getElementById('eigene-karte-bereich');
const ultimateBereich = document.getElementById('ultimate-bereich');
const ergebnisBereich = document.getElementById('ergebnis-bereich');
const statusZeile = document.getElementById('status-zeile');

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

// Einheitliches Attribut-Raster: 3 Spalten x 2 Reihen, pro Zelle Name (klein,
// oben), Icon und Wert darunter. interaktiv=true macht die Zellen klickbar
// (Kategorie-Wahl), sonst ist es eine reine Anzeige (z. B. im Rundenergebnis,
// mit hervorgehobener aktueller Kategorie).
function attributRasterHtml(karte, { interaktiv = false, aktiveKategorie = null } = {}) {
  const zellen = karte.werte
    .map((wert, i) => {
      const kategorie = KATEGORIEN_ANZEIGE[i] || '';
      const istAktiv = kategorie === aktiveKategorie;
      const tag = interaktiv ? 'button' : 'div';
      const klasse = 'attribut-zelle'
        + (interaktiv ? ' attribut-zelle-klickbar' : '')
        + (istAktiv ? ' aktive-kategorie' : '');
      const datenAttr = interaktiv ? ` data-kategorie="${kategorie}"` : '';
      return `
        <${tag} class="${klasse}"${datenAttr}>
          <span class="attribut-label">${kategorie}</span>
          <span class="attribut-icon">${KATEGORIE_ICONS[kategorie] || ''}</span>
          <span class="attribut-wert">${wert}</span>
        </${tag}>`;
    })
    .join('');
  return `<div class="attribut-raster">${zellen}</div>`;
}

function bildRahmenHtml(karte, besitzerLabel) {
  return `
    <div class="bild-rahmen">
      <img class="karten-bild" src="images/${karte.bildSchluessel}.jpg"
           data-schluessel="${karte.bildSchluessel}" data-endung="jpg"
           onerror="bildFallback(this)"
           alt="" />
      <div class="bild-platzhalter" aria-hidden="true"><div class="kategorie-icon typ-icon">${TYP_ICONS[karte.typSymbol] || ''}</div></div>
      <span class="typ-tag ${karte.typSymbol.toLowerCase()}">${karte.typSymbol}</span>
      ${besitzerLabel ? `<div class="besitzer">${besitzerLabel}</div>` : ''}
    </div>`;
}

// Statische Anzeige (Rundenergebnis): Bild bleibt komplett sichtbar, darunter
// das Attribut-Raster mit hervorgehobener Kategorie dieser Runde.
function kartenHtml(karte, besitzerLabel, kategorie) {
  return `
    ${bildRahmenHtml(karte, besitzerLabel)}
    <div class="karte-info">
      <div class="name">${karte.name}</div>
      ${attributRasterHtml(karte, { interaktiv: false, aktiveKategorie: kategorie })}
      <div class="gesamtstaerke-zeile">GESAMT ${karte.gesamtstaerke}</div>
    </div>
  `;
}

// Interaktive Anzeige (eigene Kategoriewahl): Bild bleibt sichtbar, das
// Attribut-Raster darunter ist direkt anklickbar - kein Overlay auf dem Bild.
function kartenHtmlIconReihe(karte) {
  return `
    ${bildRahmenHtml(karte, null)}
    <div class="karte-info">
      <div class="name">${karte.name}</div>
      ${attributRasterHtml(karte, { interaktiv: true })}
      <div class="gesamtstaerke-zeile">GESAMT ${karte.gesamtstaerke}</div>
    </div>
  `;
}

function aktiviereAttributKlicks(karteEl) {
  karteEl.querySelectorAll('.attribut-zelle-klickbar').forEach((zelle) => {
    zelle.addEventListener('click', () => {
      const kategorie = zelle.dataset.kategorie;
      socket.emit('kategorieWaehlen', { kategorie });
      statusZeile.textContent = `Kategorie gewaehlt: ${kategorie} - warte auf Aufloesung...`;
    });
  });
}

const eigeneHandBereich = document.getElementById('eigene-hand-bereich');

function neueRundeTischLeeren() {
  liveHandAbzug = {};
  document.getElementById('mitte-spielflaeche').innerHTML = '';
}

socket.on('waehleEigeneKarte', ({ hand }) => {
  statusZeile.textContent = 'Du bist am Zug - waehle eine Karte aus deiner Hand';
  neueRundeTischLeeren();
  eigeneHandBereich.classList.remove('versteckt');
  eigeneKarteBereich.classList.add('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  renderScoreLeiste(letzteStaende, meinIndex);
  renderGegnerTisch(letzteStaende);

  const raster = document.getElementById('eigene-hand-raster');
  raster.innerHTML = hand.map((karte) => handKarteHtml(karte, null)).join('');
  raster.querySelectorAll('.hand-karte').forEach((el) => {
    el.addEventListener('click', () => {
      socket.emit('eigeneKarteWaehlen', { kartenName: el.dataset.name });
      eigeneHandBereich.classList.add('versteckt');
      statusZeile.textContent = 'Waehle eine Kategorie fuer diese Karte...';
    });
  });
});

socket.on('waehleKategorieFuerKarte', ({ karte, kategorien }) => {
  KATEGORIEN_ANZEIGE = kategorien;
  statusZeile.textContent = 'Waehle eine Kategorie fuer deine Karte';
  eigeneHandBereich.classList.add('versteckt');
  eigeneKarteBereich.classList.remove('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');

  const karteEl = document.getElementById('eigene-karte');
  karteEl.innerHTML = kartenHtmlIconReihe(karte);
  karteEl.className = `spielkarte kompakt ${karte.typSymbol.toLowerCase()}`;
  aktiviereAttributKlicks(karteEl);
});

socket.on('wartenAufSpieler', ({ name, index }) => {
  statusZeile.textContent = `${name} waehlt gerade die Kategorie...`;
  neueRundeTischLeeren();
  eigeneHandBereich.classList.add('versteckt');
  eigeneKarteBereich.classList.add('versteckt');
  antwortkarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  renderScoreLeiste(letzteStaende, index);
  renderGegnerTisch(letzteStaende);
});

// Live-Gefuehl: sobald irgendein Spieler (aktiv oder Antwort) eine Karte aus
// der Hand legt, sieht jeder sofort eine verdeckte Karte in der Tischmitte
// landen und die Handrueckseiten-Reihe des Spielers wird kleiner - lange bevor
// das eigentliche Rundenergebnis (mit den aufgedeckten Karten) eintrifft.
socket.on('kartePlatziert', ({ spielerIndex }) => {
  if (spielerIndex === meinIndex) return;
  liveHandAbzug[spielerIndex] = (liveHandAbzug[spielerIndex] || 0) + 1;
  renderGegnerTisch(letzteStaende);

  const name = spielerListe[spielerIndex]?.name || `Spieler ${spielerIndex + 1}`;
  const mitte = document.getElementById('mitte-spielflaeche');
  const karte = document.createElement('div');
  karte.className = 'tisch-karte-verdeckt';
  karte.innerHTML = `<span class="tisch-karte-verdeckt-label">${name}</span>`;
  mitte.appendChild(karte);
});

// ---------- Antwortkarte frei waehlen ----------

const antwortkarteBereich = document.getElementById('antwortkarte-bereich');

// Zeigt die volle Karte (Bild + Attribut-Raster) in der Hand-Faecher-Groesse -
// kategorie=null -> Modus "eigene Karte waehlen" (noch nichts hervorgehoben),
// sonst wird die Zeile der aktuellen Kategorie markiert. Antippen waehlt die
// Karte aus; danach wird sie (im naechsten Schritt) gross angezeigt, wo dann
// die Attribute selbst anklickbar sind.
function handKarteHtml(karte, kategorie) {
  const typKlasse = karte.typSymbol.toLowerCase();
  return `
    <div class="hand-karte spielkarte ${typKlasse}" data-name="${karte.name}">
      ${kartenHtml(karte, null, kategorie)}
    </div>`;
}

socket.on('waehleAntwortkarte', ({ kategorie, kategorien, hand }) => {
  KATEGORIEN_ANZEIGE = kategorien;
  statusZeile.textContent = `Kategorie: ${kategorie} - waehle deine Antwortkarte`;
  eigeneHandBereich.classList.add('versteckt');
  eigeneKarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
  antwortkarteBereich.classList.remove('versteckt');
  renderGegnerTisch(letzteStaende);

  document.getElementById('antwortkarte-hinweis').textContent = `Kategorie: ${kategorie}`;
  const raster = document.getElementById('hand-raster');
  raster.innerHTML = hand.map((karte) => handKarteHtml(karte, kategorie)).join('');
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
  eigeneHandBereich.classList.add('versteckt');
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
  });

  renderPot(ergebnis.potGroesse);

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
  liveHandAbzug = {};
  document.getElementById('mitte-spielflaeche').innerHTML = '';
  renderScoreLeiste(letzteStaende, null);
  renderGegnerTisch(letzteStaende);
  renderEigenerTisch(letzteStaende[meinIndex]);
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
