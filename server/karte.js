// Portierung der Java-Spiellogik (com.showdown.model) nach JavaScript,
// damit Server und Konsolen-Version exakt dieselben Regeln verwenden.

const KATEGORIEN = [
  'Intelligenz',
  'Stärke',
  'Geschwindigkeit',
  'Widerstandsfähigkeit',
  'Energieprojektion',
  'Kampffähigkeit',
];

function normalisieren(text) {
  return String(text).trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
}

function kategorieIndex(kategorieName) {
  const normalisiert = normalisieren(kategorieName);
  const index = KATEGORIEN.findIndex((k) => normalisieren(k) === normalisiert);
  if (index === -1) {
    throw new Error(`Unbekannte Kategorie: ${kategorieName}. Erlaubt sind ${KATEGORIEN.join(', ')}`);
  }
  return index;
}

function alsBildSchluessel(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

class Karte {
  constructor(name, werte) {
    if (werte) {
      for (const w of werte) {
        if (w < 1 || w > 7) {
          throw new Error(`Power-Grid-Werte muessen zwischen 1 und 7 liegen, war ${w}`);
        }
      }
    }
    this.name = name;
    this.werte = werte ? [...werte] : null;
    this.bildSchluessel = alsBildSchluessel(name);
  }

  wert(kategorieName) {
    const index = kategorieIndex(kategorieName);
    return this.werte[index];
  }

  gesamtstaerke() {
    return KATEGORIEN.reduce((summe, kategorie) => summe + this.wert(kategorie), 0);
  }
}

class Held extends Karte {
  constructor(name, werte, team) {
    super(name, werte);
    this.team = team;
  }

  gewinntGleichstand() {
    return false;
  }

  farbe() {
    return 'BLAU';
  }

  typSymbol() {
    return 'HELD';
  }

  wendeUltimateAn(kontext) {
    kontext.eigenerBonus += 2;
    return `${this.name} setzt das Ultimate ein: +2 auf ${kontext.kategorie}`;
  }
}

class Schurke extends Karte {
  constructor(name, werte, team) {
    super(name, werte);
    this.team = team;
  }

  gewinntGleichstand() {
    return true;
  }

  farbe() {
    return 'ROT';
  }

  typSymbol() {
    return 'SCHURKE';
  }

  wendeUltimateAn(kontext) {
    let beste = KATEGORIEN[0];
    let bestWert = this.wert(beste);
    for (const kategorie of KATEGORIEN) {
      const wert = this.wert(kategorie);
      if (wert > bestWert) {
        bestWert = wert;
        beste = kategorie;
      }
    }
    kontext.kategorie = beste;
    return `${this.name} setzt das Ultimate ein: Kategorie getauscht zu ${beste}`;
  }
}

class TeamKarte extends Karte {
  constructor(name, mitglieder) {
    super(name, null);
    if (!mitglieder || mitglieder.length === 0) {
      throw new Error('Eine Teamkarte braucht mindestens ein Mitglied');
    }
    this.mitglieder = mitglieder;
  }

  // Delegation statt eigenem Wert: hoechster Mitgliederwert + 1 pro weiterem Mitglied.
  wert(kategorieName) {
    let hoechster = 0;
    for (const mitglied of this.mitglieder) {
      const wert = mitglied.wert(kategorieName);
      if (wert > hoechster) {
        hoechster = wert;
      }
    }
    return hoechster + (this.mitglieder.length - 1);
  }

  gewinntGleichstand() {
    return this.mitglieder[0].gewinntGleichstand();
  }

  farbe() {
    return 'GELB';
  }

  typSymbol() {
    return 'TEAM';
  }

  wendeUltimateAn(kontext) {
    kontext.andereBonus += -2;
    return `${this.name} setzt das Team-Ultimate ein: alle anderen -2`;
  }
}

module.exports = { Karte, Held, Schurke, TeamKarte, KATEGORIEN, kategorieIndex };
