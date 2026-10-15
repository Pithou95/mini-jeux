import { CONSTANTES } from '../games/sumo.js';

const { RAYON_ARENE, RAYON_SUMO, VITESSE_ROTATION } = CONSTANTES;

const COULEURS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const PEAU = '#f3c9a0';
const TAILLE_CANVAS = 560;

// ===================== MÉMOIRE DU MODULE =====================

let instantane = null;     // dernier état reçu : { recu, etat }
let monIdCourant = null;
let envoyer = null;        // fonction pour envoyer une action
let racine = null;         // le bloc HTML du jeu
let canvas = null;
let ctx = null;
let zoneMessage = null;
let zoneScores = null;
let bouton = null;
let image = null;          // identifiant de la boucle de dessin
let boutonEnfonce = false; // le joueur maintient-il le bouton ?
let dernierEnvoi = 0;
let positionsAffichees = new Map(); // positions lissées : id -> { x, y }

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
  boutonEnfonce = false;
  positionsAffichees = new Map();
}

// État des sumos à l'instant présent : on prolonge la rotation depuis le dernier état reçu
function projeter() {
  const { recu, etat } = instantane;
  const ecoule = Math.min((performance.now() - recu) / 1000, 0.15);
  return etat.joueurs.map((j, indice) => {
    let angle = j.angle;
    if (etat.phase === 'manche' && j.vivant && !j.avance) {
      angle += j.sens * VITESSE_ROTATION * ecoule;
    }
    return { ...j, angle, indice };
  });
}

// Adoucit les déplacements entre deux états reçus
function lisser(joueurs) {
  return joueurs.map((j) => {
    let p = positionsAffichees.get(j.id);
    if (!p || Math.hypot(p.x - j.x, p.y - j.y) > 25) {
      p = { x: j.x, y: j.y };               // grand saut (nouvelle manche) : on y va direct
    } else {
      p.x += (j.x - p.x) * 0.5;
      p.y += (j.y - p.y) * 0.5;
    }
    positionsAffichees.set(j.id, p);
    return { ...j, x: p.x, y: p.y };
  });
}

// ===================== CONSTRUCTION DE LA PAGE (une seule fois) =====================

function construire(conteneur) {
  conteneur.innerHTML = '';
  positionsAffichees = new Map();

  racine = creer('div');
  racine.id = 'racineSumo';

  zoneMessage = creer('p', 'statutCode');
  zoneScores = creer('div', 'panneauCode');

  canvas = document.createElement('canvas');
  canvas.id = 'canvasSumo';
  canvas.width = TAILLE_CANVAS;
  canvas.height = TAILLE_CANVAS;
  ctx = canvas.getContext('2d');

  bouton = creer('button', null, 'AVANCER');
  bouton.id = 'boutonAvancer';
  bouton.type = 'button';

  const aide = creer('p', 'roleCode',
    'Maintiens le bouton appuyé pour avancer. Quand tu relâches, ton sumo tourne dans l\'autre sens. Premier à 3 manches !');

  racine.append(zoneMessage, zoneScores, canvas, bouton, aide);
  conteneur.appendChild(racine);

  // --- Le bouton « Avancer » : souris ET doigt ---
  bouton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bouton.setPointerCapture(e.pointerId); // on garde le contrôle même si le doigt dérape
    boutonEnfonce = true;
    bouton.classList.add('enfonce');
    envoyerAppui();
  });

  const relacher = () => {
    if (!boutonEnfonce) return;
    boutonEnfonce = false;
    bouton.classList.remove('enfonce');
    envoyer({ type: 'relache' });
  };
  bouton.addEventListener('pointerup', relacher);
  bouton.addEventListener('pointercancel', relacher);
  bouton.addEventListener('lostpointercapture', relacher);
  bouton.addEventListener('contextmenu', (e) => e.preventDefault()); // menu du appui long
}

// Annonce « j'appuie », avec l'angle que je vois à l'écran
function envoyerAppui() {
  if (!instantane) return;
  const moi = projeter().find(j => j.id === monIdCourant);
  if (!moi) return;
  dernierEnvoi = performance.now();
  envoyer({ type: 'appui', angle: moi.angle });
}

// ===================== POINT D'ENTRÉE =====================

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  instantane = { recu: performance.now(), etat: structuredClone(etat) };
  monIdCourant = monId;
  envoyer = envoyerAction;

  if (!racine || !conteneur.contains(racine)) {
    construire(conteneur);
  }
  mettreAJourTextes();

  if (image === null) {
    image = requestAnimationFrame(boucleDessin);
  }
}

function mettreAJourTextes() {
  const etat = instantane.etat;
  const moi = etat.joueurs.find(j => j.id === monIdCourant);

  let texte;
  if (etat.phase === 'compte') {
    texte = `Manche ${etat.manche} : prépare-toi !`;
  } else if (etat.phase === 'manche') {
    texte = moi && moi.vivant
      ? 'Maintiens AVANCER pour pousser tes adversaires !'
      : '💀 Tu es éliminé : regarde la fin de la manche.';
  } else if (etat.phase === 'fin') {
    texte = etat.resultat.gagnant === monIdCourant
      ? '🏆 Tu remportes la partie !'
      : `💀 ${etat.message}`;
  } else {
    texte = etat.message;
  }
  zoneMessage.textContent = texte;

  zoneScores.innerHTML = '';
  etat.joueurs.forEach((j, indice) => {
    const badge = creer('span', 'badgeCode' + (j.vivant ? '' : ' elimine'),
      `${j.nom} : ${j.victoires} 🏆`);
    badge.style.borderColor = COULEURS[indice];
    zoneScores.appendChild(badge);
  });

  const actif = etat.phase === 'manche' && moi && moi.vivant;
  bouton.classList.toggle('inactif', !actif);
}

// ===================== BOUCLE DE DESSIN (à chaque image de l'écran) =====================

function boucleDessin() {
  // Sécurité : si la page du jeu a disparu, on s'arrête
  if (!racine || !racine.isConnected) {
    image = null;
    return;
  }
  image = requestAnimationFrame(boucleDessin);

  const etat = instantane.etat;

  // Si je maintiens le bouton mais que mon sumo n'avance pas encore
  // (ex. j'ai appuyé pendant le décompte), on renvoie l'appui
  if (boutonEnfonce && etat.phase === 'manche') {
    const moi = etat.joueurs.find(j => j.id === monIdCourant);
    if (moi && moi.vivant && !moi.avance && performance.now() - dernierEnvoi > 150) {
      envoyerAppui();
    }
  }

  dessiner(lisser(projeter()), etat);
}

// ===================== DESSIN =====================

function dessiner(joueurs, etat) {
  const L = canvas.width;
  ctx.clearRect(0, 0, L, L);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, L, L);

  // On dessine en « unités du jeu » : le centre est en (0, 0), le terrain fait 280 de large
  ctx.save();
  ctx.translate(L / 2, L / 2);
  ctx.scale(L / 280, L / 280);

  // Plateforme carrée
  ctx.fillStyle = '#c8a46a';
  ctx.fillRect(-130, -130, 260, 260);
  ctx.strokeStyle = '#7c5a2b';
  ctx.lineWidth = 4;
  ctx.strokeRect(-130, -130, 260, 260);

  // Cercle de combat
  ctx.beginPath();
  ctx.arc(0, 0, RAYON_ARENE, 0, 2 * Math.PI);
  ctx.fillStyle = '#e7cf9f';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f8f1de';
  ctx.stroke();

  // Les éliminés d'abord (ils passent derrière), puis les vivants
  [...joueurs]
    .sort((a, b) => (a.vivant ? 1 : 0) - (b.vivant ? 1 : 0))
    .forEach(j => dessinerSumo(j, j.id === monIdCourant));

  ctx.restore();

  // Décompte, en pixels
  if (etat.phase === 'compte') {
    const ecoule = (performance.now() - instantane.recu) / 1000;
    const chiffre = Math.max(1, Math.ceil(etat.minuteur - ecoule));
    ctx.font = 'bold 160px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1f2937';
    ctx.strokeText(String(chiffre), L / 2, L / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(chiffre), L / 2, L / 2);
  }
}

function dessinerSumo(j, estMoi) {
  const r = RAYON_SUMO;

  ctx.save();
  ctx.translate(j.x, j.y);
  ctx.globalAlpha = j.vivant ? 1 : 0.4;

  // Anneau blanc autour de MON sumo
  if (estMoi && j.vivant) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 2.5, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Tout ce qui suit est tourné : l'avant du sumo est vers la droite
  ctx.rotate(j.angle);

  // Corps (couleur du joueur)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fillStyle = COULEURS[j.indice];
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Bras
  ctx.fillStyle = PEAU;
  [-1, 1].forEach((cote) => {
    ctx.beginPath();
    ctx.ellipse(r * 0.35, cote * r * 0.72, r * 0.32, r * 0.2, 0, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Tête
  ctx.beginPath();
  ctx.arc(r * 0.15, 0, r * 0.45, 0, 2 * Math.PI);
  ctx.fillStyle = PEAU;
  ctx.fill();
  ctx.stroke();

  // Yeux (côté avant)
  ctx.fillStyle = '#111827';
  [-1, 1].forEach((cote) => {
    ctx.beginPath();
    ctx.arc(r * 0.42, cote * r * 0.16, r * 0.06, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Chignon (côté arrière) : il permet de voir comment le sumo tourne
  ctx.beginPath();
  ctx.arc(-r * 0.28, 0, r * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = '#111827';
  ctx.fill();

  ctx.restore();

  // Nom et sens de rotation (non tournés)
  if (j.vivant) {
    const symbole = j.avance ? '▶' : (j.sens > 0 ? '↻' : '↺');
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1f2937';
    ctx.strokeText(`${j.nom} ${symbole}`, j.x, j.y - r - 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${j.nom} ${symbole}`, j.x, j.y - r - 4);
  }
}