import { memory } from '../games/memory.js';

// Dessine le Memory dans « conteneur » à partir de l'état
export function afficher({ conteneur, etat, monId, envoyerAction }) {
  conteneur.innerHTML = '';

  const messageTour = document.createElement('p');
  messageTour.id = 'statut';
  const zoneScores = document.createElement('div');
  zoneScores.id = 'scores';
  const plateau = document.createElement('div');
  plateau.id = 'plateau';
  conteneur.append(messageTour, zoneScores, plateau);

  // Les cartes
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
      envoyerAction({ type: 'retourner', indice });
    });
    plateau.appendChild(divCarte);
  });

  // Les scores : le joueur dont c'est le tour est en surbrillance
  etat.joueurs.forEach((joueur, position) => {
    const badge = document.createElement('span');
    badge.className = 'badge' + (position === etat.courant ? ' actif' : '');
    badge.textContent = `${joueur.nom} : ${joueur.score}`;
    zoneScores.appendChild(badge);
  });

  // Le message : résultat final, ou à qui le tour
  const resultat = memory.estTerminee(etat);
  if (resultat.terminee) {
    const noms = resultat.gagnants.map(j => j.nom).join(' et ');
    if (resultat.gagnants.length > 1) {
      messageTour.textContent = `Égalité : ${noms} !`;
    } else {
      messageTour.textContent = `Victoire de ${noms} !`;
    }
  } else {
    const joueurCourant = etat.joueurs[etat.courant];
    if (joueurCourant.id === monId) {
      messageTour.textContent = 'À toi de jouer !';
    } else {
      messageTour.textContent = `Tour de ${joueurCourant.nom}`;
    }
  }
}