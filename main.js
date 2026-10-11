import { memory } from './games/memory.js';

// Les joueurs (deux joueurs sur le même écran pour l'instant)
const joueurs = [
  { id: 'j1', nom: 'Joueur 1' },
  { id: 'j2', nom: 'Joueur 2' },
];

// L'état courant de la partie
let etat = memory.initialiser(joueurs);

// On repère les éléments de la page
const plateau = document.getElementById('plateau');
const messageTour = document.getElementById('statut');
const zoneScores = document.getElementById('scores');

// Bouton « Rejouer »
document.getElementById('rejouer').addEventListener('click', () => {
  etat = memory.initialiser(joueurs);
  afficher();
});

// Appelée à chaque clic sur une carte
function jouer(action) {
  const ancienEtat = etat;
  const idJoueur = etat.joueurs[etat.courant].id;
  etat = memory.traiterAction(etat, idJoueur, action);
  afficher();

  // Si deux cartes différentes sont retournées, on les cache après 1 seconde
  if (etat !== ancienEtat && etat.retournees.length === 2) {
    setTimeout(() => {
      etat = memory.traiterAction(etat, null, { type: 'resoudre' });
      afficher();
    }, 1000);
  }
}

// Redessine toute la page à partir de l'état
function afficher() {
  plateau.innerHTML = '';

  etat.cartes.forEach((carte, indice) => {
    const divCarte = document.createElement('div');
    divCarte.className = 'carte ' + carte.statut;

    if (carte.statut === 'cachee') {
      divCarte.textContent = '?';
    } else {
      const image = document.createElement('img');
      image.src = carte.symbole;
      image.alt = '';
      divCarte.appendChild(image);
    }

    divCarte.addEventListener('click', () => {
      jouer({ type: 'retourner', indice });
    });

    plateau.appendChild(divCarte);
  });

  // Scores : un badge par joueur, celui dont c'est le tour est en surbrillance
  zoneScores.innerHTML = '';
  etat.joueurs.forEach((joueur, position) => {
    const badge = document.createElement('span');
    badge.className = 'badge' + (position === etat.courant ? ' actif' : '');
    badge.textContent = `${joueur.nom} : ${joueur.score}`;
    zoneScores.appendChild(badge);
  });

  // Message : à qui le tour, ou résultat final
  const resultat = memory.estTerminee(etat);
  if (resultat.terminee) {
    const noms = resultat.gagnants.map(j => j.nom).join(' et ');
    if (resultat.gagnants.length > 1) {
      messageTour.textContent = `Égalité : ${noms} !`;
    } else {
      messageTour.textContent = `Victoire de ${noms} !`;
    }
  } else {
    messageTour.textContent = `Tour de ${etat.joueurs[etat.courant].nom}`;
  }
}

// Premier dessin au chargement de la page
afficher();