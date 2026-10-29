// Generalisierte Spiellogik fuer 2 bis 4 Spieler.
//
// Jeder Spieler hat jetzt drei getrennte Stapel statt einem:
// - hand: bis zu 5 Karten, aktiv spielbar und (dem Besitzer) sichtbar
// - nachziehstapel: der Rest, verdeckt - nach jeder gespielten Karte wird
//   von hier automatisch bis auf 5 nachgezogen
// - gewonneneKarten: Karten, die eine Runde gewonnen wurden - bleiben
//   getrennt liegen und werden NICHT in die Hand zurueckgemischt
//
// Nur der aktive Kategorie-Waehler UND alle Antwortspieler waehlen jetzt
// gleichermassen eine Karte aus ihrer eigenen (kleinen) Hand - das macht die
// Hand-Faecher-Oberflaeche fuer beide Rollen konsistent.

const { kategorieIndex } = require('./karte');

const HAND_GROESSE = 5;

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
    this.hand = [];
    this.nachziehstapel = [];
    this.gewonneneKarten = [];
    this.siegeInSerie = 0;
    this.ultimateGenutzt = false;
  }

  // Fuellt die Hand nach dem Ausspielen einer Karte wieder bis HAND_GROESSE auf.
  ziehNach() {
    while (this.hand.length < HAND_GROESSE && this.nachziehstapel.length > 0) {
      this.hand.push(this.nachziehstapel.shift());
    }
  }

  entferneAusHand(name) {
    const i = this.hand.findIndex((k) => k.name === name);
    if (i === -1) return null;
    return this.hand.splice(i, 1)[0];
  }

  ziehZufaelligAusNachziehstapel() {
    if (!this.nachziehstapel.length) return null;
    const i = Math.floor(Math.random() * this.nachziehstapel.length);
    return this.nachziehstapel.splice(i, 1)[0];
  }

  nimmGewinn(karten) {
    this.gewonneneKarten.push(...karten);
  }

  hatSpielbareKarten() {
    return this.hand.length > 0;
  }

  anzahlHand() {
    return this.hand.length;
  }

  anzahlNachziehstapel() {
    return this.nachziehstapel.length;
  }

  anzahlGewonnen() {
    return this.gewonneneKarten.length;
  }

  gesamtAnzahlKarten() {
    return this.hand.length + this.nachziehstapel.length + this.gewonneneKarten.length;
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
    return this.spieler.filter((s) => s.hatSpielbareKarten());
  }

  /**
   * Loest eine Runde auf. kartenProSpieler ist eine Map<spielerIndex, Karte> -
   * die Karten wurden von server.js bereits aus den jeweiligen Haenden entfernt.
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

      gewinner.nimmGewinn(alleKartenDieserRunde);
      if (this.pot.length) {
        gewinner.nimmGewinn(this.pot);
        this.pot = [];
      }
      if (assembleBonusAktiv) {
        eintraege.forEach((e) => {
          if (e.spieler !== gewinner) {
            const bonusKarte = e.spieler.ziehZufaelligAusNachziehstapel();
            if (bonusKarte) gewinner.nimmGewinn([bonusKarte]);
          }
        });
      }

      gewinner.siegeInSerie += 1;
      eintraege.forEach((e) => { if (e.spieler !== gewinner) e.spieler.siegeInSerie = 0; });
    }

    // Alle Teilnehmer dieser Runde ziehen jetzt wieder bis zur Handgroesse nach.
    eintraege.forEach((e) => e.spieler.ziehNach());

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
    return [...this.spieler].sort((a, b) => b.gesamtAnzahlKarten() - a.gesamtAnzahlKarten());
  }

  gewinnerIndex() {
    const rang = this.rangliste();
    if (rang.length > 1 && rang[0].gesamtAnzahlKarten() === rang[1].gesamtAnzahlKarten()) {
      return null;
    }
    return this.spieler.indexOf(rang[0]);
  }
}

module.exports = { Spiel, SpielerZustand, Rundenkontext, HAND_GROESSE };
