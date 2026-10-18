import { PAYS } from './donnees-pays.js';

// ===================== RÉGLAGES =====================
// Tu peux modifier ces valeurs pour changer le jeu

const SCORE_VICTOIRE = 20;     // points à atteindre pour gagner
const DUREE_QUESTION = 10;     // secondes pour répondre
const DELAI_GRACE = 1;         // l'hôte attend un peu pour les réponses encore en route sur le réseau
const TOLERANCE_TEMPS = 0.3;   // temps de réponse maximum accepté : DUREE_QUESTION + cette marge
const DUREE_PAUSE = 5;         // secondes d'affichage de la bonne réponse

// Partagé avec le fichier d'affichage
export const CONSTANTES = { SCORE_VICTOIRE, DUREE_QUESTION };

// Les 3 types de questions
const TYPES = ['drapeau', 'capitale', 'pays'];

// Drapeaux presque identiques : on ne les met jamais ensemble dans les 4 choix
const JUMEAUX = [['id', 'mc'], ['ro', 'td']];

// ===================== OUTILS =====================

function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

function sontJumeaux(codeA, codeB) {
  return JUMEAUX.some(p => (p[0] === codeA && p[1] === codeB) || (p[0] === codeB && p[1] === codeA));
}

// Temps moyen (en millisecondes) sur les BONNES réponses uniquement
function moyenne(joueur) {
  return joueur.nbBonnes > 0 ? joueur.sommeTemps / joueur.nbBonnes : Infinity;
}

function secondes(ms) {
  return (ms / 1000).toFixed(2).replace('.', ',') + ' s';
}

// ===================== CRÉATION D'UNE QUESTION =====================

function creerQuestion(etat) {
  // Un même pays ne revient pas deux fois dans la partie
  let disponibles = PAYS.filter(p => !etat.utilises.includes(p.code));
  if (disponibles.length === 0) {
    etat.utilises = [];
    disponibles = [...PAYS];
  }
  const sujet = disponibles[Math.floor(Math.random() * disponibles.length)];
  etat.utilises.push(sujet.code);

  const type = TYPES[Math.floor(Math.random() * TYPES.length)];

  // 3 mauvaises propositions, tirées parmi tous les autres pays
  const autres = melanger(PAYS.filter(p => p.code !== sujet.code));
  const mauvaises = [];
  for (const pays of autres) {
    if (mauvaises.length === 3) break;
    if (type === 'drapeau' && [sujet, ...mauvaises].some(p => sontJumeaux(p.code, pays.code))) continue;
    mauvaises.push(pays);
  }
  const propositions = melanger([sujet, ...mauvaises]);
  const texteOption = (pays) => (type === 'capitale' ? pays.capitale : pays.nom);

  const question = {
    type,
    options: propositions.map(texteOption),
    bonne: propositions.indexOf(sujet),   // SECRET : jamais envoyé avant la révélation
    enonce: '',
    sujetTexte: null,
    drapeau: null,
  };
  if (type === 'drapeau') {
    question.enonce = 'À quel pays appartient ce drapeau ?';
    question.drapeau = sujet.code;
  } else if (type === 'capitale') {
    question.enonce = 'Quelle est la capitale du pays suivant ?';
    question.sujetTexte = sujet.nom;
  } else {
    question.enonce = 'De quel pays cette ville est-elle la capitale ?';
    question.sujetTexte = sujet.capitale;
  }
  return question;
}

// Passe à la question suivante (modifie l'état sur place)
function nouvelleQuestion(etat) {
  etat.numero++;
  etat.question = creerQuestion(etat);
  etat.reponses = {};
  etat.ecoule = 0;
  etat.pause = 0;
  etat.derniere = null;
  etat.phase = 'question';
  etat.version++;
}

// ===================== FIN D'UNE QUESTION : CALCUL DES POINTS =====================

function cloturer(etat) {
  const bonne = etat.question.bonne;

  // 1) Ce que chacun a fait
  const details = etat.joueurs.map((joueur) => {
    const r = etat.reponses[joueur.id];
    const aRepondu = Boolean(r) && r.choix !== null;
    return {
      id: joueur.id,
      nom: joueur.nom,
      choix: aRepondu ? r.choix : null,
      passe: Boolean(r) && r.passe,
      temps: aRepondu ? r.temps : null,
      correct: aRepondu && r.choix === bonne,
      premier: false,
      delta: 0,
    };
  });

  // 2) Le plus rapide parmi ceux qui ont BIEN répondu gagne un point bonus
  const corrects = details.filter(d => d.correct);
  if (corrects.length > 0) {
    const premier = corrects.reduce((a, b) => (b.temps < a.temps ? b : a));
    premier.premier = true;
  }

  // 3) Les points : bonne = +1, mauvaise = -1, rien = 0, premier correct = +1 en plus
  details.forEach((d) => {
    if (d.correct) d.delta = 1;
    else if (d.choix !== null) d.delta = -1;
    if (d.premier) d.delta += 1;

    const joueur = etat.joueurs.find(j => j.id === d.id);
    joueur.score += d.delta;
    if (d.correct) {
      joueur.sommeTemps += d.temps;
      joueur.nbBonnes++;
    }
  });

  etat.derniere = { bonne, details };
  etat.version++;

  // 4) Quelqu'un a-t-il atteint l'objectif ?
  const meilleur = Math.max(...etat.joueurs.map(j => j.score));
  if (meilleur >= SCORE_VICTOIRE) {
    terminer(etat, meilleur);
  } else {
    etat.phase = 'revelation';
    etat.pause = DUREE_PAUSE;
  }
}

function terminer(etat, meilleur) {
  const enTete = etat.joueurs.filter(j => j.score === meilleur);
  let gagnants = enTete;
  let message;

  if (enTete.length === 1) {
    message = `${enTete[0].nom} gagne avec ${meilleur} points !`;
  } else {
    // Égalité de points : le plus rapide en moyenne (sur ses bonnes réponses) gagne
    const meilleureMoyenne = Math.min(...enTete.map(j => Math.round(moyenne(j))));
    gagnants = enTete.filter(j => Math.round(moyenne(j)) === meilleureMoyenne);
    if (gagnants.length === 1) {
      const comparaison = enTete.map(j => `${j.nom} : ${secondes(moyenne(j))}`).join(' ; ');
      message = `Égalité à ${meilleur} points : ${gagnants[0].nom} l'emporte grâce à un temps moyen plus rapide ` +
        `sur ses bonnes réponses (${comparaison}).`;
    } else {
      message = `Égalité parfaite à ${meilleur} points, avec le même temps moyen.`;
    }
  }

  etat.phase = 'fin';
  etat.resultat = { gagnantsIds: gagnants.map(j => j.id), message };
}

// ===================== L'OBJET DU JEU =====================

export const pays = {
  nom: 'Pays',
  joueursMin: 2,
  joueursMax: 4,

  // Le jeu avance avec le temps (minuteur de la question)...
  // ...mais n'envoie l'état que quand quelque chose change (pas 30 fois par seconde)
  diffusionSurChangement: true,

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['repondre', 'passer'],

  initialiser(joueurs) {
    const etat = {
      idPartie: Math.random().toString(36).substring(2),
      version: 0,            // augmente à chaque changement visible
      phase: 'question',     // 'question', 'revelation' ou 'fin'
      numero: 0,
      joueurs: joueurs.map(j => ({
        id: j.id, nom: j.nom, score: 0, sommeTemps: 0, nbBonnes: 0,
      })),
      utilises: [],          // codes des pays déjà posés
      question: null,        // contient la bonne réponse (secret)
      reponses: {},          // { idJoueur: { choix, passe, temps } } (secret)
      ecoule: 0,             // secondes écoulées depuis le début de la question
      pause: 0,              // secondes restantes avant la prochaine question
      derniere: null,        // résultats de la question qui vient de se terminer
      resultat: null,        // { gagnantsIds, message } à la fin de la partie
    };
    nouvelleQuestion(etat);
    return etat;
  },

  // Appelée par l'hôte environ 30 fois par seconde : fait avancer le minuteur
  pas(etat, dt) {
    if (etat.phase === 'question') {
      etat.ecoule += dt;
      const tousOntRepondu = etat.joueurs.every(j => etat.reponses[j.id]);
      if (tousOntRepondu || etat.ecoule >= DUREE_QUESTION + DELAI_GRACE) {
        cloturer(etat);
      }
    } else if (etat.phase === 'revelation') {
      etat.pause -= dt;
      if (etat.pause <= 0) {
        nouvelleQuestion(etat);
      }
    }
    return etat;
  },

  // Un joueur répond ou passe
  traiterAction(etat, idJoueur, action) {
    if (!action || etat.phase !== 'question') return etat;
    if (!etat.joueurs.some(j => j.id === idJoueur)) return etat;
    if (etat.reponses[idJoueur]) return etat;            // une seule réponse par question

    if (action.type === 'passer') {
      const n = structuredClone(etat);
      n.reponses[idJoueur] = { choix: null, passe: true, temps: null };
      n.version++;
      return n;
    }

    if (action.type === 'repondre') {
      const choixValide = Number.isInteger(action.choix) && action.choix >= 0 && action.choix < etat.question.options.length;
      const tempsValide = typeof action.temps === 'number' && Number.isFinite(action.temps)
        && action.temps >= 0 && action.temps <= (DUREE_QUESTION + TOLERANCE_TEMPS) * 1000;
      if (!choixValide || !tempsValide) return etat;

      const n = structuredClone(etat);
      n.reponses[idJoueur] = { choix: action.choix, passe: false, temps: Math.round(action.temps) };
      n.version++;
      return n;
    }

    return etat;
  },

  // Ce que CE joueur a le droit de voir : jamais la bonne réponse avant la fin de la question
  vuePour(etat, idJoueur) {
    const q = etat.question;
    const aRepondu = {};
    etat.joueurs.forEach((j) => { aRepondu[j.id] = Boolean(etat.reponses[j.id]); });
    const mienne = etat.reponses[idJoueur];

    return {
      idPartie: etat.idPartie,
      phase: etat.phase,
      numero: etat.numero,
      objectif: SCORE_VICTOIRE,
      joueurs: etat.joueurs.map(j => ({
        id: j.id,
        nom: j.nom,
        score: j.score,
        moyenne: j.nbBonnes > 0 ? Math.round(j.sommeTemps / j.nbBonnes) : null,
      })),
      question: {
        type: q.type,
        enonce: q.enonce,
        sujetTexte: q.sujetTexte,
        drapeau: q.drapeau,
        options: q.options,
      },
      aRepondu,                                              // qui a répondu (pas quoi)
      maReponse: mienne ? { choix: mienne.choix, passe: mienne.passe } : null,
      pause: etat.pause,
      derniere: etat.derniere,                               // null tant que la question est en cours
      resultat: etat.resultat,
    };
  },

  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    return {
      terminee: true,
      gagnants: etat.joueurs.filter(j => etat.resultat.gagnantsIds.includes(j.id)),
    };
  },
};