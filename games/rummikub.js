const COULEURS = ['noir', 'rouge', 'bleu', 'jaune'];
const TUILES_PAR_JOUEUR = 14;
const POINTS_PREMIER_DEPOT = 30;

// ===================== OUTILS =====================

function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

// Crée les 106 tuiles : chaque couleur et chaque valeur en 2 exemplaires, plus 2 jokers
function creerTuiles() {
  const tuiles = [];
  let id = 0;
  for (let copie = 0; copie < 2; copie++) {
    for (const couleur of COULEURS) {
      for (let valeur = 1; valeur <= 13; valeur++) {
        tuiles.push({ id: id++, couleur, valeur });
      }
    }
  }
  tuiles.push({ id: id++, joker: true });
  tuiles.push({ id: id++, joker: true });
  return tuiles;
}

const refus = (message) => ({ ok: false, message });

// Une clé qui identifie un ensemble par ses tuiles, sans tenir compte de l'ordre
function cleEnsemble(ids) {
  return [...ids].sort((a, b) => a - b).join(',');
}

// ===================== VALIDATION DES ENSEMBLES =====================

// Série : même couleur, valeurs qui se suivent (le joker prend la valeur de sa place)
function evaluerSerie(tuiles) {
  const n = tuiles.length;
  if (n < 3 || n > 13) return null;

  const reelles = tuiles.filter(t => !t.joker);
  if (reelles.length === 0) return null;
  if (reelles.some(t => t.couleur !== reelles[0].couleur)) return null;

  // La première vraie tuile, à la position k, permet de calculer la valeur de départ
  const k = tuiles.findIndex(t => !t.joker);
  const debut = tuiles[k].valeur - k;
  if (debut < 1 || debut + n - 1 > 13) return null;

  for (let i = 0; i < n; i++) {
    if (!tuiles[i].joker && tuiles[i].valeur !== debut + i) return null;
  }
  return { type: 'serie', points: n * debut + (n * (n - 1)) / 2 };
}

// Une série peut être posée dans les deux sens
function evaluerSerieDeuxSens(tuiles) {
  return evaluerSerie(tuiles) || evaluerSerie([...tuiles].reverse());
}

// Rangée : même valeur, couleurs toutes différentes, 3 ou 4 tuiles
function evaluerRangee(tuiles) {
  const n = tuiles.length;
  if (n < 3 || n > 4) return null;

  const reelles = tuiles.filter(t => !t.joker);
  if (reelles.length === 0) return null;
  const valeur = reelles[0].valeur;
  if (reelles.some(t => t.valeur !== valeur)) return null;

  const couleurs = new Set(reelles.map(t => t.couleur));
  if (couleurs.size !== reelles.length) return null;

  return { type: 'rangee', points: valeur * n };
}

// Renvoie { type, points } si l'ensemble est valide, sinon null
export function evaluerEnsemble(tuiles) {
  const serie = evaluerSerieDeuxSens(tuiles);
  const rangee = evaluerRangee(tuiles);
  if (serie && rangee) return serie.points >= rangee.points ? serie : rangee;
  return serie || rangee;
}

// ===================== VALIDATION D'UN COUP =====================

// table    : les ensembles actuels (tableaux de tuiles)
// main     : les tuiles du joueur
// aPose    : le joueur a-t-il déjà fait son premier dépôt ?
// proposee : la table proposée, sous forme de tableaux d'identifiants
// (Utilisée par l'hôte ET par l'affichage, pour prévenir le joueur tout de suite)
export function verifierCoup(table, main, aPose, proposee) {
  if (!Array.isArray(proposee)) return refus('Coup invalide.');

  const parId = new Map();
  table.flat().forEach(t => parId.set(t.id, t));
  const idsTable = new Set(parId.keys());
  const idsMain = new Set(main.map(t => t.id));
  main.forEach(t => parId.set(t.id, t));

  // Chaque tuile proposée doit exister, et n'apparaître qu'une fois
  const ensembles = [];
  const vus = new Set();
  for (const ensemble of proposee) {
    if (!Array.isArray(ensemble)) return refus('Coup invalide.');
    if (ensemble.length === 0) continue;
    for (const id of ensemble) {
      if (!Number.isInteger(id) || !parId.has(id) || vus.has(id)) return refus('Coup invalide.');
      vus.add(id);
    }
    ensembles.push(ensemble);
  }

  // Aucune tuile de la table ne doit disparaître
  for (const id of idsTable) {
    if (!vus.has(id)) return refus('Tu ne peux pas reprendre une tuile de la table dans ton jeu.');
  }

  // Il faut poser au moins une tuile de son jeu
  const idsPoses = [...vus].filter(id => idsMain.has(id));
  if (idsPoses.length === 0) {
    return refus('Déplace au moins une tuile de ton jeu vers la table, ou pioche.');
  }

  // Tous les ensembles doivent être valides
  const infos = [];
  for (const ensemble of ensembles) {
    const info = evaluerEnsemble(ensemble.map(id => parId.get(id)));
    if (!info) return refus("Un des ensembles de la table n'est pas valide.");
    infos.push(info);
  }

  if (aPose) return { ok: true, idsPoses };

  // Premier dépôt : la table existante ne doit pas être modifiée...
  const restants = ensembles.map((e, i) => ({ cle: cleEnsemble(e), info: infos[i] }));
  for (const ancien of table) {
    const cle = cleEnsemble(ancien.map(t => t.id));
    const position = restants.findIndex(r => r.cle === cle);
    if (position === -1) {
      return refus('Avant ton premier dépôt, tu ne peux pas modifier les ensembles déjà posés.');
    }
    restants.splice(position, 1);
  }
  // ... et les nouveaux ensembles doivent totaliser 30 points
  const points = restants.reduce((somme, r) => somme + r.info.points, 0);
  if (points < POINTS_PREMIER_DEPOT) {
    return refus(`Premier dépôt : il faut au moins ${POINTS_PREMIER_DEPOT} points (tu en as ${points}).`);
  }
  return { ok: true, idsPoses, points };
}

// ===================== FIN DE TOUR / FIN DE PARTIE =====================

function passerAuSuivant(n) {
  n.courant = (n.courant + 1) % n.joueurs.length;
  n.numeroTour++;
}

function finir(n, gagnant, message) {
  n.phase = 'fin';
  n.numeroTour++;
  n.resultat = { gagnant, message };
}

// ===================== L'OBJET DU JEU =====================

export const rummikub = {
  nom: 'Rummikub',
  joueursMin: 2,
  joueursMax: 4,

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['valider', 'piocher'],

  initialiser(joueurs) {
    const pioche = melanger(creerTuiles());
    const mains = {};
    joueurs.forEach((j) => {
      mains[j.id] = pioche.splice(0, TUILES_PAR_JOUEUR);
    });

    return {
      idPartie: Math.random().toString(36).substring(2),
      phase: 'jeu',                       // 'jeu' ou 'fin'
      joueurs: joueurs.map(j => ({ id: j.id, nom: j.nom, aPose: false })),
      mains,                              // { idJoueur: [tuiles] } (secret)
      pioche,                             // [tuiles] (secrète)
      table: [],                          // [[tuiles], [tuiles], ...]
      courant: Math.floor(Math.random() * joueurs.length),
      numeroTour: 0,
      blocages: 0,                        // passages consécutifs avec la pioche vide
      dernierEvenement: '',
      resultat: null,                     // { gagnant, message } à la fin
    };
  },

  traiterAction(etat, idJoueur, action) {
    if (!action || typeof action.type !== 'string') return etat;
    if (etat.phase !== 'jeu') return etat;
    if (etat.joueurs[etat.courant].id !== idJoueur) return etat; // pas son tour

    // ----- Piocher une tuile et finir son tour -----
    if (action.type === 'piocher') {
      const n = structuredClone(etat);
      const nom = n.joueurs[n.courant].nom;

      if (n.pioche.length > 0) {
        n.mains[idJoueur].push(n.pioche.pop());
        n.blocages = 0;
        n.dernierEvenement = `${nom} a pioché une tuile.`;
      } else {
        n.blocages++;
        n.dernierEvenement = `${nom} passe son tour (la pioche est vide).`;
        if (n.blocages >= n.joueurs.length) {
          finir(n, null, 'Plus de pioche et plus personne ne peut jouer : partie nulle.');
          return n;
        }
      }
      passerAuSuivant(n);
      return n;
    }

    // ----- Valider la table proposée -----
    if (action.type === 'valider') {
      const joueur = etat.joueurs[etat.courant];
      const verdict = verifierCoup(etat.table, etat.mains[idJoueur], joueur.aPose, action.table);
      if (!verdict.ok) return etat;

      const n = structuredClone(etat);
      const parId = new Map();
      n.table.flat().concat(n.mains[idJoueur]).forEach(t => parId.set(t.id, t));

      const posees = new Set(verdict.idsPoses);
      n.table = action.table
        .filter(ensemble => ensemble.length > 0)
        .map(ensemble => ensemble.map(id => parId.get(id)));
      n.mains[idJoueur] = n.mains[idJoueur].filter(t => !posees.has(t.id));
      n.joueurs[n.courant].aPose = true;
      n.blocages = 0;

      const nom = n.joueurs[n.courant].nom;
      n.dernierEvenement = `${nom} a posé ${posees.size} tuile(s).`;

      if (n.mains[idJoueur].length === 0) {
        finir(n, idJoueur, `${nom} a posé toutes ses tuiles.`);
        return n;
      }
      passerAuSuivant(n);
      return n;
    }

    return etat;
  },

  // Ce que CE joueur a le droit de voir : sa main, mais seulement le NOMBRE de tuiles des autres
  vuePour(etat, idJoueur) {
    return {
      idPartie: etat.idPartie,
      phase: etat.phase,
      joueurs: etat.joueurs.map(j => ({
        id: j.id,
        nom: j.nom,
        aPose: j.aPose,
        nbTuiles: etat.mains[j.id].length,
      })),
      table: etat.table,
      courant: etat.courant,
      numeroTour: etat.numeroTour,
      taillePioche: etat.pioche.length,
      main: etat.mains[idJoueur] || [],
      dernierEvenement: etat.dernierEvenement,
      resultat: etat.resultat,
    };
  },

  // Seul celui qui a vidé son jeu gagne : les autres perdent, sans différence
  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    const gagnant = etat.resultat.gagnant;
    return {
      terminee: true,
      gagnants: gagnant === null ? [] : etat.joueurs.filter(j => j.id === gagnant),
    };
  },
};