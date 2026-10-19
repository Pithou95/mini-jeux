// ===================== RÉGLAGES =====================
// Tu peux modifier ces valeurs pour changer les règles

const TAILLE = 10;                 // la grille fait 10 x 10
const REJOUER_SI_TOUCHE = false;   // true : un tir qui touche permet de rejouer
                                   // false : règle classique, on change de joueur à chaque tir

// La flotte classique : chaque joueur a ces 5 bateaux
const FLOTTE = [
  { nom: 'Porte-avions', taille: 5 },
  { nom: 'Croiseur', taille: 4 },
  { nom: 'Contre-torpilleur', taille: 3 },
  { nom: 'Sous-marin', taille: 3 },
  { nom: 'Torpilleur', taille: 2 },
];

// Partagé avec le fichier d'affichage
export const CONSTANTES = { TAILLE, FLOTTE };

// ===================== OUTILS (aussi utilisés par l'affichage) =====================

// Les cases occupées par un bateau { x, y, taille, horizontal }
// (x = colonne, y = ligne ; le bateau part de (x, y) vers la droite ou vers le bas)
export function casesDe(bateau) {
  const cases = [];
  for (let i = 0; i < bateau.taille; i++) {
    cases.push({
      x: bateau.x + (bateau.horizontal ? i : 0),
      y: bateau.y + (bateau.horizontal ? 0 : i),
    });
  }
  return cases;
}

function dansLaGrille(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < TAILLE && y >= 0 && y < TAILLE;
}

// Peut-on poser ce bateau sans sortir de la grille ni chevaucher les autres ?
// (les bateaux ont le droit de se toucher, comme dans la règle classique)
export function peutPlacer(autres, bateau) {
  const cases = casesDe(bateau);
  if (!cases.every(c => dansLaGrille(c.x, c.y))) return false;

  const occupees = new Set();
  autres.forEach(autre => casesDe(autre).forEach(c => occupees.add(c.x + ',' + c.y)));
  return cases.every(c => !occupees.has(c.x + ',' + c.y));
}

// Un bateau est coulé quand toutes ses cases ont été touchées
export function estCoule(bateau, tirs) {
  return bateau.cases.every(c => tirs.some(t => t.touche && t.x === c.x && t.y === c.y));
}

// Une flotte placée au hasard : [{ x, y, horizontal }, ...] dans l'ordre de FLOTTE
export function flotteAleatoire() {
  const poses = [];
  for (const type of FLOTTE) {
    let bateau;
    do {
      bateau = {
        x: Math.floor(Math.random() * TAILLE),
        y: Math.floor(Math.random() * TAILLE),
        horizontal: Math.random() < 0.5,
        taille: type.taille,
      };
    } while (!peutPlacer(poses, bateau));
    poses.push(bateau);
  }
  return poses.map(b => ({ x: b.x, y: b.y, horizontal: b.horizontal }));
}

// Vérifie la flotte envoyée par un joueur et la complète (nom, taille, cases).
// Renvoie null si quoi que ce soit est incorrect (jamais confiance au réseau !)
function construireFlotte(proposition) {
  if (!Array.isArray(proposition) || proposition.length !== FLOTTE.length) return null;

  const bateaux = [];
  for (let i = 0; i < FLOTTE.length; i++) {
    const p = proposition[i];
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || typeof p.horizontal !== 'boolean') {
      return null;
    }
    const bateau = {
      nom: FLOTTE[i].nom,
      taille: FLOTTE[i].taille,
      x: p.x,
      y: p.y,
      horizontal: p.horizontal,
    };
    if (!peutPlacer(bateaux, bateau)) return null;
    bateaux.push(bateau);
  }
  return bateaux.map(b => ({ ...b, cases: casesDe(b) }));
}

// ===================== LE JEU =====================

export const batailleNavale = {
  nom: 'Bataille navale',
  nombresAutorises: [2],

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['pret', 'tirer'],

  // Crée l'état de départ : chacun doit d'abord placer ses bateaux
  initialiser(joueurs) {
    return {
      idPartie: Math.random().toString(36).substring(2),
      phase: 'placement',               // 'placement', 'combat' ou 'fin'
      joueurs: joueurs.map(j => ({
        id: j.id,
        nom: j.nom,
        pret: false,                    // a validé sa flotte ?
        bateaux: [],                    // { nom, taille, x, y, horizontal, cases }
        tirs: [],                       // tirs REÇUS par ce joueur : { x, y, touche }
      })),
      courant: Math.floor(Math.random() * joueurs.length),
      dernier: null,                    // dernier tir : { tireur, x, y, resultat, nomBateau }
      vainqueur: null,
    };
  },

  traiterAction(etat, idJoueur, action) {
    if (!action || typeof action.type !== 'string') return etat;

    const position = etat.joueurs.findIndex(j => j.id === idJoueur);
    if (position === -1) return etat;

    // ----- Valider sa flotte -----
    if (action.type === 'pret') {
      if (etat.phase !== 'placement' || etat.joueurs[position].pret) return etat;

      const bateaux = construireFlotte(action.bateaux);
      if (bateaux === null) return etat;

      const nouvelEtat = structuredClone(etat);
      nouvelEtat.joueurs[position].bateaux = bateaux;
      nouvelEtat.joueurs[position].pret = true;

      // Quand les deux joueurs sont prêts, le combat commence
      if (nouvelEtat.joueurs.every(j => j.pret)) {
        nouvelEtat.phase = 'combat';
      }
      return nouvelEtat;
    }

    // ----- Tirer sur une case de l'adversaire -----
    if (action.type === 'tirer') {
      if (etat.phase !== 'combat' || position !== etat.courant) return etat;
      if (!dansLaGrille(action.x, action.y)) return etat;

      const { x, y } = action;
      const nouvelEtat = structuredClone(etat);
      const tireur = nouvelEtat.joueurs[position];
      const cible = nouvelEtat.joueurs[1 - position];

      // Interdit de tirer deux fois sur la même case
      if (cible.tirs.some(t => t.x === x && t.y === y)) return etat;

      const bateauTouche = cible.bateaux.find(b => b.cases.some(c => c.x === x && c.y === y));
      cible.tirs.push({ x, y, touche: bateauTouche !== undefined });

      let resultat = 'eau';
      let nomBateau = null;
      if (bateauTouche) {
        resultat = 'touche';
        if (estCoule(bateauTouche, cible.tirs)) {
          resultat = 'coule';
          nomBateau = bateauTouche.nom;
        }
      }
      nouvelEtat.dernier = { tireur: tireur.id, x, y, resultat, nomBateau };

      if (cible.bateaux.every(b => estCoule(b, cible.tirs))) {
        // Toute la flotte adverse est coulée : victoire
        nouvelEtat.phase = 'fin';
        nouvelEtat.vainqueur = tireur.id;
      } else if (!(bateauTouche && REJOUER_SI_TOUCHE)) {
        nouvelEtat.courant = 1 - position;
      }
      return nouvelEtat;
    }

    return etat;
  },

  // Ce que CE joueur a le droit de voir : jamais les bateaux adverses
  // (sauf ceux qui sont coulés, et tout à la fin de la partie)
  vuePour(etat, idJoueur) {
    if (etat.phase === 'fin') return etat;

    const vue = structuredClone(etat);
    vue.joueurs.forEach(joueur => {
      if (joueur.id !== idJoueur) {
        joueur.bateaux = joueur.bateaux.filter(b => estCoule(b, joueur.tirs));
      }
    });
    return vue;
  },

  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    return {
      terminee: true,
      gagnants: etat.joueurs.filter(j => j.id === etat.vainqueur),
    };
  },
};