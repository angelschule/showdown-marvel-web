// 1:1-Portierung von com.showdown.model.Heldendaten (gleiche Charaktere, gleiche Struktur).
// Werte auf 1-10 skaliert (urspruenglich 1-7, linear umgerechnet: 1,3,4,6,7,9,10).
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
    held('Iron Man', 'Avengers', [10, 6, 6, 7, 9, 6]),
    held('Captain America', 'Avengers', [6, 4, 4, 6, 1, 9]),
    held('Thor', 'Avengers', [4, 10, 7, 10, 10, 7]),
    held('Hulk', 'Avengers', [3, 10, 4, 10, 4, 7]),
    held('Black Widow', 'Avengers', [6, 3, 4, 3, 1, 7]),
    held('Hawkeye', 'Avengers', [4, 3, 4, 3, 1, 7]),
  ];
}

function xMen() {
  return [
    held('Wolverine', 'X-Men', [4, 6, 4, 10, 1, 9]),
    held('Cyclops', 'X-Men', [4, 3, 3, 4, 7, 6]),
    held('Jean Grey/Phoenix', 'X-Men', [7, 3, 3, 4, 10, 4]),
    held('Storm', 'X-Men', [6, 3, 4, 4, 9, 4]),
    held('Professor X', 'X-Men', [10, 1, 3, 3, 9, 3]),
    held('Beast', 'X-Men', [9, 6, 6, 6, 1, 6]),
  ];
}

function fantasticFour() {
  return [
    held('Mr. Fantastic', 'Fantastic Four', [10, 3, 3, 6, 4, 3]),
    held('Invisible Woman', 'Fantastic Four', [6, 3, 3, 3, 7, 3]),
    held('Human Torch', 'Fantastic Four', [4, 3, 6, 4, 7, 4]),
    held('The Thing', 'Fantastic Four', [3, 9, 3, 10, 1, 6]),
  ];
}

function ohneTeamHelden() {
  return [
    held('Spider-Man', null, [6, 6, 7, 6, 1, 7]),
    held('Doctor Strange', null, [9, 3, 3, 4, 10, 4]),
    held('Black Panther', null, [7, 4, 6, 6, 1, 9]),
    held('Daredevil', null, [4, 4, 6, 4, 1, 9]),
    held('Ghost Rider', null, [3, 7, 4, 9, 9, 6]),
  ];
}

function soloHelden() {
  return [...avengers(), ...xMen(), ...fantasticFour(), ...ohneTeamHelden()];
}

function sinisterSix() {
  return [
    schurke('Doctor Octopus', 'Sinister Six', [9, 6, 3, 6, 4, 4]),
    schurke('Green Goblin', 'Sinister Six', [7, 6, 4, 4, 4, 6]),
    schurke('Vulture', 'Sinister Six', [4, 3, 6, 4, 1, 4]),
    schurke('Electro', 'Sinister Six', [3, 3, 4, 4, 9, 3]),
    schurke('Sandman', 'Sinister Six', [3, 9, 3, 9, 1, 4]),
    schurke('Mysterio', 'Sinister Six', [7, 1, 3, 3, 6, 3]),
  ];
}

function brotherhoodOfMutants() {
  return [
    schurke('Magneto', 'Brotherhood of Mutants', [9, 3, 3, 4, 10, 4]),
    schurke('Mystique', 'Brotherhood of Mutants', [6, 4, 6, 4, 1, 7]),
    schurke('Sabretooth', 'Brotherhood of Mutants', [3, 6, 6, 9, 1, 7]),
    schurke('Juggernaut', 'Brotherhood of Mutants', [3, 10, 3, 10, 1, 4]),
    schurke('Toad', 'Brotherhood of Mutants', [3, 3, 6, 3, 1, 3]),
    schurke('Pyro', 'Brotherhood of Mutants', [4, 1, 3, 3, 7, 3]),
  ];
}

function mastersOfEvil() {
  return [
    schurke('Baron Zemo', 'Masters of Evil', [7, 4, 4, 4, 1, 7]),
    schurke('Abomination', 'Masters of Evil', [3, 10, 4, 10, 1, 6]),
    schurke('Ultron', 'Masters of Evil', [10, 9, 6, 10, 9, 7]),
    schurke('Enchantress', 'Masters of Evil', [4, 3, 3, 4, 9, 3]),
    schurke('Crimson Dynamo', 'Masters of Evil', [6, 9, 4, 9, 7, 4]),
    schurke('Whirlwind', 'Masters of Evil', [3, 4, 7, 4, 1, 4]),
  ];
}

function ohneTeamSchurken() {
  return [
    schurke('Thanos', null, [9, 10, 4, 10, 10, 9]),
    schurke('Loki', null, [9, 3, 4, 4, 9, 4]),
    schurke('Venom', null, [4, 7, 6, 7, 1, 6]),
    schurke('Kingpin', null, [6, 9, 3, 7, 1, 6]),
    schurke('Carnage', null, [3, 7, 6, 7, 1, 7]),
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
