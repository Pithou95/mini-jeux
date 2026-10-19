import { PARCOURS, TROU_BONUS, LARGEUR, HAUTEUR } from './parcours-minigolf.js';

// ===================== RÉGLAGES =====================
// Tu peux modifier ces valeurs pour changer le jeu

const NB_TROUS = 5;            // nombre de trous par partie (tirés au hasard parmi PARCOURS)
const COUPS_MAX = 8;           // au 8e coup, le trou compte 8 et la balle est retirée
const TEMPS_TIR = 20;          // secondes pour viser et tirer
const DELAI_GRACE = 1;         // marge pour les tirs encore en route sur le réseau
const DUREE_ROULE_MAX = 15;    // si ça roule encore après 15 s, tout s'arrête de force
const DUREE_PAUSE = 4;         // pause entre deux trous (secondes)
const BONUS_TOURS_MAX = 5;     // nombre maximum de manches de trou bonus

const R_BALLE = 7;             // rayon d'une balle
const R_TROU = 11;             // rayon du trou dessiné
const R_CAPTURE = 10;          // une balle dont le centre passe à moins de 10 du trou tombe dedans
const VMAX = 700;              // vitesse d'une balle tirée à pleine puissance
const V_MIN_TIR = 40;          // vitesse minimale d'un tir
const DRAG_MAX = 120;          // distance de tirage (en unités) qui donne la pleine puissance

// Frottement : la vitesse diminue de K (proportionnel) et de C (constant) par seconde
const K_ROULE = 1.4;
const C_ROULE = 40;
const K_SABLE = 4;
const C_SABLE = 100;
const V_ARRET = 8;             // en dessous de cette vitesse, la balle s'arrête

// Rebonds (1 = rebond parfait)
const E_MUR = 0.8;
const E_PLOT = 0.9;
const E_BALLE = 0.92;

const PAS_PHYSIQUE = 1 / 240;  // la simulation avance par petits pas pour qu'aucune balle ne traverse un mur

// Partagé avec le fichier d'affichage
export const CONSTANTES = {
  NB_TROUS, COUPS_MAX, TEMPS_TIR, R_BALLE, R_TROU, VMAX, DRAG_MAX, LARGEUR, HAUTEUR,
};

// ===================== OUTILS =====================

function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

// Prépare (une seule fois) la liste des murs d'un trou
const memoire = new Map();
export function geometrie(trou) {
  if (memoire.has(trou)) return memoire.get(trou);
  const segments = [];
  const ajouterContour = (points) => {
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      segments.push([p[0], p[1], q[0], q[1]]);
    });
  };
  ajouterContour(trou.contour);
  const cercles = [];
  trou.obstacles.forEach((o) => {
    if (o.type === 'rect') {
      ajouterContour([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]);
    } else {
      cercles.push(o);
    }
  });
  const geo = { segments, cercles, sables: trou.sable, contour: trou.contour, trou: trou.trou };
  memoire.set(trou, geo);
  return geo;
}

// Le point (x, y) est-il à l'intérieur de la forme ?
export function dansPolygone(x, y, points) {
  let dedans = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// Positions de départ (à l'écart les unes des autres pour ne pas se chevaucher)
export function positionsDepart(depart, n) {
  const decalages = {
    1: [[0, 0]],
    2: [[-10, 0], [10, 0]],
    3: [[-10, -8], [10, -8], [0, 10]],
    4: [[-10, -10], [10, -10], [-10, 10], [10, 10]],
  }[n];
  return decalages.map(([dx, dy]) => ({ x: depart.x + dx, y: depart.y + dy }));
}

// Trou bonus : les balles sont placées à égale distance du trou
export function positionsBonus(n) {
  const rayon = 280;
  const angles = {
    1: [90], 2: [75, 105], 3: [65, 90, 115], 4: [60, 80, 100, 120],
  }[n];
  return angles.map((deg) => ({
    x: TROU_BONUS.trou.x + rayon * Math.cos((deg * Math.PI) / 180),
    y: TROU_BONUS.trou.y + rayon * Math.sin((deg * Math.PI) / 180),
  }));
}

// Qui doit tirer en ce moment ?
export function idTireur(etat) {
  if (etat.phase === 'bonusTir' || etat.phase === 'bonusRoule') {
    return etat.bonus.ordre[etat.bonus.courant];
  }
  return etat.ordre[etat.courant];
}

// Le trou en cours (ou le trou bonus)
export function trouCourant(etat) {
  if (etat.phase.startsWith('bonus')) return TROU_BONUS;
  return PARCOURS[etat.trous[etat.numTrou]];
}

// ===================== PHYSIQUE =====================

function enSable(geo, b) {
  return geo.sables.some(r => b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h);
}

function collisionMur(b, s) {
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  const longueur2 = dx * dx + dy * dy;
  let t = ((b.x - s[0]) * dx + (b.y - s[1]) * dy) / longueur2;
  t = Math.max(0, Math.min(1, t));
  const cx = s[0] + t * dx;
  const cy = s[1] + t * dy;
  let nx = b.x - cx;
  let ny = b.y - cy;
  const d = Math.hypot(nx, ny);
  if (d >= R_BALLE) return;
  if (d < 1e-6) {               // centre exactement sur le mur : on prend la perpendiculaire
    const l = Math.sqrt(longueur2);
    nx = -dy / l;
    ny = dx / l;
  } else {
    nx /= d;
    ny /= d;
  }
  b.x = cx + nx * R_BALLE;
  b.y = cy + ny * R_BALLE;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + E_MUR) * vn * nx;
    b.vy -= (1 + E_MUR) * vn * ny;
  }
}

function collisionPlot(b, c) {
  let nx = b.x - c.x;
  let ny = b.y - c.y;
  const d = Math.hypot(nx, ny);
  const limite = R_BALLE + c.r;
  if (d >= limite) return;
  if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
  b.x = c.x + nx * limite;
  b.y = c.y + ny * limite;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + E_PLOT) * vn * nx;
    b.vy -= (1 + E_PLOT) * vn * ny;
  }
}

function collisionBalles(a, b) {
  let nx = b.x - a.x;
  let ny = b.y - a.y;
  const d = Math.hypot(nx, ny);
  if (d >= 2 * R_BALLE) return;
  if (d < 1e-6) { nx = 1; ny = 0; } else { nx /= d; ny /= d; }
  const recouvrement = 2 * R_BALLE - d;
  a.x -= (nx * recouvrement) / 2;
  a.y -= (ny * recouvrement) / 2;
  b.x += (nx * recouvrement) / 2;
  b.y += (ny * recouvrement) / 2;
  const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vrel < 0) {
    const impulsion = (-(1 + E_BALLE) * vrel) / 2;
    a.vx -= impulsion * nx;
    a.vy -= impulsion * ny;
    b.vx += impulsion * nx;
    b.vy += impulsion * ny;
  }
}

// Fait avancer toutes les balles de « dt » secondes (en plusieurs petits pas)
function avancer(etat, geo, dt, avecCollisions) {
  let reste = dt;
  while (reste > 1e-9) {
    const h = Math.min(PAS_PHYSIQUE, reste);
    reste -= h;

    const ids = Object.keys(etat.balles).filter(id => etat.balles[id].etat === 'jeu');
    const precedentes = {};

    // 1) Déplacement et frottement
    ids.forEach((id) => {
      const b = etat.balles[id];
      precedentes[id] = { x: b.x, y: b.y };
      if (b.vx === 0 && b.vy === 0) return;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const vitesse = Math.hypot(b.vx, b.vy);
      const sable = enSable(geo, b);
      const k = sable ? K_SABLE : K_ROULE;
      const c = sable ? C_SABLE : C_ROULE;
      const nouvelle = vitesse * Math.exp(-k * h) - c * h;
      if (nouvelle < V_ARRET) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx *= nouvelle / vitesse;
        b.vy *= nouvelle / vitesse;
      }
    });

    // 2) Murs et plots (deux passes pour bien gérer les coins)
    for (let passe = 0; passe < 2; passe++) {
      ids.forEach((id) => {
        const b = etat.balles[id];
        geo.segments.forEach(s => collisionMur(b, s));
        geo.cercles.forEach(c => collisionPlot(b, c));
      });
    }

    // 3) Balles contre balles
    if (avecCollisions) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          collisionBalles(etat.balles[ids[i]], etat.balles[ids[j]]);
        }
      }
      // Une balle repoussée contre un mur par une autre
      ids.forEach((id) => {
        const b = etat.balles[id];
        geo.segments.forEach(s => collisionMur(b, s));
        geo.cercles.forEach(c => collisionPlot(b, c));
      });
    }

    // 4) Sécurité : une balle ne doit jamais sortir du terrain
    ids.forEach((id) => {
      const b = etat.balles[id];
      if (!dansPolygone(b.x, b.y, geo.contour)) {
        b.x = precedentes[id].x;
        b.y = precedentes[id].y;
        b.vx = 0;
        b.vy = 0;
      }
    });

    // 5) Le trou : peu importe la vitesse, la balle tombe dedans
    ids.forEach((id) => {
      const b = etat.balles[id];
      if (Math.hypot(b.x - geo.trou.x, b.y - geo.trou.y) < R_CAPTURE) {
        b.etat = 'trou';
        b.x = geo.trou.x;
        b.y = geo.trou.y;
        b.vx = 0;
        b.vy = 0;
        const joueur = etat.joueurs.find(j => j.id === id);
        etat.evenement = `${joueur ? joueur.nom : id} : dans le trou !`;
      }
    });
  }
}

// Simule UN tir sur un trou, sans les autres balles (utile pour les tests et pour vérifier un trou)
export function simulerTir(trou, x, y, angle, puissance) {
  const etat = {
    joueurs: [{ id: 'a', nom: 'a' }],
    balles: { a: { x, y, vx: 0, vy: 0, etat: 'jeu', coups: 1 } },
    evenement: '',
  };
  const b = etat.balles.a;
  const vitesse = Math.max(V_MIN_TIR, Math.min(1, puissance) * VMAX);
  b.vx = Math.cos(angle) * vitesse;
  b.vy = Math.sin(angle) * vitesse;
  const geo = geometrie(trou);
  let duree = 0;
  while ((b.vx !== 0 || b.vy !== 0) && duree < DUREE_ROULE_MAX) {
    avancer(etat, geo, 1 / 60, false);
    duree += 1 / 60;
  }
  return { x: b.x, y: b.y, dedans: b.etat === 'trou', duree };
}

// ===================== DÉROULEMENT D'UNE PARTIE =====================

function nomDe(etat, id) {
  const joueur = etat.joueurs.find(j => j.id === id);
  return joueur ? joueur.nom : '?';
}

// Prépare un nouveau trou : balles au départ, premier joueur de l'ordre
function demarrerTrou(etat) {
  const trou = PARCOURS[etat.trous[etat.numTrou]];
  const positions = positionsDepart(trou.depart, etat.joueurs.length);
  etat.balles = {};
  etat.joueurs.forEach((j, i) => {
    etat.balles[j.id] = { x: positions[i].x, y: positions[i].y, vx: 0, vy: 0, etat: 'jeu', coups: 0 };
  });
  etat.courant = 0;
  etat.phase = 'tir';
  etat.ecoule = 0;
  etat.tour++;
  etat.version++;
  etat.evenement = '';
}

// Ordre du trou suivant : le meilleur du classement commence
function ordreSuivant(etat) {
  const dernier = etat.numTrou;
  return [...etat.joueurs]
    .sort((a, b) =>
      a.total - b.total ||
      a.coupsParTrou[dernier] - b.coupsParTrou[dernier] ||
      etat.ordre.indexOf(a.id) - etat.ordre.indexOf(b.id))
    .map(j => j.id);
}

// Qui tire ensuite (parmi ceux dont la balle est encore en jeu) ? -1 si personne
function prochainIndex(etat) {
  const ordre = etat.ordre;
  for (let pas = 1; pas <= ordre.length; pas++) {
    const index = (etat.courant + pas) % ordre.length;
    if (etat.balles[ordre[index]].etat === 'jeu') return index;
  }
  return -1;
}

function terminerPartie(etat, ids, message) {
  etat.phase = 'fin';
  etat.resultat = { gagnantsIds: ids, message };
  etat.version++;
}

// Tous les joueurs ont fini le trou : on compte les coups
function finDuTrou(etat) {
  etat.joueurs.forEach((j) => {
    const b = etat.balles[j.id];
    const coups = b.etat === 'abandon' ? COUPS_MAX : Math.max(1, b.coups);
    j.coupsParTrou[etat.numTrou] = coups;
    j.total += coups;
  });
  etat.phase = 'finTrou';
  etat.pause = DUREE_PAUSE;
  etat.version++;
}

// Après un tir (ou une pénalité) : balles retirées, fin du trou ou joueur suivant
function apresTir(etat) {
  Object.keys(etat.balles).forEach((id) => {
    const b = etat.balles[id];
    if (b.etat === 'jeu' && b.coups >= COUPS_MAX) {
      b.etat = 'abandon';
      b.vx = 0;
      b.vy = 0;
      etat.evenement = `${nomDe(etat, id)} a atteint ${COUPS_MAX} coups : balle retirée.`;
    }
  });

  const suivant = prochainIndex(etat);
  if (suivant === -1) {
    finDuTrou(etat);
    return;
  }
  etat.courant = suivant;
  etat.phase = 'tir';
  etat.ecoule = 0;
  etat.tour++;
  etat.version++;
}

// ----- Trou bonus -----

function demarrerBonus(etat, ids, numeroManche) {
  const positions = positionsBonus(ids.length);
  etat.bonus = { ids, ordre: melanger([...ids]), courant: 0, manche: numeroManche, distances: {}, resolu: null };
  etat.balles = {};
  ids.forEach((id, i) => {
    etat.balles[id] = { x: positions[i].x, y: positions[i].y, vx: 0, vy: 0, etat: 'jeu', coups: 0 };
  });
  etat.phase = 'bonusTir';
  etat.ecoule = 0;
  etat.tour++;
  etat.version++;
  etat.evenement = '';
}

function distanceAuTrou(b) {
  return b.etat === 'trou' ? 0 : Math.hypot(b.x - TROU_BONUS.trou.x, b.y - TROU_BONUS.trou.y);
}

// Après le tir bonus d'un joueur (ou son temps écoulé)
function apresTirBonus(etat) {
  const bonus = etat.bonus;
  const id = bonus.ordre[bonus.courant];
  bonus.distances[id] = distanceAuTrou(etat.balles[id]);
  bonus.courant++;

  if (bonus.courant < bonus.ordre.length) {
    etat.phase = 'bonusTir';
    etat.ecoule = 0;
    etat.tour++;
    etat.version++;
    return;
  }

  // Tout le monde a tiré : le plus proche gagne
  const plusPetite = Math.min(...bonus.ids.map(i => bonus.distances[i]));
  const gagnants = bonus.ids.filter(i => bonus.distances[i] - plusPetite < 1);
  bonus.resolu = { gagnantsIds: gagnants };
  etat.phase = 'bonusFin';
  etat.pause = DUREE_PAUSE;
  etat.version++;
}

// Fin de la pause : trou suivant, ou fin de partie
function suiteApresPause(etat) {
  if (etat.phase === 'finTrou') {
    if (etat.numTrou + 1 < NB_TROUS) {
      etat.ordre = ordreSuivant(etat);
      etat.numTrou++;
      demarrerTrou(etat);
      return;
    }
    // Dernier trou terminé : classement final
    const meilleur = Math.min(...etat.joueurs.map(j => j.total));
    const tetes = etat.joueurs.filter(j => j.total === meilleur);
    if (tetes.length === 1) {
      terminerPartie(etat, [tetes[0].id], `${tetes[0].nom} gagne avec ${meilleur} coups !`);
    } else {
      demarrerBonus(etat, tetes.map(j => j.id), 1);
    }
    return;
  }

  if (etat.phase === 'bonusFin') {
    const gagnants = etat.bonus.resolu.gagnantsIds;
    const meilleur = Math.min(...etat.joueurs.map(j => j.total));
    if (gagnants.length === 1) {
      terminerPartie(etat, gagnants,
        `Égalité à ${meilleur} coups : ${nomDe(etat, gagnants[0])} l'emporte au trou bonus !`);
    } else if (etat.bonus.manche >= BONUS_TOURS_MAX) {
      terminerPartie(etat, gagnants, `Égalité parfaite à ${meilleur} coups : victoire partagée.`);
    } else {
      demarrerBonus(etat, gagnants, etat.bonus.manche + 1);
    }
  }
}

// Le temps de tir est écoulé
function tempsEcoule(etat) {
  if (etat.phase === 'tir') {
    const id = etat.ordre[etat.courant];
    etat.balles[id].coups++;                 // pénalité : +1 coup
    etat.evenement = `${nomDe(etat, id)} n'a pas tiré à temps : +1 coup de pénalité.`;
    apresTir(etat);
  } else {
    const id = etat.bonus.ordre[etat.bonus.courant];
    etat.evenement = `${nomDe(etat, id)} n'a pas tiré à temps.`;
    apresTirBonus(etat);
  }
}

// Fait rouler les balles
function simulerRoulement(etat, dt) {
  const bonus = etat.phase === 'bonusRoule';
  const geo = geometrie(trouCourant(etat));
  etat.ecoule += dt;
  avancer(etat, geo, dt, !bonus);   // pas de collisions entre balles au trou bonus (équité)
  etat.version++;

  const balles = Object.values(etat.balles);
  const toutesArretees = balles.every(b => b.etat !== 'jeu' || (b.vx === 0 && b.vy === 0));
  if (!toutesArretees && etat.ecoule < DUREE_ROULE_MAX) return;

  balles.forEach((b) => { b.vx = 0; b.vy = 0; });   // arrêt forcé si besoin
  if (bonus) apresTirBonus(etat);
  else apresTir(etat);
}

// ===================== L'OBJET DU JEU =====================

export const minigolf = {
  nom: 'Mini-golf',
  joueursMin: 2,
  joueursMax: 4,

  // Le jeu avance avec le temps mais n'envoie l'état que quand « version » change
  diffusionSurChangement: true,

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['tir'],

  initialiser(joueurs) {
    const indices = melanger(PARCOURS.map((_, i) => i)).slice(0, NB_TROUS);
    const etat = {
      idPartie: Math.random().toString(36).substring(2),
      version: 0,              // augmente à chaque changement visible
      phase: 'tir',            // 'tir', 'roule', 'finTrou', 'bonusTir', 'bonusRoule', 'bonusFin', 'fin'
      joueurs: joueurs.map(j => ({
        id: j.id, nom: j.nom, total: 0, coupsParTrou: Array(NB_TROUS).fill(null),
      })),
      trous: indices,          // les 5 trous de la partie (indices dans PARCOURS)
      numTrou: 0,
      ordre: melanger(joueurs.map(j => j.id)),   // ordre de jeu du trou en cours
      courant: 0,              // position du joueur qui tire dans « ordre »
      tour: 0,                 // augmente à chaque nouveau tour de jeu
      balles: {},              // { idJoueur: { x, y, vx, vy, etat, coups } }
      ecoule: 0,               // secondes écoulées dans la phase en cours
      pause: 0,                // secondes restantes avant la suite
      evenement: '',           // petit message (balle dans le trou, pénalité...)
      bonus: null,             // infos du trou bonus s'il y en a un
      resultat: null,          // { gagnantsIds, message } à la fin
    };
    demarrerTrou(etat);
    return etat;
  },

  // Appelée par l'hôte environ 30 fois par seconde
  pas(etat, dt) {
    if (etat.phase === 'tir' || etat.phase === 'bonusTir') {
      etat.ecoule += dt;
      if (etat.ecoule >= TEMPS_TIR + DELAI_GRACE) tempsEcoule(etat);
    } else if (etat.phase === 'roule' || etat.phase === 'bonusRoule') {
      simulerRoulement(etat, dt);
    } else if (etat.phase === 'finTrou' || etat.phase === 'bonusFin') {
      etat.pause -= dt;
      if (etat.pause <= 0) suiteApresPause(etat);
    }
    return etat;
  },

  // Un joueur tire : { type: 'tir', angle, puissance }
  traiterAction(etat, idJoueur, action) {
    if (!action || action.type !== 'tir') return etat;
    if (etat.phase !== 'tir' && etat.phase !== 'bonusTir') return etat;
    if (idJoueur !== idTireur(etat)) return etat;                   // ce n'est pas ton tour
    if (!Number.isFinite(action.angle) || !Number.isFinite(action.puissance)) return etat;
    if (action.puissance <= 0) return etat;

    const n = structuredClone(etat);
    const b = n.balles[idJoueur];
    const vitesse = Math.max(V_MIN_TIR, Math.min(1, action.puissance) * VMAX);
    b.vx = Math.cos(action.angle) * vitesse;
    b.vy = Math.sin(action.angle) * vitesse;
    b.coups++;
    n.phase = etat.phase === 'tir' ? 'roule' : 'bonusRoule';
    n.ecoule = 0;
    n.evenement = '';
    n.version++;
    return n;
  },

  estTerminee(etat) {
    if (etat.phase !== 'fin') return { terminee: false };
    return {
      terminee: true,
      gagnants: etat.joueurs.filter(j => etat.resultat.gagnantsIds.includes(j.id)),
    };
  },
};