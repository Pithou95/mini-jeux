import { memory } from './games/memory.js';
import { creerSalon, rejoindreSalon, envoyerAInvite, envoyerAHote } from './reseau.js';

// ----- Éléments de la page -----
const accueil = document.getElementById('accueil');
const jeu = document.getElementById('jeu');
const infoSalon = document.getElementById('infoSalon');
const champPseudo = document.getElementById('champPseudo');
const champCode = document.getElementById('champCode');
const plateau = document.getElementById('plateau');
const messageTour = document.getElementById('statut');
const zoneScores = document.getElementById('scores');

// ----- Variables du programme -----
let role = null;        // 'hote' ou 'invite'
let etat = null;        // l'état de la partie
let nomHote = '';
let nomInvite = '';
let minuteur = null;    // le délai avant de cacher deux cartes différentes

// L'identifiant de CE joueur dans la logique du jeu
function monId() {
  return role === 'hote' ? 'hote' : 'invite';
}

// Lit le pseudo saisi (avec un nom par défaut si vide)
function lirePseudo(parDefaut) {
  const pseudo = champPseudo.value.trim();
  return pseudo === '' ? parDefaut : pseudo;
}

// Passe de l'accueil à l'écran de jeu
function montrerJeu() {
  accueil.classList.add('cache');
  jeu.classList.remove('cache');
}

// =====================================================
//  BOUTON « CRÉER UN SALON »  (on devient l'hôte)
// =====================================================
document.getElementById('boutonCreer').addEventListener('click', () => {
  role = 'hote';
  nomHote = lirePseudo('Hôte');
  accueil.classList.add('cache');
  infoSalon.textContent = 'Création du salon...';

  creerSalon({
    quandPret: (code) => {
      infoSalon.textContent = `Code du salon : ${code}  (en attente d'un joueur...)`;
    },
    quandMessage: (message) => traiterMessageDeLInvite(message),
    quandDeconnexion: () => {
      infoSalon.textContent = "L'autre joueur s'est déconnecté.";
    },
    quandErreur: (type) => {
      infoSalon.textContent = 'Erreur : ' + type;
    },
  });
});

// =====================================================
//  BOUTON « REJOINDRE »  (on devient l'invité)
// =====================================================
document.getElementById('boutonRejoindre').addEventListener('click', () => {
  const code = champCode.value.trim();
  if (code === '') {
    infoSalon.textContent = 'Saisis le code du salon.';
    return;
  }

  role = 'invite';
  nomInvite = lirePseudo('Invité');
  accueil.classList.add('cache');
  infoSalon.textContent = 'Connexion...';

  rejoindreSalon(code, {
    // Connecté à l'hôte : on se présente
    quandConnecte: () => {
      infoSalon.textContent = 'Connecté ! En attente du début de la partie...';
      envoyerAHote({ type: 'bonjour', nom: nomInvite });
    },
    // L'hôte nous envoie le nouvel état de la partie
    quandMessage: (message) => {
      if (message.type === 'etat') {
        etat = message.etat;
        infoSalon.textContent = '';
        montrerJeu();
        afficher();
      }
    },
    quandDeconnexion: () => {
      infoSalon.textContent = "L'hôte s'est déconnecté. La partie est terminée.";
    },
    quandErreur: (type) => {
      if (type === 'peer-unavailable') {
        infoSalon.textContent = "Salon introuvable. Vérifie le code et recharge la page.";
      } else {
        infoSalon.textContent = 'Erreur : ' + type;
      }
    },
  });
});

// =====================================================
//  CÔTÉ HÔTE : recevoir les messages de l'invité
// =====================================================
function traiterMessageDeLInvite(message) {
  if (message.type === 'bonjour') {
    nomInvite = message.nom;
    if (nomInvite === nomHote) {
      nomInvite = nomInvite + ' (2)'; // évite deux pseudos identiques
    }
    lancerPartie();
  }

  // On n'accepte de l'invité QUE l'action « retourner » (sinon il pourrait tricher)
  if (message.type === 'action' && message.action && message.action.type === 'retourner') {
    appliquerAction('invite', message.action);
  }

  if (message.type === 'rejouer') {
    lancerPartie();
  }
}

// Crée une nouvelle partie (hôte uniquement)
function lancerPartie() {
  clearTimeout(minuteur);
  const joueurs = [
    { id: 'hote', nom: nomHote },
    { id: 'invite', nom: nomInvite },
  ];
  etat = memory.initialiser(joueurs);
  infoSalon.textContent = '';
  montrerJeu();
  envoyerAInvite({ type: 'etat', etat });
  afficher();
}

// Applique une action avec la logique du jeu (hôte uniquement)
function appliquerAction(idJoueur, action) {
  const ancienEtat = etat;
  etat = memory.traiterAction(etat, idJoueur, action);

  // Action refusée par les règles : rien n'a changé, on s'arrête
  if (etat === ancienEtat) {
    return;
  }

  envoyerAInvite({ type: 'etat', etat });
  afficher();

  // Deux cartes différentes : on les cache après 1 seconde
  if (etat.retournees.length === 2) {
    minuteur = setTimeout(() => {
      etat = memory.traiterAction(etat, null, { type: 'resoudre' });
      envoyerAInvite({ type: 'etat', etat });
      afficher();
    }, 1000);
  }
}

// =====================================================
//  CLIC SUR UNE CARTE
// =====================================================
function cliquerCarte(indice) {
  const action = { type: 'retourner', indice };
  if (role === 'hote') {
    appliquerAction('hote', action);          // l'hôte applique directement
  } else {
    envoyerAHote({ type: 'action', action }); // l'invité demande à l'hôte
  }
}

// Bouton « Rejouer »
document.getElementById('rejouer').addEventListener('click', () => {
  if (role === 'hote') {
    lancerPartie();
  } else {
    envoyerAHote({ type: 'rejouer' });
  }
});

// =====================================================
//  AFFICHAGE (identique pour l'hôte et l'invité)
// =====================================================
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

    divCarte.addEventListener('click', () => cliquerCarte(indice));
    plateau.appendChild(divCarte);
  });

  // Scores : le joueur dont c'est le tour est en surbrillance
  zoneScores.innerHTML = '';
  etat.joueurs.forEach((joueur, position) => {
    const badge = document.createElement('span');
    badge.className = 'badge' + (position === etat.courant ? ' actif' : '');
    badge.textContent = `${joueur.nom} : ${joueur.score}`;
    zoneScores.appendChild(badge);
  });

  // Message : résultat final, ou à qui le tour
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
    if (joueurCourant.id === monId()) {
      messageTour.textContent = "À toi de jouer !";
    } else {
      messageTour.textContent = `Tour de ${joueurCourant.nom}`;
    }
  }
}