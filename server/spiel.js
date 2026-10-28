// Generalisierte Spiellogik fuer 2 bis 4 Spieler (statt fest A/B).
// Gleiche Grundregeln wie die Java-2-Spieler-Version, auf N Spieler erweitert:
// - jede Runde spielen alle noch aktiven Spieler (mit Karten) gleichzeitig ihre oberste Karte
// - bei echtem Gleichstand an der Spitze (kein eindeutiger Schurke dabei) wandern ALLE
//   Karten dieser Runde in den Pot, die naechste entschiedene Runde gewinnt alles
// - Team-Ultimate wirkt auf ALLE anderen aktiven Spieler statt auf einen festen Gegner

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

  spieleRunde(kategorieName, ultimateSpielerIndex) {
    kategorieIndex(kategorieName); // validiert zuerst, bevor ueberhaupt Karten gezogen werden
    const aktive = this.aktiveSpieler();
    if (aktive.length < 2) {
      throw new Error('Es muessen mindestens 2 Spieler Karten haben, um eine Runde zu spielen');
    }

    this.runde += 1;
    const gezogen = aktive.map((spieler) => ({ spieler, karte: spieler.ziehKarte() }));

    const kontext = new Rundenkontext(kategorieName);
    let ultimateMeldung = null;
    let ultimateSpieler = null;
    if (ultimateSpielerIndex !== null && ultimateSpielerIndex !== undefined) {
      const eintrag = gezogen.find((g) => this.spieler.indexOf(g.spieler) === ultimateSpielerIndex);
      if (eintrag) {
        ultimateSpieler = eintrag.spieler;
        ultimateMeldung = eintrag.spieler.nutzeUltimate(eintrag.karte, kontext);
      }
    }

    const effektiveKategorie = kontext.kategorie;
    const bewertet = gezogen.map(({ spieler, karte }) => {
      let wert = karte.wert(effektiveKategorie);
      if (ultimateSpieler) {
        wert += spieler === ultimateSpieler ? kontext.eigenerBonus : kontext.andereBonus;
      }
      return { spieler, karte, wert };
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

    const alleKartenDieserRunde = gezogen.map((g) => g.karte);
    let assembleBonusAktiv = false;

    if (!gewinnerEintrag) {
      this.pot.push(...alleKartenDieserRunde);
      aktive.forEach((s) => { s.siegeInSerie = 0; });
    } else {
      const gewinner = gewinnerEintrag.spieler;
      assembleBonusAktiv = gewinner.hatAssembleBonus();

      gewinner.stapel.push(...alleKartenDieserRunde);
      if (this.pot.length) {
        gewinner.stapel.push(...this.pot);
        this.pot = [];
      }

      // ASSEMBLE: diese Runde zaehlt doppelt - der Gewinner zieht zusaetzlich
      // von jedem anderen aktiven Spieler eine Karte, falls vorhanden.
      if (assembleBonusAktiv) {
        aktive.forEach((s) => {
          if (s !== gewinner) {
            const bonusKarte = s.ziehKarte();
            if (bonusKarte) gewinner.stapel.push(bonusKarte);
          }
        });
      }

      gewinner.siegeInSerie += 1;
      aktive.forEach((s) => { if (s !== gewinner) s.siegeInSerie = 0; });
    }

    return {
      kategorie: effektiveKategorie,
      ergebnisse: bewertet.map((b) => ({
        spielerIndex: this.spieler.indexOf(b.spieler),
        karte: b.karte,
        wert: b.wert,
      })),
      gewinnerIndex: gewinnerEintrag ? this.spieler.indexOf(gewinnerEintrag.spieler) : null,
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
      return null; // Unentschieden an der Spitze
    }
    return this.spieler.indexOf(rang[0]);
  }
}

module.exports = { Spiel, SpielerZustand, Rundenkontext };
