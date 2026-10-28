// Generalisierte Spiellogik fuer 2 bis 4 Spieler.
// Neu gegenueber der Konsolen-Version: nur der aktive Kategorie-Waehler zieht seine
// oberste Karte blind (wie gehabt). Alle anderen ("Antwortspieler") duerfen sich eine
// beliebige Karte aus ihrer eigenen restlichen Hand aussuchen, statt automatisch die
// oberste zu spielen - diese Auswahl passiert in server.js, Spiel bekommt hier nur das
// Ergebnis (wer spielt welche schon aus der Hand entfernte Karte).

const { kategorieIndex } = require('./karte');

class Rundenkontext {
  constructor(kategorie) {
    this.kategorie = kategorie;
    this.eigenerBonus = 0;
    this.andereBonus = 0;
  }
}

class SpielerZustand {
  constructor(name, istBot = false) {
    this.name = name;
    this.istBot = istBot;
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

  // Entfernt eine bestimmte Karte (per Name) aus der Hand - fuer die freie Kartenwahl
  // der Antwortspieler. Gibt null zurueck, falls die Karte nicht (mehr) da ist.
  entferneKarte(name) {
    const i = this.stapel.findIndex((k) => k.name === name);
    if (i === -1) return null;
    return this.stapel.splice(i, 1)[0];
  }

  ziehZufaelligeKarte() {
    if (!this.stapel.length) return null;
    const i = Math.floor(Math.random() * this.stapel.length);
    return this.stapel.splice(i, 1)[0];
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

class Spiel {
  constructor(spieler) {
    if (spieler.length < 2 || spieler.length > 4) {
      throw new Error('SHOWDOWN wird mit 2 bis 4 Spielern gespielt');
    }
    this.spieler = spieler;
    this.pot = [];
    this.runde = 0;
    this.maxRunden = 15;
  }

  aktiveSpieler() {
    return this.spieler.filter((s) => s.hatKarten());
  }

  /**
   * Loest eine Runde auf. kartenProSpieler ist eine Map<spielerIndex, Karte> -
   * die Karten wurden von server.js bereits aus den jeweiligen Haenden entfernt
   * (oberste Karte beim aktiven Waehler, frei gewaehlte Karte bei allen anderen).
   */
  loeseRundeAuf(kategorieName, kartenProSpieler, ultimateSpielerIndex) {
    kategorieIndex(kategorieName);
    if (kartenProSpieler.size < 2) {
      throw new Error('Es muessen mindestens 2 Karten gespielt werden');
    }

    this.runde += 1;
    const eintraege = [...kartenProSpieler.entries()].map(([index, karte]) => ({
      index,
      spieler: this.spieler[index],
      karte,
    }));

    const kontext = new Rundenkontext(kategorieName);
    let ultimateMeldung = null;
    let ultimateSpieler = null;
    if (ultimateSpielerIndex !== null && ultimateSpielerIndex !== undefined) {
      const eintrag = eintraege.find((e) => e.index === ultimateSpielerIndex);
      if (eintrag) {
        ultimateSpieler = eintrag.spieler;
        ultimateMeldung = eintrag.spieler.nutzeUltimate(eintrag.karte, kontext);
      }
    }

    const effektiveKategorie = kontext.kategorie;
    const bewertet = eintraege.map(({ index, spieler, karte }) => {
      let wert = karte.wert(effektiveKategorie);
      if (ultimateSpieler) {
        wert += spieler === ultimateSpieler ? kontext.eigenerBonus : kontext.andereBonus;
      }
      return { index, spieler, karte, wert };
    });

    const maxWert = Math.max(...bewertet.map((b) => b.wert));
    const anDerSpitze = bewertet.filter((b) => b.wert === maxWert);

    let gewinnerEintrag = null;
    if (anDerSpitze.length === 1) {
      gewinnerEintrag = anDerSpitze[0];
    } else {
      const schurkenAnDerSpitze = anDerSpitze.filter((b) => b.karte.gewinntGleichstand());
      if (schurkenAnDerSpitze.length === 1) {
        gewinnerEintrag = schurkenAnDerSpitze[0];
      }
      // sonst: echter Gleichstand - niemand gewinnt diese Runde, alles in den Pot
    }

    const alleKartenDieserRunde = eintraege.map((e) => e.karte);
    let assembleBonusAktiv = false;

    if (!gewinnerEintrag) {
      this.pot.push(...alleKartenDieserRunde);
      eintraege.forEach((e) => { e.spieler.siegeInSerie = 0; });
    } else {
      const gewinner = gewinnerEintrag.spieler;
      assembleBonusAktiv = gewinner.hatAssembleBonus();

      gewinner.stapel.push(...alleKartenDieserRunde);
      if (this.pot.length) {
        gewinner.stapel.push(...this.pot);
        this.pot = [];
      }
      if (assembleBonusAktiv) {
        eintraege.forEach((e) => {
          if (e.spieler !== gewinner) {
            const bonusKarte = e.spieler.ziehZufaelligeKarte();
            if (bonusKarte) gewinner.stapel.push(bonusKarte);
          }
        });
      }

      gewinner.siegeInSerie += 1;
      eintraege.forEach((e) => { if (e.spieler !== gewinner) e.spieler.siegeInSerie = 0; });
    }

    return {
      kategorie: effektiveKategorie,
      ergebnisse: bewertet.map((b) => ({
        spielerIndex: b.index,
        karte: b.karte,
        wert: b.wert,
      })),
      gewinnerIndex: gewinnerEintrag ? gewinnerEintrag.index : null,
      assembleBonusAktiv,
      ultimateMeldung,
    };
  }

  istVorbei() {
    return this.runde >= this.maxRunden || this.aktiveSpieler().length <= 1;
  }

  rangliste() {
    return [...this.spieler].sort((a, b) => b.anzahlKarten() - a.anzahlKarten());
  }

  gewinnerIndex() {
    const rang = this.rangliste();
    if (rang.length > 1 && rang[0].anzahlKarten() === rang[1].anzahlKarten()) {
      return null;
    }
    return this.spieler.indexOf(rang[0]);
  }
}

module.exports = { Spiel, SpielerZustand, Rundenkontext };
