import { MOTS } from './mots-codename.js';

// Les places : à 4 joueurs, les quatre ; à 2 joueurs, seulement l'équipe bleue
const PLACES_4 = ['espionRouge', 'operateurRouge', 'espionBleu', 'operateurBleu'];
const PLACES_2 = ['espionBleu', 'operateurBleu'];

// À 2 joueurs : l'équipe perd à la 4e erreur (elle a donc 3 « vies »)
const ERREURS_MAX = 3;

// ===================== OUTILS =====================

function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

// Enlève les accents et les majuscules pour comparer deux mots
function normaliser(texte) {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function suffixe(equipe) {
  return equipe === 'rouge' ? 'Rouge' : 'Bleu';
}

function equipeAdverse(equipe) {
  return equipe === 'rouge' ? 'bleu' : 'rouge';
}

function libelleCouleur(couleur) {
  const noms = { rouge: 'rouge', bleu: 'bleue', blanche: 'neutre', grise: 'grise', noire: 'noire' };
  return noms[couleur];
}

// Trouve la place occupée par un joueur (ou null)
export function placeDe(etat, idJoueur) {
  if (idJoueur === null || idJoueur === undefined) return null;
  for (const cle in etat.places) {
    if (etat.places[cle] === idJoueur) return cle;
  }
  return null;
}

// Tire 25 mots et leur attribue une couleur secrète
function creerCartes(mode, equipeDepart) {
  const mots = melanger([...MOTS]).slice(0, 25);
  let couleurs;
  if (mode === 4) {
    const autre = equipeAdverse(equipeDepart);
    couleurs = [
      ...Array(9).fill(equipeDepart), // l'équipe qui commence a 9 cartes
      ...Array(8).fill(autre),        // l'autre en a 8
      'noire',
      ...Array(7).fill('blanche'),
    ];
  } else {
    couleurs = [...Array(8).fill('bleu'), ...Array(17).fill('grise')];
  }
  melanger(couleurs);
  return mots.map((mot, i) => ({ mot, couleur: couleurs[i], revelee: false }));
}

// Vérifie un indice. Renvoie un message d'erreur, ou null si l'indice est valide.
// (Utilisée par les règles ET par l'affichage, pour prévenir l'espion tout de suite)
export function verifierIndice(etat, mot, nombre) {
  const m = typeof mot === 'string' ? mot.trim() : '';
  if (m === '') return 'Écris un indice.';
  if (/\s/.test(m)) return "L'indice doit être un seul mot.";
  if (m.length > 30) return 'Indice trop long (30 lettres maximum).';
  if (!Number.isInteger(nombre)) return 'Choisis un nombre de cartes.';

  const restantes = etat.restantes[etat.equipeCourante];
  // À 2 joueurs, « 1 » n'est possible qu'avec le joker
  const minimum = (etat.mode === 2 && !etat.jokerDisponible) ? 2 : 1;
  if (nombre < minimum || nombre > restantes) {
    return `Le nombre doit être entre ${minimum} et ${restantes}.`;
  }

  const motNormalise = normaliser(m);
  if (etat.cartes.some(c => !c.revelee && normaliser(c.mot) === motNormalise)) {
    return "L'indice ne peut pas être un mot visible sur le plateau.";
  }
  return null;
}

// ===================== FIN DE TOUR / FIN DE PARTIE =====================

function finir(n, equipeGagnante, message) {
  n.phase = 'fin';
  n.resultat = { equipeGagnante, message };
}

function finirTour(n) {
  n.indice = null;
  n.essais = 0;
  n.trouvesCeTour = 0;
  if (n.mode === 4) {
    n.equipeCourante = equipeAdverse(n.equipeCourante);
    return;
  }
  // 2 joueurs : s'il reste 1 seule carte et plus de joker, c'est perdu
  if (n.restantes.bleu === 1 && !n.jokerDisponible) {
    finir(n, null, 'Il reste une seule carte à trouver et le joker est déjà utilisé.');
  }
}

// Passe de la phase « choix » à la phase « jeu »
function demarrer(etat) {
  const n = structuredClone(etat);
  const equipeDepart = n.mode === 4 ? (Math.random() < 0.5 ? 'rouge' : 'bleu') : 'bleu';

  n.phase = 'jeu';
  n.equipeDepart = equipeDepart;
  n.equipeCourante = equipeDepart;
  n.cartes = creerCartes(n.mode, equipeDepart);
  n.restantes = n.mode === 4
    ? { rouge: equipeDepart === 'rouge' ? 9 : 8, bleu: equipeDepart === 'bleu' ? 9 : 8 }
    : { bleu: 8 };
  return n;
}

// ===================== PHASE « CHOIX DES PLACES » =====================

function traiterChoix(etat, idJoueur, action) {
  const placesValides = etat.mode === 4 ? PLACES_4 : PLACES_2;

  if (action.type === 'choisirPlace') {
    if (!placesValides.includes(action.place)) return etat;
    if (!etat.joueurs.some(j => j.id === idJoueur)) return etat;
    if (etat.places[action.place] !== null) return etat; // déjà prise (ou déjà la mienne)

    const n = structuredClone(etat);
    for (const cle in n.places) {
      if (n.places[cle] === idJoueur) n.places[cle] = null; // je quitte mon ancienne place
    }
    n.places[action.place] = idJoueur;
    return n;
  }

  if (action.type === 'quitterPlace') {
    if (placeDe(etat, idJoueur) === null) return etat;
    const n = structuredClone(etat);
    for (const cle in n.places) {
      if (n.places[cle] === idJoueur) n.places[cle] = null;
    }
    return n;
  }

  if (action.type === 'demarrer') {
    if (idJoueur !== 'hote') return etat; // seul l'hôte peut lancer
    if (placesValides.some(cle => etat.places[cle] === null)) return etat; // il manque du monde
    return demarrer(etat);
  }

  return etat;
}

// ===================== PHASE « JEU » =====================

function traiterJeu(etat, idJoueur, action) {
  const place = placeDe(etat, idJoueur);
  if (place === null) return etat;

  const equipe = etat.equipeCourante;
  const adverse = equipeAdverse(equipe);

  // ----- L'espion donne un indice -----
  if (action.type === 'donnerIndice') {
    if (place !== 'espion' + suffixe(equipe) || etat.indice !== null) return etat;
    if (verifierIndice(etat, action.mot, action.nombre) !== null) return etat;

    const n = structuredClone(etat);
    const mot = action.mot.trim();
    n.indice = { mot, nombre: action.nombre };
    n.essais = action.nombre + 1; // le nombre annoncé + 1 tentative bonus
    n.trouvesCeTour = 0;
    if (n.mode === 2 && action.nombre === 1) {
      n.jokerDisponible = false; // le joker est consommé
    }
    n.journal.push({ equipe, texte: `Indice : « ${mot} » pour ${action.nombre} carte(s)` });
    return n;
  }

  // ----- L'opérateur clique sur une carte -----
  if (action.type === 'reveler') {
    if (place !== 'operateur' + suffixe(equipe) || etat.indice === null) return etat;
    const i = action.indice;
    if (!Number.isInteger(i) || i < 0 || i >= etat.cartes.length) return etat;
    if (etat.cartes[i].revelee) return etat;

    const n = structuredClone(etat);
    const carte = n.cartes[i];
    carte.revelee = true;
    n.journal.push({ equipe, texte: `« ${carte.mot} » : carte ${libelleCouleur(carte.couleur)}` });

    if (carte.couleur === 'noire') {
      // Carte noire : l'équipe qui joue perd, l'autre gagne
      finir(n, adverse, `La carte noire a été révélée : l'équipe ${libelleCouleur(equipe)} perd !`);
    } else if (carte.couleur === 'rouge' || carte.couleur === 'bleu') {
      n.restantes[carte.couleur]--;
      if (n.restantes[carte.couleur] === 0) {
        // Une équipe n'a plus de cartes à trouver (même si c'est grâce à une erreur de l'autre)
        finir(n, carte.couleur, `Toutes les cartes ${libelleCouleur(carte.couleur)}s sont trouvées, tié un tigre !`);
      } else if (carte.couleur === equipe) {
        // Bonne carte : on continue tant qu'il reste des essais
        n.essais--;
        n.trouvesCeTour++;
        if (n.essais === 0) finirTour(n);
      } else {
        // Carte de l'équipe adverse : la main passe
        finirTour(n);
      }
    } else {
      // Carte blanche (4 joueurs) ou grise (2 joueurs)
      if (carte.couleur === 'grise') {
        n.erreurs++;
        if (n.erreurs >= ERREURS_MAX) {
          finir(n, null, 'Troisième erreur : TAI TAI MEI YONG.');
          return n;
        }
      }
      finirTour(n);
    }
    return n;
  }

  // ----- L'opérateur termine son tour volontairement -----
  if (action.type === 'terminerTour') {
    if (place !== 'operateur' + suffixe(equipe) || etat.indice === null) return etat;
    if (etat.trouvesCeTour < 1) return etat; // au moins une bonne carte d'abord

    const n = structuredClone(etat);
    n.journal.push({ equipe, texte: "L'opérateur termine son tour" });
    finirTour(n);
    return n;
  }

  return etat;
}

// ===================== L'OBJET DU JEU =====================

export const codename = {
  nom: 'Code Name',
  joueursMin: 2,
  joueursMax: 4,
  nombresAutorises: [2, 4], // pas de partie à 3 joueurs

  // Actions qu'un invité a le droit d'envoyer (« demarrer » est réservé à l'hôte)
  actionsAutorisees: ['choisirPlace', 'quitterPlace', 'donnerIndice', 'reveler', 'terminerTour'],

  // Crée la partie : on commence par le choix des places
  initialiser(joueurs) {
    const mode = joueurs.length >= 4 ? 4 : 2;
    const places = {};
    (mode === 4 ? PLACES_4 : PLACES_2).forEach(cle => { places[cle] = null; });

    return {
      idPartie: Math.random().toString(36).substring(2),
      phase: 'choix',                 // 'choix', 'jeu' ou 'fin'
      mode,                           // 2 ou 4 joueurs
      joueurs: joueurs.map(j => ({ id: j.id, nom: j.nom })),
      places,                         // qui occupe chaque place (id du joueur ou null)
      cartes: [],                     // créées au démarrage : { mot, couleur, revelee }
      restantes: null,                // cartes restantes à trouver par équipe
      equipeDepart: null,
      equipeCourante: null,
      indice: null,                   // { mot, nombre } quand l'espion a parlé
      essais: 0,                      // essais restants pour l'opérateur
      trouvesCeTour: 0,
      erreurs: 0,                     // (2 joueurs) nombre d'erreurs
      jokerDisponible: true,          // (2 joueurs)
      journal: [],                    // historique : { equipe, texte }
      resultat: null,                 // { equipeGagnante, message } à la fin
    };
  },

  traiterAction(etat, idJoueur, action) {
    if (!action || typeof action.type !== 'string') return etat;
    if (etat.phase === 'choix') return traiterChoix(etat, idJoueur, action);
    if (etat.phase === 'jeu') return traiterJeu(etat, idJoueur, action);
    return etat;
  },

  // Ce que CE joueur a le droit de voir : les opérateurs ne voient pas les couleurs cachées
  vuePour(etat, idJoueur) {
    if (etat.phase !== 'jeu') return etat; // à la fin, tout est révélé
    const place = placeDe(etat, idJoueur);
    if (place !== null && place.startsWith('espion')) return etat;

    const vue = structuredClone(etat);
    vue.cartes.forEach(c => {
      if (!c.revelee) c.couleur = null;
    });
    return vue;
  },

  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    const equipe = etat.resultat.equipeGagnante;
    const gagnants = equipe === null ? [] : etat.joueurs.filter(j => {
      const place = placeDe(etat, j.id);
      return place !== null && place.endsWith(suffixe(equipe));
    });
    return { terminee: true, gagnants };
  },
};