// 1:1-Portierung von com.showdown.model.Heldendaten (gleiche Werte, gleiche Struktur).
// TODO: Alle Power-Grid-Werte sind vorlaeufige, nicht verifizierte Schaetzwerte.

const { Held, Schurke, TeamKarte } = require('./karte');

function held(name, team, werte) {
  return new Held(name, werte, team);
}

function schurke(name, team, werte) {
  return new Schurke(name, werte, team);
}

function avengers() {
  return [
    held('Iron Man', 'Avengers', [7, 4, 4, 5, 6, 4]),
    held('Captain America', 'Avengers', [4, 3, 3, 4, 1, 6]),
    held('Thor', 'Avengers', [3, 7, 5, 7, 7, 5]),
    held('Hulk', 'Avengers', [2, 7, 3, 7, 3, 5]),
    held('Black Widow', 'Avengers', [4, 2, 3, 2, 1, 5]),
    held('Hawkeye', 'Avengers', [3, 2, 3, 2, 1, 5]),
  ];
}

function xMen() {
  return [
    held('Wolverine', 'X-Men', [3, 4, 3, 7, 1, 6]),
    held('Cyclops', 'X-Men', [3, 2, 2, 3, 5, 4]),
    held('Jean Grey/Phoenix', 'X-Men', [5, 2, 2, 3, 7, 3]),
    held('Storm', 'X-Men', [4, 2, 3, 3, 6, 3]),
    held('Professor X', 'X-Men', [7, 1, 2, 2, 6, 2]),
    held('Beast', 'X-Men', [6, 4, 4, 4, 1, 4]),
  ];
}

function fantasticFour() {
  return [
    held('Mr. Fantastic', 'Fantastic Four', [7, 2, 2, 4, 3, 2]),
    held('Invisible Woman', 'Fantastic Four', [4, 2, 2, 2, 5, 2]),
    held('Human Torch', 'Fantastic Four', [3, 2, 4, 3, 5, 3]),
    held('The Thing', 'Fantastic Four', [2, 6, 2, 7, 1, 4]),
  ];
}

function ohneTeamHelden() {
  return [
    held('Spider-Man', null, [4, 4, 5, 4, 1, 5]),
    held('Doctor Strange', null, [6, 2, 2, 3, 7, 3]),
    held('Black Panther', null, [5, 3, 4, 4, 1, 6]),
    held('Daredevil', null, [3, 3, 4, 3, 1, 6]),
    held('Ghost Rider', null, [2, 5, 3, 6, 6, 4]),
  ];
}

function soloHelden() {
  return [...avengers(), ...xMen(), ...fantasticFour(), ...ohneTeamHelden()];
}

function sinisterSix() {
  return [
    schurke('Doctor Octopus', 'Sinister Six', [6, 4, 2, 4, 3, 3]),
    schurke('Green Goblin', 'Sinister Six', [5, 4, 3, 3, 3, 4]),
    schurke('Vulture', 'Sinister Six', [3, 2, 4, 3, 1, 3]),
    schurke('Electro', 'Sinister Six', [2, 2, 3, 3, 6, 2]),
    schurke('Sandman', 'Sinister Six', [2, 6, 2, 6, 1, 3]),
    schurke('Mysterio', 'Sinister Six', [5, 1, 2, 2, 4, 2]),
  ];
}

function brotherhoodOfMutants() {
  return [
    schurke('Magneto', 'Brotherhood of Mutants', [6, 2, 2, 3, 7, 3]),
    schurke('Mystique', 'Brotherhood of Mutants', [4, 3, 4, 3, 1, 5]),
    schurke('Sabretooth', 'Brotherhood of Mutants', [2, 4, 4, 6, 1, 5]),
    schurke('Juggernaut', 'Brotherhood of Mutants', [2, 7, 2, 7, 1, 3]),
    schurke('Toad', 'Brotherhood of Mutants', [2, 2, 4, 2, 1, 2]),
    schurke('Pyro', 'Brotherhood of Mutants', [3, 1, 2, 2, 5, 2]),
  ];
}

function mastersOfEvil() {
  return [
    schurke('Baron Zemo', 'Masters of Evil', [5, 3, 3, 3, 1, 5]),
    schurke('Abomination', 'Masters of Evil', [2, 7, 3, 7, 1, 4]),
    schurke('Ultron', 'Masters of Evil', [7, 6, 4, 7, 6, 5]),
    schurke('Enchantress', 'Masters of Evil', [3, 2, 2, 3, 6, 2]),
    schurke('Crimson Dynamo', 'Masters of Evil', [4, 6, 3, 6, 5, 3]),
    schurke('Whirlwind', 'Masters of Evil', [2, 3, 5, 3, 1, 3]),
  ];
}

function ohneTeamSchurken() {
  return [
    schurke('Thanos', null, [6, 7, 3, 7, 7, 6]),
    schurke('Loki', null, [6, 2, 3, 3, 6, 3]),
    schurke('Venom', null, [3, 5, 4, 5, 1, 4]),
    schurke('Kingpin', null, [4, 6, 2, 5, 1, 4]),
    schurke('Carnage', null, [2, 5, 4, 5, 1, 5]),
  ];
}

function soloSchurken() {
  return [...sinisterSix(), ...brotherhoodOfMutants(), ...mastersOfEvil(), ...ohneTeamSchurken()];
}

function teamKarte(teamName, mitglieder) {
  return new TeamKarte(teamName, mitglieder);
}

function alleHelden() {
  const alle = [...soloHelden(), ...soloSchurken()];
  alle.push(teamKarte('Avengers', avengers()));
  alle.push(teamKarte('X-Men', xMen()));
  alle.push(teamKarte('Fantastic Four', fantasticFour()));
  alle.push(teamKarte('Sinister Six', sinisterSix()));
  alle.push(teamKarte('Brotherhood of Mutants', brotherhoodOfMutants()));
  alle.push(teamKarte('Masters of Evil', mastersOfEvil()));
  return alle;
}

module.exports = { alleHelden };
