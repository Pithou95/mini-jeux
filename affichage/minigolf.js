import { PARCOURS, TROU_BONUS, LARGEUR, HAUTEUR } from '../games/parcours-minigolf.js';
import { CONSTANTES, idTireur } from '../games/minigolf.js';

const { R_BALLE, R_TROU, TEMPS_TIR, DRAG_MAX, COUPS_MAX, NB_TROUS } = CONSTANTES;

const COULEURS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const ECHELLE = 1.1;               // un peu plus de pixels que d'unités, pour une image nette
const RAYON_SAISIE = 40;           // on peut attraper sa balle à moins de 40 unités
const TIRAGE_MIN = 10;             // en dessous de cette distance de tirage, le tir est annulé

// ===================== MÉMOIRE DU MODULE =====================

let instantane = null;      // dernier état reçu : { recu, etat }
let monIdCourant = null;
let envoyer = null;         // fonction pour envoyer une action
let racine = null;          // le bloc HTML du jeu
let canvas = null;
let ctx = null;
let zoneMessage = null;
let zoneInfo = null;
let zoneTemps = null;
let zoneTableau = null;
let image = null;           // identifiant de la boucle de dessin
let positionsAffichees = new Map();   // positions lissées : id -> { x, y }
let visee = null;           // position du doigt / de la souris pendant la visée (en unités du terrain)
let tirEnvoye = false;      // j'ai déjà tiré pendant ce tour
let cleTour = '';           // identifie le tour en cours
let instantTour = 0;        // l'instant où le tour est apparu sur MON écran
let clePhase = '';
let instantPhase = 0;
let cleTableau = '';
let texteMessage = '';

// ===================== OUTILS =====================

function creer(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

// Appelé quand on quitte la partie (retour à la salle)
export function arreter() {
  if (image !== null) cancelAnimationFrame(image);
  image = null;
  racine = null;
  instantane = null;
  visee = null;
  cleTour = '';
  clePhase = '';
  cleTableau = '';
  positionsAffichees = new Map();
}

function trouAffiche(etat) {
  const auBonus = etat.phase.startsWith('bonus') || (etat.phase === 'fin' && etat.bonus !== null);
  return auBonus ? TROU_BONUS : PARCOURS[etat.trous[etat.numTrou]];
}

function tempsRestant() {
  return TEMPS_TIR - (performance.now() - instantTour) / 1000;
}

function peutViser() {
  if (!instantane) return false;
  const etat = instantane.etat;
  if (etat.phase !== 'tir' && etat.phase !== 'bonusTir') return false;
  return idTireur(etat) === monIdCourant && !tirEnvoye && tempsRestant() > 0;
}

function maBalle() {
  return instantane.etat.balles[monIdCourant];
}

// Position de la souris ou du doigt, en unités du terrain
function versTerrain(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * LARGEUR) / rect.width,
    y: ((e.clientY - rect.top) * HAUTEUR) / rect.height,
  };
}

// ===================== PRÉDICTION DE L'AFFICHAGE =====================

// État des balles à l'instant présent : on prolonge un peu leur mouvement depuis le dernier état reçu
function projeter() {
  const { recu, etat } = instantane;
  const ecoule = Math.min((performance.now() - recu) / 1000, 0.1);
  const roule = etat.phase === 'roule' || etat.phase === 'bonusRoule';
  return Object.keys(etat.balles).map((id) => {
    const b = etat.balles[id];
    let { x, y } = b;
    if (roule && b.etat === 'jeu') {
      x += b.vx * ecoule;
      y += b.vy * ecoule;
    }
    return { id, x, y, etat: b.etat };
  });
}

// Adoucit les déplacements entre deux états reçus
function lisser(balles) {
  return balles.map((b) => {
    let p = positionsAffichees.get(b.id);
    if (!p || Math.hypot(p.x - b.x, p.y - b.y) > 40) {
      p = { x: b.x, y: b.y };                 // grand saut (nouveau trou) : on y va direct
    } else {
      p.x += (b.x - p.x) * 0.6;
      p.y += (b.y - p.y) * 0.6;
    }
    positionsAffichees.set(b.id, p);
    return { ...b, x: p.x, y: p.y };
  });
}

// ===================== CONSTRUCTION DE LA PAGE (une seule fois) =====================

function construire(conteneur) {
  conteneur.innerHTML = '';
  positionsAffichees = new Map();
  cleTableau = '';
  texteMessage = '';

  racine = creer('div');
  racine.id = 'racineMinigolf';

  zoneInfo = creer('p', 'roleCode');
  zoneMessage = creer('p', 'statutCode');
  zoneTemps = creer('p', 'roleCode');

  canvas = document.createElement('canvas');
  canvas.id = 'canvasMinigolf';
  canvas.width = Math.round(LARGEUR * ECHELLE);
  canvas.height = Math.round(HAUTEUR * ECHELLE);
  ctx = canvas.getContext('2d');

  const aide = creer('p', 'roleCode',
    'Pose le doigt (ou la souris) sur ta balle, tire vers l\'arrière puis relâche : plus tu tires loin, plus le tir est puissant.');
  zoneTableau = creer('div');
  zoneTableau.id = 'tableauMinigolf';

  racine.append(zoneInfo, zoneMessage, zoneTemps, canvas, aide, zoneTableau);
  conteneur.appendChild(racine);

  // --- Visée : souris ET doigt ---
  canvas.addEventListener('pointerdown', (e) => {
    if (!peutViser()) return;
    const p = versTerrain(e);
    const b = maBalle();
    if (Math.hypot(p.x - b.x, p.y - b.y) > RAYON_SAISIE) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    visee = p;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (visee) visee = versTerrain(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!visee) return;
    const p = versTerrain(e);
    visee = null;
    if (!peutViser()) return;
    const b = maBalle();
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const tirage = Math.hypot(dx, dy);
    if (tirage < TIRAGE_MIN) return;            // trop court : tir annulé
    tirEnvoye = true;
    envoyer({ type: 'tir', angle: Math.atan2(dy, dx), puissance: Math.min(1, tirage / DRAG_MAX) });
  });

  canvas.addEventListener('pointercancel', () => { visee = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ===================== POINT D'ENTRÉE =====================

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  instantane = { recu: performance.now(), etat: structuredClone(etat) };
  monIdCourant = monId;
  envoyer = envoyerAction;

  if (!racine || !conteneur.contains(racine)) {
    construire(conteneur);
  }

  // Nouveau tour de jeu : mon compte à rebours repart de zéro
  const cle = `${etat.idPartie}:${etat.tour}`;
  if (cle !== cleTour) {
    cleTour = cle;
    instantTour = performance.now();
    tirEnvoye = false;
    visee = null;
  }
  const clePh = `${etat.idPartie}:${etat.numTrou}:${etat.phase}:${etat.tour}`;
  if (clePh !== clePhase) {
    clePhase = clePh;
    instantPhase = performance.now();
  }

  mettreAJourTextes();

  if (image === null) {
    image = requestAnimationFrame(boucleDessin);
  }
}

// ===================== TEXTES ET TABLEAU =====================

function nomDe(etat, id) {
  const joueur = etat.joueurs.find(j => j.id === id);
  return joueur ? joueur.nom : '?';
}

function mettreAJourTextes() {
  const etat = instantane.etat;

  // Ligne d'information : numéro et nom du trou
  let info;
  if (etat.phase.startsWith('bonus')) {
    info = `⛳ Trou bonus (manche ${etat.bonus.manche}) : le plus proche du trou gagne`;
  } else if (etat.phase === 'fin') {
    info = 'Partie terminée';
  } else {
    const trou = PARCOURS[etat.trous[etat.numTrou]];
    info = `⛳ Trou ${etat.numTrou + 1} / ${NB_TROUS} : ${trou.nom}`;
  }
  if (zoneInfo.textContent !== info) zoneInfo.textContent = info;

  // Message principal
  let texte;
  const tireur = (etat.phase === 'tir' || etat.phase === 'bonusTir') ? idTireur(etat) : null;
  if (etat.phase === 'tir' || etat.phase === 'bonusTir') {
    texte = tireur === monIdCourant
      ? 'À toi de jouer !'
      : `Tour de ${nomDe(etat, tireur)}`;
  } else if (etat.phase === 'roule' || etat.phase === 'bonusRoule') {
    texte = 'Les balles roulent...';
  } else if (etat.phase === 'finTrou') {
    texte = 'Trou terminé !';
  } else if (etat.phase === 'bonusFin') {
    const gagnants = etat.bonus.resolu.gagnantsIds;
    texte = gagnants.length === 1
      ? `${nomDe(etat, gagnants[0])} est le plus proche du trou !`
      : 'Égalité : on recommence le tir bonus !';
  } else {
    const ids = etat.resultat.gagnantsIds;
    if (ids.length > 1) texte = '🤝 ' + etat.resultat.message;
    else if (ids[0] === monIdCourant) texte = '🏆 Tu remportes la partie ! ' + etat.resultat.message;
    else texte = '💀 ' + etat.resultat.message;
  }
  if (etat.evenement && etat.phase !== 'fin') texte += ' — ' + etat.evenement;
  if (texte !== texteMessage) {
    texteMessage = texte;
    zoneMessage.textContent = texte;
  }

  majTemps();
  majTableau(etat);
}

function majTemps() {
  if (!instantane) return;
  const etat = instantane.etat;
  let texte = '';
  if (etat.phase === 'tir' || etat.phase === 'bonusTir') {
    texte = `Temps pour tirer : ${Math.max(0, Math.ceil(tempsRestant()))} s`;
  } else if (etat.phase === 'finTrou' || etat.phase === 'bonusFin') {
    const reste = Math.max(0, etat.pause - (performance.now() - instantPhase) / 1000);
    texte = `Suite dans ${Math.ceil(reste)} s`;
  }
  if (zoneTemps.textContent !== texte) zoneTemps.textContent = texte;
}

// Le tableau des scores : une ligne par joueur, une colonne par trou
function majTableau(etat) {
  const cle = JSON.stringify([
    etat.joueurs.map(j => [j.nom, j.total, j.coupsParTrou]),
    etat.numTrou,
    etat.phase === 'finTrou' || etat.phase === 'fin' || etat.phase.startsWith('bonus'),
    Object.keys(etat.balles).map(id => [id, etat.balles[id].coups, etat.balles[id].etat]),
  ]);
  if (cle === cleTableau) return;
  cleTableau = cle;

  const table = creer('table');
  const entete = creer('tr');
  entete.appendChild(creer('th', null, 'Joueur'));
  for (let i = 0; i < NB_TROUS; i++) entete.appendChild(creer('th', null, String(i + 1)));
  entete.appendChild(creer('th', null, 'Total'));
  table.appendChild(entete);

  const termine = etat.phase === 'finTrou' || etat.phase === 'fin' || etat.phase.startsWith('bonus');
  etat.joueurs.forEach((joueur, indice) => {
    const ligne = creer('tr');
    const nom = creer('td', 'nomJoueur', joueur.nom + (joueur.id === monIdCourant ? ' (toi)' : ''));
    nom.style.borderLeft = `6px solid ${COULEURS[indice]}`;
    ligne.appendChild(nom);

    for (let i = 0; i < NB_TROUS; i++) {
      let texte = '';
      let classe = '';
      if (joueur.coupsParTrou[i] !== null) {
        texte = String(joueur.coupsParTrou[i]);
      } else if (i === etat.numTrou && !termine && etat.balles[joueur.id]) {
        const b = etat.balles[joueur.id];
        classe = 'encours';
        if (b.etat === 'trou') texte = `✔ ${b.coups}`;
        else if (b.etat === 'abandon') texte = `✖ ${COUPS_MAX}`;
        else texte = String(b.coups);
      }
      ligne.appendChild(creer('td', classe, texte));
    }
    ligne.appendChild(creer('td', 'total', String(joueur.total)));
    table.appendChild(ligne);
  });

  zoneTableau.innerHTML = '';
  zoneTableau.appendChild(table);
}

// ===================== BOUCLE DE DESSIN (à chaque image de l'écran) =====================

function boucleDessin() {
  // Sécurité : si la page du jeu a disparu, on s'arrête
  if (!racine || !racine.isConnected) {
    image = null;
    return;
  }
  image = requestAnimationFrame(boucleDessin);

  // Le doigt ne fait défiler la page que si je ne suis pas en train de viser
  const visable = peutViser();
  canvas.style.touchAction = visable ? 'none' : 'auto';
  if (visee && !visable) visee = null;          // temps écoulé pendant la visée

  majTemps();
  dessiner(lisser(projeter()), instantane.etat);
}

// ===================== DESSIN =====================

function dessiner(balles, etat) {
  const trou = trouAffiche(etat);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ECHELLE, 0, 0, ECHELLE, 0, 0);

  // Le terrain
  ctx.beginPath();
  trou.contour.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#3f9b4b';
  ctx.fill();

  // Le sable
  ctx.fillStyle = '#e6cf8f';
  trou.sable.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));

  // Les obstacles
  trou.obstacles.forEach((o) => {
    ctx.fillStyle = '#8b5a2b';
    ctx.strokeStyle = '#5b3a1a';
    ctx.lineWidth = 2;
    if (o.type === 'rect') {
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  });

  // Les murs du contour
  ctx.beginPath();
  trou.contour.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Point de départ
  ctx.beginPath();
  ctx.arc(trou.depart.x, trou.depart.y, 26, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Le trou et son drapeau
  ctx.beginPath();
  ctx.arc(trou.trou.x, trou.trou.y, R_TROU, 0, 2 * Math.PI);
  ctx.fillStyle = '#0b1220';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(trou.trou.x, trou.trou.y);
  ctx.lineTo(trou.trou.x, trou.trou.y - 30);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(trou.trou.x, trou.trou.y - 30);
  ctx.lineTo(trou.trou.x + 16, trou.trou.y - 24);
  ctx.lineTo(trou.trou.x, trou.trou.y - 18);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  // Les balles encore en jeu
  const tireur = (etat.phase === 'tir' || etat.phase === 'bonusTir') ? idTireur(etat) : null;
  balles.filter(b => b.etat === 'jeu').forEach((b) => {
    const indice = etat.joueurs.findIndex(j => j.id === b.id);
    // Halo autour de la balle du joueur dont c'est le tour
    if (b.id === tireur) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, R_BALLE + 5, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, R_BALLE, 0, 2 * Math.PI);
    ctx.fillStyle = COULEURS[indice];
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // La visée
  if (visee && peutViser()) {
    dessinerVisee(balles.find(b => b.id === monIdCourant));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function dessinerVisee(balle) {
  if (!balle) return;
  const dx = balle.x - visee.x;
  const dy = balle.y - visee.y;
  const tirage = Math.hypot(dx, dy);
  if (tirage < 1) return;
  const puissance = Math.min(1, tirage / DRAG_MAX);
  const ux = dx / tirage;
  const uy = dy / tirage;

  // L'élastique : de la balle jusqu'au doigt (limité à la puissance maximale)
  const longueurElastique = Math.min(tirage, DRAG_MAX);
  ctx.beginPath();
  ctx.moveTo(balle.x, balle.y);
  ctx.lineTo(balle.x - ux * longueurElastique, balle.y - uy * longueurElastique);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // La flèche : direction du tir, de plus en plus longue et rouge quand la puissance monte
  const longueur = 25 + 110 * puissance;
  const bx = balle.x + ux * longueur;
  const by = balle.y + uy * longueur;
  const rouge = Math.round(255 * puissance);
  const vert = Math.round(220 * (1 - puissance) + 40);
  const couleur = tirage < TIRAGE_MIN ? 'rgba(255, 255, 255, 0.4)' : `rgb(${rouge}, ${vert}, 60)`;
  ctx.beginPath();
  ctx.moveTo(balle.x + ux * (R_BALLE + 3), balle.y + uy * (R_BALLE + 3));
  ctx.lineTo(bx, by);
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pointe de flèche
  ctx.beginPath();
  ctx.moveTo(bx + ux * 10, by + uy * 10);
  ctx.lineTo(bx - uy * 7, by + ux * 7);
  ctx.lineTo(bx + uy * 7, by - ux * 7);
  ctx.closePath();
  ctx.fillStyle = couleur;
  ctx.fill();

  // Pourcentage de puissance
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1f2937';
  ctx.strokeText(`${Math.round(puissance * 100)} %`, bx, by - 14);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.round(puissance * 100)} %`, bx, by - 14);
}