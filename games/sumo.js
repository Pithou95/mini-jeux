// ===================== RÉGLAGES =====================
// Tu peux modifier ces valeurs pour changer la difficulté du jeu

const RAYON_ARENE = 100;               // rayon du cercle
const RAYON_SUMO = 10;                 // rayon d'un sumo
const RAYON_DEPART = 55;               // distance du centre au départ
const VITESSE = 50;                    // vitesse d'avance (unités par seconde)
const VITESSE_ROTATION = Math.PI;      // rotation : un tour en 2 secondes
const TOLERANCE_ANGLE = 1.0;           // écart accepté pour la compensation (en radians)
const MANCHES_POUR_GAGNER = 3;
const DUREE_COMPTE = 3;                // décompte avant chaque manche (secondes)
const DUREE_PAUSE = 3;                 // pause entre deux manches (secondes)

// Partagé avec le fichier d'affichage
export const CONSTANTES = {
  RAYON_ARENE, RAYON_SUMO, VITESSE, VITESSE_ROTATION, MANCHES_POUR_GAGNER,
};

// ===================== OUTILS =====================

// Ramène un angle entre 0 et 2π
function normaliser(angle) {
  const tour = 2 * Math.PI;
  return ((angle % tour) + tour) % tour;
}

// Écart entre deux angles, entre -π et π
function ecartAngle(a, b) {
  let d = normaliser(a - b);
  if (d > Math.PI) d -= 2 * Math.PI;
  return d;
}

// Place les sumos à égale distance du centre, tournés vers le centre
function placer(etat) {
  const n = etat.joueurs.length;
  const decalage = Math.random() * 2 * Math.PI;
  etat.joueurs.forEach((j, i) => {
    const a = decalage + (2 * Math.PI * i) / n;
    j.x = Math.cos(a) * RAYON_DEPART;
    j.y = Math.sin(a) * RAYON_DEPART;
    j.angle = normaliser(a + Math.PI);          // regarde le centre
    j.sens = Math.random() < 0.5 ? 1 : -1;      // 1 = horaire, -1 = antihoraire
    j.vivant = true;
    j.avance = false;
  });
  etat.phase = 'compte';
  etat.minuteur = DUREE_COMPTE;
}

// ===================== SIMULATION D'UN PAS DE TEMPS =====================

function simuler(etat, dt) {
  const vivants = etat.joueurs.filter(j => j.vivant);

  // 1) Chacun avance (bouton maintenu) ou tourne (bouton relâché)
  vivants.forEach((j) => {
    if (j.avance) {
      j.x += Math.cos(j.angle) * VITESSE * dt;
      j.y += Math.sin(j.angle) * VITESSE * dt;
    } else {
      j.angle = normaliser(j.angle + j.sens * VITESSE_ROTATION * dt);
    }
  });

  // 2) Collisions : on sépare les sumos qui se chevauchent (plusieurs passes)
  for (let passe = 0; passe < 5; passe++) {
    for (let i = 0; i < vivants.length; i++) {
      for (let k = i + 1; k < vivants.length; k++) {
        const a = vivants[i];
        const b = vivants[k];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= 2 * RAYON_SUMO) continue;

        const recouvrement = 2 * RAYON_SUMO - distance;
        const nx = distance > 0.0001 ? dx / distance : 1;
        const ny = distance > 0.0001 ? dy / distance : 0;

        // Qui pousse qui ? On regarde si chacun avance VERS l'autre
        const poussA = a.avance ? Math.max(0, Math.cos(a.angle) * nx + Math.sin(a.angle) * ny) : 0;
        const poussB = b.avance ? Math.max(0, -(Math.cos(b.angle) * nx + Math.sin(b.angle) * ny)) : 0;
        const total = poussA + poussB;

        // Part du recul supportée par A : plus B pousse fort, plus A recule
        const partA = total > 0 ? poussB / total : 0.5;
        const partB = 1 - partA;

        a.x -= nx * recouvrement * partA;
        a.y -= ny * recouvrement * partA;
        b.x += nx * recouvrement * partB;
        b.y += ny * recouvrement * partB;
      }
    }
  }

  // 3) Élimination : le sumo est ENTIÈREMENT hors du cercle
  vivants.forEach((j) => {
    if (Math.hypot(j.x, j.y) >= RAYON_ARENE + RAYON_SUMO) {
      j.vivant = false;
      j.avance = false;
    }
  });

  // 4) Fin de manche ?
  const restants = etat.joueurs.filter(j => j.vivant);
  if (restants.length > 1) return;

  etat.joueurs.forEach(j => { j.avance = false; });

  if (restants.length === 0) {
    etat.message = `Manche ${etat.manche} : égalité, personne ne marque.`;
    etat.phase = 'finManche';
    etat.minuteur = DUREE_PAUSE;
    return;
  }

  const gagnant = restants[0];
  gagnant.victoires++;
  if (gagnant.victoires >= MANCHES_POUR_GAGNER) {
    etat.phase = 'fin';
    etat.resultat = { gagnant: gagnant.id };
    etat.message = `${gagnant.nom} remporte la partie !`;
  } else {
    etat.message = `${gagnant.nom} remporte la manche ${etat.manche} !`;
    etat.phase = 'finManche';
    etat.minuteur = DUREE_PAUSE;
  }
}

// ===================== L'OBJET DU JEU =====================

export const sumo = {
  nom: 'Sumo',
  joueursMin: 2,
  joueursMax: 4,

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['appui', 'relache'],

  initialiser(joueurs) {
    const etat = {
      idPartie: Math.random().toString(36).substring(2),
      phase: 'compte',        // 'compte', 'manche', 'finManche' ou 'fin'
      manche: 1,
      minuteur: DUREE_COMPTE, // secondes restantes (décompte ou pause)
      message: '',
      resultat: null,         // { gagnant } à la fin de la partie
      joueurs: joueurs.map(j => ({
        id: j.id, nom: j.nom, victoires: 0,
        x: 0, y: 0, angle: 0, sens: 1, vivant: true, avance: false,
      })),
    };
    placer(etat);
    return etat;
  },

  // Appelée par l'hôte environ 30 fois par seconde. Modifie l'état et le renvoie.
  pas(etat, dt) {
    if (etat.phase === 'compte') {
      etat.minuteur -= dt;
      if (etat.minuteur <= 0) {
        etat.phase = 'manche';
        etat.minuteur = 0;
      }
    } else if (etat.phase === 'finManche') {
      etat.minuteur -= dt;
      if (etat.minuteur <= 0) {
        etat.manche++;
        placer(etat);
      }
    } else if (etat.phase === 'manche') {
      simuler(etat, dt);
    }
    return etat;
  },

  // Un joueur appuie ou relâche le bouton « Avancer »
  traiterAction(etat, idJoueur, action) {
    if (!action || etat.phase !== 'manche') return etat;
    const n = structuredClone(etat);
    const j = n.joueurs.find(p => p.id === idJoueur);
    if (!j || !j.vivant) return etat;

    if (action.type === 'appui') {
      if (j.avance) return etat;
      // Compensation du retard : on utilise l'angle vu par le joueur,
      // à condition qu'il reste proche de l'angle réel (anti-triche)
      if (Number.isFinite(action.angle) &&
          Math.abs(ecartAngle(action.angle, j.angle)) <= TOLERANCE_ANGLE) {
        j.angle = normaliser(action.angle);
      }
      j.avance = true;
      return n;
    }

    if (action.type === 'relache') {
      if (!j.avance) return etat;
      j.avance = false;
      j.sens = -j.sens; // il repart dans l'autre sens
      return n;
    }

    return etat;
  },

  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    return {
      terminee: true,
      gagnants: etat.joueurs.filter(j => j.id === etat.resultat.gagnant),
    };
  },
};