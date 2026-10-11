import { chronometre } from '../games/chronometre.js';

const DUREE_VISIBLE = 4000; // le chrono est visible pendant 4 secondes

// Mémoire du module (ces variables survivent entre deux affichages)
let idPartieEnCours = null; // quelle partie est en cours chez moi
let debut = 0;              // l'instant où MON chrono a démarré
let intervalle = null;      // la répétition qui met à jour l'affichage
let arretEnvoye = false;    // true quand j'ai déjà cliqué sur STOP
let tempsLocal = null;      // mon temps mesuré (en attendant la réponse de l'hôte)
let contexte = null;        // dernières infos reçues (état, fonction d'envoi...)

function formater(millisecondes) {
  return (millisecondes / 1000).toFixed(2) + ' s';
}

function arreterChrono() {
  clearInterval(intervalle);
  intervalle = null;
}

// Appelé quand on quitte la partie (retour à la salle)
export function arreter() {
  arreterChrono();
  idPartieEnCours = null;
}

// Je clique sur STOP (ou le temps maximum est atteint)
function stopper() {
  if (arretEnvoye) return;
  arretEnvoye = true;
  arreterChrono();

  // C'est MON navigateur qui mesure le temps : le réseau n'a aucune influence
  tempsLocal = Math.round(performance.now() - debut);

  const zoneTemps = document.getElementById('affichageTemps');
  if (zoneTemps) zoneTemps.textContent = formater(tempsLocal);
  const bouton = document.getElementById('boutonStop');
  if (bouton) bouton.disabled = true;

  contexte.envoyerAction({ type: 'stop', temps: tempsLocal });
}

// Appelée toutes les 50 ms : met à jour l'affichage du temps
function tick() {
  const ecoule = performance.now() - debut;
  const zoneTemps = document.getElementById('affichageTemps');
  if (zoneTemps) {
    zoneTemps.textContent = ecoule < DUREE_VISIBLE ? formater(ecoule) : '🙈';
  }
  const message = document.getElementById('messageChrono');
  if (message && ecoule >= DUREE_VISIBLE) {
    message.textContent = 'Le chronomètre est caché : à toi de juger !';
  }

  // Sécurité : si quelqu'un ne clique jamais, on stoppe à 2 fois la cible
  if (ecoule >= contexte.etat.cible * 2000) {
    stopper();
  }
}

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  contexte = { etat, monId, envoyerAction };

  // Nouvelle partie ? On (re)démarre mon chrono
  if (etat.idPartie !== idPartieEnCours) {
    idPartieEnCours = etat.idPartie;
    debut = performance.now();
    arretEnvoye = false;
    tempsLocal = null;
    arreterChrono();
    intervalle = setInterval(tick, 50);
  }

  const moi = etat.joueurs.find(j => j.id === monId);
  const monTemps = moi.temps !== null ? moi.temps : tempsLocal;
  const resultat = chronometre.estTerminee(etat);

  // ----- Construction de la page -----
  conteneur.innerHTML = '';

  const objectif = document.createElement('p');
  objectif.id = 'objectif';
  objectif.textContent = `Objectif : ${etat.cible} secondes`;

  const zoneTemps = document.createElement('div');
  zoneTemps.id = 'affichageTemps';
  zoneTemps.textContent = monTemps !== null ? formater(monTemps) : '0.00 s';

  const message = document.createElement('p');
  message.id = 'messageChrono';

  const bouton = document.createElement('button');
  bouton.id = 'boutonStop';
  bouton.textContent = 'STOP';
  bouton.disabled = monTemps !== null;
  bouton.addEventListener('click', stopper);

  conteneur.append(objectif, zoneTemps, bouton, message);

  if (monTemps !== null && !resultat.terminee) {
    message.textContent = 'Temps enregistré ! En attente des autres joueurs...';
  } else if (monTemps === null) {
    message.textContent = 'Clique sur STOP quand tu penses avoir atteint l\'objectif.';
  }

  // ----- Liste des joueurs / résultats -----
  const liste = document.createElement('ul');
  liste.id = 'listeChrono';
  const cibleMs = etat.cible * 1000;

  if (resultat.terminee) {
    // Classement du plus proche au plus éloigné
    const classes = [...etat.joueurs].sort(
      (a, b) => Math.abs(a.temps - cibleMs) - Math.abs(b.temps - cibleMs)
    );
    classes.forEach((joueur, position) => {
      const ecart = Math.abs(joueur.temps - cibleMs);
      const gagnant = resultat.gagnants.some(g => g.id === joueur.id);
      const ligne = document.createElement('li');
      if (gagnant) ligne.className = 'gagnant';
      ligne.textContent =
        `${position + 1}. ${joueur.nom} : ${formater(joueur.temps)} ` +
        `(écart ${formater(ecart)})` + (gagnant ? ' 🏆' : '');
      liste.appendChild(ligne);
    });

    const noms = resultat.gagnants.map(j => j.nom).join(' et ');
    message.textContent =
      resultat.gagnants.length > 1 ? `Égalité : ${noms} !` : `Victoire de ${noms} !`;
  } else {
    // Les temps des autres restent secrets jusqu'à la fin
    etat.joueurs.forEach((joueur) => {
      const ligne = document.createElement('li');
      ligne.textContent = `${joueur.nom} : ${joueur.temps !== null ? 'a stoppé ✅' : 'en cours...'}`;
      liste.appendChild(ligne);
    });
  }
  conteneur.appendChild(liste);

  // Met l'affichage du temps à jour tout de suite (sans attendre 50 ms)
  if (intervalle) tick();
}