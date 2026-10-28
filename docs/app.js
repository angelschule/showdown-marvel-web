// Nach dem Deployment anpassen: die URL deines gehosteten Servers (z. B. Render).
const SOCKET_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `${location.protocol}//${location.hostname}:3001`
  : 'https://showdown-marvel-web.onrender.com';

const socket = io(SOCKET_URL);

const bildschirme = {
  start: document.getElementById('start-bildschirm'),
  warte: document.getElementById('warte-bildschirm'),
  spiel: document.getElementById('spiel-bildschirm'),
  ende: document.getElementById('ende-bildschirm'),
};

function zeigeBildschirm(name) {
  Object.values(bildschirme).forEach((el) => el.classList.add('versteckt'));
  bildschirme[name].classList.remove('versteckt');
}

function setzeFehler(text) {
  document.getElementById('start-fehler').textContent = text || '';
}

// ---------- Startbildschirm ----------

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

socket.on('raumErstellt', ({ code }) => {
  document.getElementById('raum-code-anzeige').textContent = code;
  zeigeBildschirm('warte');
});

socket.on('fehler', ({ nachricht }) => {
  setzeFehler(nachricht);
});

// ---------- Spielstart ----------

let eigenerName = '';
let gegnerName = '';

socket.on('spielGestartet', (daten) => {
  eigenerName = daten.eigenerName;
  gegnerName = daten.gegnerName;
  document.getElementById('score-eigen').textContent = `${eigenerName}: ${daten.kartenAnzahl} Karten`;
  document.getElementById('score-gegner').textContent = `${gegnerName}: ${daten.kartenAnzahl} Karten`;
  document.getElementById('runden-anzeige').textContent = 'Runde 0 / 15';
  zeigeBildschirm('spiel');
});

// ---------- Kategorie waehlen ----------

const eigeneKarteBereich = document.getElementById('eigene-karte-bereich');
const ultimateBereich = document.getElementById('ultimate-bereich');
const ergebnisBereich = document.getElementById('ergebnis-bereich');
const statusZeile = document.getElementById('status-zeile');

function kartenHtml(karte) {
  const typKlasse = karte.typSymbol.toLowerCase();
  const balken = karte.werte
    .map((wert, i) => {
      const kategorieName = KATEGORIEN_ANZEIGE[i];
      const prozent = Math.round((wert / 7) * 100);
      return `
        <div class="stat-zeile">
          <span>${kategorieName}</span>
          <div class="stat-balken"><div class="stat-balken-fuellung" style="width:${prozent}%"></div></div>
          <span>${wert}</span>
        </div>`;
    })
    .join('');

  return `
    <div class="titel">
      <span class="name">${karte.name}</span>
      <span class="typ-tag ${typKlasse}">${karte.typSymbol}</span>
    </div>
    <div class="platzhalter-bild" title="Platzhalter - echtes Bild folgt (${karte.bildSchluessel})">🂠</div>
    ${balken}
    <div style="text-align:right; color:var(--muted); font-size:0.8rem; margin-top:6px;">Gesamtstaerke ${karte.gesamtstaerke}</div>
  `;
}

let KATEGORIEN_ANZEIGE = [];

socket.on('deinZug', ({ eigeneKarte, kategorien }) => {
  KATEGORIEN_ANZEIGE = kategorien;
  statusZeile.textContent = 'Du bist am Zug - waehle eine Kategorie';
  eigeneKarteBereich.classList.remove('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');

  document.getElementById('eigene-karte').innerHTML = kartenHtml(eigeneKarte);
  document.getElementById('eigene-karte').className = `spielkarte ${eigeneKarte.typSymbol.toLowerCase()}`;

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

socket.on('wartenAufGegner', ({ gegnerName: name }) => {
  statusZeile.textContent = `${name} waehlt gerade die Kategorie...`;
  eigeneKarteBereich.classList.add('versteckt');
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.add('versteckt');
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
  ultimateBereich.classList.add('versteckt');
  ergebnisBereich.classList.remove('versteckt');
  statusZeile.textContent = '';

  const meineSeite = socket.meineSeite;
  const meineKarte = meineSeite === 'A' ? ergebnis.karteA : ergebnis.karteB;
  const gegnerKarte = meineSeite === 'A' ? ergebnis.karteB : ergebnis.karteA;

  const karteAEl = document.getElementById('ergebnis-karte-a');
  const karteBEl = document.getElementById('ergebnis-karte-b');
  karteAEl.innerHTML = kartenHtml(meineKarte);
  karteAEl.className = `spielkarte ${meineKarte.typSymbol.toLowerCase()}`;
  karteBEl.innerHTML = kartenHtml(gegnerKarte);
  karteBEl.className = `spielkarte ${gegnerKarte.typSymbol.toLowerCase()}`;

  document.getElementById('ultimate-meldung').textContent = ergebnis.ultimateMeldung || '';

  const ergebnisText = document.getElementById('ergebnis-text');
  if (ergebnis.gewinnerSeite === null) {
    ergebnisText.textContent = 'Gleichstand - beide Karten in den Pot!';
    ergebnisText.className = 'ergebnis-text unentschieden';
  } else if (ergebnis.gewinnerSeite === meineSeite) {
    ergebnisText.textContent = `Du gewinnst die Runde!${ergebnis.assembleBonusAktiv ? ' ASSEMBLE! (zaehlt doppelt)' : ''}`;
    ergebnisText.className = 'ergebnis-text sieg';
  } else {
    ergebnisText.textContent = `${gegnerName} gewinnt die Runde.${ergebnis.assembleBonusAktiv ? ' ASSEMBLE! (zaehlt doppelt)' : ''}`;
    ergebnisText.className = 'ergebnis-text niederlage';
  }

  const eigeneKartenAnzahl = meineSeite === 'A' ? ergebnis.staende.A : ergebnis.staende.B;
  const gegnerKartenAnzahl = meineSeite === 'A' ? ergebnis.staende.B : ergebnis.staende.A;
  document.getElementById('score-eigen').textContent = `${eigenerName}: ${eigeneKartenAnzahl} Karten`;
  document.getElementById('score-gegner').textContent = `${gegnerName}: ${gegnerKartenAnzahl} Karten`;
  document.getElementById('runden-anzeige').textContent = `Runde ${ergebnis.runde} / 15`;
});

// Die eigene Seite (A/B) merken, sobald sie bekannt ist.
socket.on('raumErstellt', () => { socket.meineSeite = 'A'; });
socket.on('spielGestartet', () => {
  // Server weiss, wer A/B ist; wir leiten es indirekt ab: wer den Raum erstellt hat, ist A.
  if (!socket.meineSeite) socket.meineSeite = 'B';
});

// ---------- Spielende ----------

socket.on('spielVorbei', ({ gewinnerSeite }) => {
  const text = gewinnerSeite === null
    ? 'Unentschieden!'
    : gewinnerSeite === socket.meineSeite
      ? 'Du gewinnst das Spiel!'
      : `${gegnerName} gewinnt das Spiel!`;
  document.getElementById('ende-text').textContent = text;
  zeigeBildschirm('ende');
});

document.getElementById('btn-neustart').addEventListener('click', () => {
  location.reload();
});

socket.on('gegnerVerbindungGetrennt', () => {
  document.getElementById('ende-text').textContent = 'Die Verbindung zum Gegner wurde getrennt.';
  zeigeBildschirm('ende');
});
