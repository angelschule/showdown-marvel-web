// Portierung von com.showdown.model.Spiel / Spieler - exakt dieselben Regeln.

class Rundenkontext {
  constructor(kategorie) {
    this.kategorie = kategorie;
    this.eigenerBonus = 0;
    this.gegnerBonus = 0;
  }
}

class SpielerZustand {
  constructor(name) {
    this.name = name;
    this.stapel = [];
    this.siegeInSerie = 0;
    this.ultimateGenutzt = false;
  }

  ziehKarte() {
    return this.stapel.length ? this.stapel.shift() : null;
  }

  obersteKarte() {
    return this.stapel.length ? this.stapel[0] : null;
  }

  hatKarten() {
    return this.stapel.length > 0;
  }

  anzahlKarten() {
    return this.stapel.length;
  }

  hatAssembleBonus() {
    return this.siegeInSerie >= 3;
  }

  istUltimateVerfuegbar() {
    return !this.ultimateGenutzt;
  }

  nutzeUltimate(eigeneKarte, kontext) {
    if (this.ultimateGenutzt) {
      throw new Error(`${this.name} hat das Ultimate in diesem Spiel schon benutzt`);
    }
    this.ultimateGenutzt = true;
    return eigeneKarte.wendeUltimateAn(kontext);
  }
}

const { kategorieIndex } = require('./karte');

class Spiel {
  constructor(spielerA, spielerB) {
    this.spielerA = spielerA;
    this.spielerB = spielerB;
    this.pot = [];
    this.runde = 0;
    this.maxRunden = 15;
  }

  spieleRunde(kategorieName, ultimateSpieler) {
    kategorieIndex(kategorieName); // validiert zuerst, bevor ueberhaupt Karten gezogen werden
    if (!this.spielerA.hatKarten() || !this.spielerB.hatKarten()) {
      throw new Error('Ein Spieler hat keine Karten mehr - die Runde kann nicht gespielt werden');
    }

    this.runde += 1;
    const karteA = this.spielerA.ziehKarte();
    const karteB = this.spielerB.ziehKarte();

    const kontext = new Rundenkontext(kategorieName);
    let ultimateMeldung = null;
    if (ultimateSpieler === this.spielerA) {
      ultimateMeldung = this.spielerA.nutzeUltimate(karteA, kontext);
    } else if (ultimateSpieler === this.spielerB) {
      ultimateMeldung = this.spielerB.nutzeUltimate(karteB, kontext);
    }

    const effektiveKategorie = kontext.kategorie;
    let wertA = karteA.wert(effektiveKategorie);
    let wertB = karteB.wert(effektiveKategorie);
    if (ultimateSpieler === this.spielerA) {
      wertA += kontext.eigenerBonus;
      wertB += kontext.gegnerBonus;
    } else if (ultimateSpieler === this.spielerB) {
      wertB += kontext.eigenerBonus;
      wertA += kontext.gegnerBonus;
    }

    const gleichstand = wertA === wertB;
    let gewinner = null;
    if (wertA > wertB) {
      gewinner = this.spielerA;
    } else if (wertB > wertA) {
      gewinner = this.spielerB;
    } else if (karteA.gewinntGleichstand()) {
      gewinner = this.spielerA;
    } else if (karteB.gewinntGleichstand()) {
      gewinner = this.spielerB;
    }

    let assembleBonusAktiv = false;
    if (!gewinner) {
      this.pot.push(karteA, karteB);
      this.spielerA.siegeInSerie = 0;
      this.spielerB.siegeInSerie = 0;
    } else {
      const verlierer = gewinner === this.spielerA ? this.spielerB : this.spielerA;
      assembleBonusAktiv = gewinner.hatAssembleBonus();

      gewinner.stapel.push(karteA, karteB);
      if (this.pot.length) {
        gewinner.stapel.push(...this.pot);
        this.pot = [];
      }
      if (assembleBonusAktiv) {
        const bonusKarte = verlierer.ziehKarte();
        if (bonusKarte) {
          gewinner.stapel.push(bonusKarte);
        }
      }
      gewinner.siegeInSerie += 1;
      verlierer.siegeInSerie = 0;
    }

    return { karteA, karteB, kategorie: effektiveKategorie, gewinner, gleichstand, assembleBonusAktiv, ultimateMeldung };
  }

  istVorbei() {
    return this.runde >= this.maxRunden || !this.spielerA.hatKarten() || !this.spielerB.hatKarten();
  }

  gewinner() {
    if (this.spielerA.anzahlKarten() === this.spielerB.anzahlKarten()) {
      return null;
    }
    return this.spielerA.anzahlKarten() > this.spielerB.anzahlKarten() ? this.spielerA : this.spielerB;
  }
}

module.exports = { Spiel, SpielerZustand, Rundenkontext };
