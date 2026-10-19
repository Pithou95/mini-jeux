import {
  batailleNavale, CONSTANTES, casesDe, peutPlacer, estCoule, flotteAleatoire,
} from '../games/bataille-navale.js';

const { TAILLE, FLOTTE } = CONSTANTES;
const LETTRES = 'ABCDEFGHIJ';

// Mémoire du module (ces variables survivent entre deux affichages).
// Pendant le placement, la flotte est préparée chez le joueur : l'hôte ne la reçoit
// qu'au moment de la validation (c'est ce qui garde les bateaux secrets).
let idPartieLocale = null;   // quelle partie est en cours chez moi
let flotteLocale = [];       // un emplacement par bateau de FLOTTE : null ou { x, y, horizontal }
let selection = 0;           // indice du bateau en cours de pose (null si aucun)
let horizontal = true;       // orientation choisie pour la prochaine pose
let messagePlacement = '';   // message d'erreur du placement
let contexte = null;         // dernières infos reçues (état, fonction d'envoi...)

// Appelé quand on quitte la partie (retour à la salle)
export function arreter() {
  idPartieLocale = null;
}

function reinitialiserPlacement() {
  flotteLocale = FLOTTE.map(() => null);
  selection = 0;
  horizontal = true;
  messagePlacement = '';
}

function nomCase(x, y) {
  return LETTRES[x] + (y + 1);
}

// ===================== PLACEMENT (local) =====================

// Les bateaux déjà posés, au format { x, y, horizontal, taille }
function bateauxPoses(sauf = null) {
  const poses = [];
  flotteLocale.forEach((p, i) => {
    if (p !== null && i !== sauf) {
      poses.push({ ...p, taille: FLOTTE[i].taille });
    }
  });
  return poses;
}

// Premier bateau pas encore posé (ou null)
function prochainAPoser() {
  const indice = flotteLocale.findIndex(p => p === null);
  return indice === -1 ? null : indice;
}

// Clic sur ma grille pendant le placement
function cliquerMaGrille(x, y) {
  if (selection === null) {
    // Aucun bateau en main : on ramasse celui qui est sous le clic (pour le déplacer)
    const indice = flotteLocale.findIndex((p, i) =>
      p !== null && casesDe({ ...p, taille: FLOTTE[i].taille }).some(c => c.x === x && c.y === y));
    if (indice !== -1) {
      horizontal = flotteLocale[indice].horizontal;
      flotteLocale[indice] = null;
      selection = indice;
      messagePlacement = '';
    }
    dessiner();
    return;
  }

  const bateau = { x, y, horizontal, taille: FLOTTE[selection].taille };
  if (peutPlacer(bateauxPoses(selection), bateau)) {
    flotteLocale[selection] = { x, y, horizontal };
    selection = prochainAPoser();
    messagePlacement = '';
  } else {
    messagePlacement = 'Emplacement impossible : le bateau sortirait de la grille ou en chevaucherait un autre.';
  }
  dessiner();
}

function choisirBateau(indice) {
  if (flotteLocale[indice] !== null) {
    horizontal = flotteLocale[indice].horizontal;
    flotteLocale[indice] = null;   // on le reprend en main pour le reposer ailleurs
  }
  selection = indice;
  messagePlacement = '';
  dessiner();
}

function pivoter() {
  horizontal = !horizontal;
  dessiner();
}

function placerAuHasard() {
  flotteLocale = flotteAleatoire();
  selection = null;
  messagePlacement = '';
  dessiner();
}

function toutEffacer() {
  reinitialiserPlacement();
  dessiner();
}

function validerFlotte() {
  if (prochainAPoser() !== null) return;
  contexte.envoyerAction({ type: 'pret', bateaux: flotteLocale });
}

// ===================== DESSIN D'UNE GRILLE =====================

function creerEntete(texte) {
  const div = document.createElement('div');
  div.className = 'bn-entete';
  div.textContent = texte;
  return div;
}

// bateaux : [{ x, y, horizontal, taille, cases? }]
// tirs : [{ x, y, touche }]
// montrerBateaux : false = on ne montre que les bateaux coulés
// auClic : (x, y) => ... (facultatif ; seules les cases pas encore tirées sont cliquables)
function creerGrille({ bateaux, tirs, montrerBateaux, auClic, petite }) {
  const cases = [];
  for (let y = 0; y < TAILLE; y++) {
    cases.push([]);
    for (let x = 0; x < TAILLE; x++) {
      cases[y].push({ bateau: false, coule: false, tir: null });
    }
  }

  bateaux.forEach((b) => {
    const complet = { ...b, cases: b.cases || casesDe(b) };
    const coule = estCoule(complet, tirs);
    complet.cases.forEach((c) => {
      if (montrerBateaux || coule) cases[c.y][c.x].bateau = true;
      if (coule) cases[c.y][c.x].coule = true;
    });
  });
  tirs.forEach((t) => {
    cases[t.y][t.x].tir = t.touche ? 'touche' : 'eau';
  });

  const grille = document.createElement('div');
  grille.className = 'bn-grille' + (petite ? ' petite' : '');

  grille.appendChild(creerEntete(''));
  for (let x = 0; x < TAILLE; x++) grille.appendChild(creerEntete(LETTRES[x]));

  for (let y = 0; y < TAILLE; y++) {
    grille.appendChild(creerEntete(String(y + 1)));
    for (let x = 0; x < TAILLE; x++) {
      const infos = cases[y][x];
      const div = document.createElement('div');
      let classes = 'bn-case';
      if (infos.bateau) classes += ' bn-bateau';
      if (infos.tir === 'eau') classes += ' bn-eau';
      if (infos.tir === 'touche') classes += ' bn-touche';
      if (infos.coule) classes += ' bn-coule';
      if (auClic && infos.tir === null) classes += ' bn-clic';
      div.className = classes;

      if (infos.tir === 'eau') div.textContent = '•';
      if (infos.tir === 'touche') div.textContent = '✖';

      if (auClic) {
        div.addEventListener('click', () => auClic(x, y));
      }
      grille.appendChild(div);
    }
  }
  return grille;
}

function creerTitre(texte) {
  const titre = document.createElement('h3');
  titre.className = 'bn-titre';
  titre.textContent = texte;
  return titre;
}

function creerBouton(texte, auClic, classe = '') {
  const bouton = document.createElement('button');
  bouton.className = 'bn-bouton ' + classe;
  bouton.textContent = texte;
  bouton.addEventListener('click', auClic);
  return bouton;
}

// ===================== ÉCRANS =====================

function dessinerPlacement(conteneur, statut) {
  statut.textContent = 'Place tes bateaux';

  const aide = document.createElement('p');
  aide.className = 'bn-aide';
  aide.textContent = 'Choisis un bateau, puis clique sur la grille pour le poser. '
    + 'Clique sur un bateau posé pour le déplacer.';

  // Un bouton par bateau
  const liste = document.createElement('div');
  liste.className = 'bn-outils';
  FLOTTE.forEach((type, indice) => {
    let classe = '';
    if (selection === indice) classe += ' bn-selectionne';
    if (flotteLocale[indice] !== null) classe += ' bn-pose';
    const texte = `${type.nom} (${type.taille})` + (flotteLocale[indice] !== null ? ' ✓' : '');
    liste.appendChild(creerBouton(texte, () => choisirBateau(indice), classe));
  });

  // Les outils
  const outils = document.createElement('div');
  outils.className = 'bn-outils';
  outils.append(
    creerBouton(horizontal ? 'Orientation : ↔ horizontale' : 'Orientation : ↕ verticale', pivoter),
    creerBouton('🎲 Au hasard', placerAuHasard),
    creerBouton('Tout effacer', toutEffacer),
  );

  // Ma grille (locale)
  const bateaux = bateauxPoses();
  const grille = creerGrille({
    bateaux,
    tirs: [],
    montrerBateaux: true,
    auClic: cliquerMaGrille,
  });

  const message = document.createElement('p');
  message.className = 'bn-message';
  message.textContent = messagePlacement;

  const valider = creerBouton('Valider ma flotte', validerFlotte, 'bn-valider');
  valider.disabled = prochainAPoser() !== null;

  conteneur.append(statut, aide, liste, outils, grille, message, valider);
}

function dessinerAttente(conteneur, statut, moi, adversaire) {
  statut.textContent = `Flotte prête ! En attente de ${adversaire.nom}...`;
  conteneur.append(
    statut,
    creerTitre('Ta flotte'),
    creerGrille({ bateaux: moi.bateaux, tirs: moi.tirs, montrerBateaux: true }),
  );
}

// Texte décrivant un tir
function decrireTir(etat, monId, adversaire) {
  const d = etat.dernier;
  if (!d) return '';

  const qui = d.tireur === monId ? 'Ton tir' : `Tir de ${adversaire.nom}`;
  let issue = 'dans l\'eau 🌊';
  if (d.resultat === 'touche') issue = 'touché ! 💥';
  if (d.resultat === 'coule') issue = `coulé ! 🔥 (${d.nomBateau})`;
  return `${qui} en ${nomCase(d.x, d.y)} : ${issue}`;
}

function dessinerCombat(conteneur, statut, etat, moi, adversaire, monId) {
  const resultat = batailleNavale.estTerminee(etat);
  const miens = etat.joueurs[etat.courant].id === monId;

  if (resultat.terminee) {
    const gagnant = resultat.gagnants[0];
    statut.textContent = gagnant.id === monId
      ? 'Victoire ! Tu as coulé toute la flotte ennemie 🎉'
      : `Victoire de ${gagnant.nom} !`;
  } else if (miens) {
    statut.textContent = 'À toi de tirer !';
  } else {
    statut.textContent = `Tour de ${adversaire.nom}`;
  }

  const dernier = document.createElement('p');
  dernier.className = 'bn-dernier';
  dernier.textContent = decrireTir(etat, monId, adversaire);

  // Bateaux ennemis encore à flot
  const coules = adversaire.bateaux.filter(b => estCoule(b, adversaire.tirs)).map(b => b.nom);
  const restants = FLOTTE.filter(type => !coules.includes(type.nom)).map(type => type.nom);
  const infoRestants = document.createElement('p');
  infoRestants.className = 'bn-aide';
  infoRestants.textContent = resultat.terminee
    ? ''
    : `Bateaux ennemis restants : ${restants.length > 0 ? restants.join(', ') : 'aucun'}`;

  // La grille ennemie : cliquable seulement à mon tour
  const peutTirer = !resultat.terminee && miens;
  const grilleEnnemie = creerGrille({
    bateaux: adversaire.bateaux,
    tirs: adversaire.tirs,
    montrerBateaux: resultat.terminee,   // à la fin, on révèle tout
    auClic: peutTirer ? (x, y) => contexte.envoyerAction({ type: 'tirer', x, y }) : null,
  });

  const maGrille = creerGrille({
    bateaux: moi.bateaux,
    tirs: moi.tirs,
    montrerBateaux: true,
    petite: true,
  });

  conteneur.append(
    statut,
    dernier,
    creerTitre(`Flotte de ${adversaire.nom}`),
    grilleEnnemie,
    infoRestants,
    creerTitre('Ta flotte'),
    maGrille,
  );
}

// ===================== POINT D'ENTRÉE =====================

function dessiner() {
  const { conteneur, etat, monId } = contexte;
  const moi = etat.joueurs.find(j => j.id === monId);
  const adversaire = etat.joueurs.find(j => j.id !== monId);

  conteneur.innerHTML = '';
  const statut = document.createElement('p');
  statut.id = 'statut';

  if (etat.phase === 'placement') {
    if (moi.pret) {
      dessinerAttente(conteneur, statut, moi, adversaire);
    } else {
      dessinerPlacement(conteneur, statut);
    }
  } else {
    dessinerCombat(conteneur, statut, etat, moi, adversaire, monId);
  }
}

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  contexte = { conteneur, etat, monId, envoyerAction };

  // Nouvelle partie ? On repart d'un placement vierge
  if (etat.idPartie !== idPartieLocale) {
    idPartieLocale = etat.idPartie;
    reinitialiserPlacement();
  }

  dessiner();
}