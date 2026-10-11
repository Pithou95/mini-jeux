import { JEUX } from './jeux.js';
import { creerSalon, rejoindreSalon, envoyerATous, envoyerAUn, envoyerAHote } from './reseau.js';

// =====================================================
//  ÉLÉMENTS DE LA PAGE
// =====================================================
const ecrans = {
  accueil: document.getElementById('accueil'),
  salle: document.getElementById('salle'),
  jeu: document.getElementById('jeu'),
};
const infoSalon = document.getElementById('infoSalon');
const champPseudo = document.getElementById('champPseudo');
const champCode = document.getElementById('champCode');
const codeSalon = document.getElementById('codeSalon');
const listeJoueurs = document.getElementById('listeJoueurs');
const commandesHote = document.getElementById('commandesHote');
const attenteHote = document.getElementById('attenteHote');
const choixJeu = document.getElementById('choixJeu');
const infoMinimum = document.getElementById('infoMinimum');
const boutonLancer = document.getElementById('boutonLancer');
const boutonRejouer = document.getElementById('rejouer');
const boutonSalle = document.getElementById('boutonSalle');
const plateau = document.getElementById('plateau');
const messageTour = document.getElementById('statut');
const zoneScores = document.getElementById('scores');

// =====================================================
//  VARIABLES DU PROGRAMME
// =====================================================
let role = null;            // 'hote' ou 'invite'
let monIdJoueur = null;     // mon identifiant dans la partie ('hote', 'j1', 'j2'...)
let joueursSalle = [];      // les joueurs présents : [{ id, nom }, ...]
let cleJeu = 'memory';      // le jeu choisi (une clé de JEUX)
let etat = null;            // l'état de la partie en cours
let enPartie = false;       // true pendant une partie
let minuteur = null;        // délai avant de cacher deux cartes différentes
let refuse = false;         // (invité) true si l'hôte nous a refusés

// Remplit le menu des jeux (rien d'autre à faire quand on ajoutera des jeux)
for (const cle in JEUX) {
  const option = document.createElement('option');
  option.value = cle;
  option.textContent = `${JEUX[cle].nom} (${JEUX[cle].joueursMin} à ${JEUX[cle].joueursMax} joueurs)`;
  choixJeu.appendChild(option);
}

// Montre UN écran et cache les autres ('aucun' les cache tous)
function afficherEcran(nom) {
  for (const cle in ecrans) {
    ecrans[cle].classList.toggle('cache', cle !== nom);
  }
}

// Lit le pseudo saisi (avec un nom par défaut si vide)
function lirePseudo(parDefaut) {
  const pseudo = champPseudo.value.trim();
  return pseudo === '' ? parDefaut : pseudo;
}

// =====================================================
//  BOUTON « CRÉER UN SALON »  (on devient l'hôte)
// =====================================================
document.getElementById('boutonCreer').addEventListener('click', () => {
  role = 'hote';
  monIdJoueur = 'hote';
  joueursSalle = [{ id: 'hote', nom: lirePseudo('Hôte') }];
  afficherEcran('aucun');
  infoSalon.textContent = 'Création du salon...';

  creerSalon({
    quandPret: (code) => {
      infoSalon.textContent = '';
      codeSalon.textContent = `Code du salon : ${code}`;
      afficherSalle();
    },
    // On n'accepte de nouveaux joueurs que dans la salle d'attente
    accepterArrivee: () => !enPartie,
    quandMessage: (idJoueur, message) => traiterMessage(idJoueur, message),
    quandDepart: (idJoueur) => traiterDepart(idJoueur),
    quandErreur: (type) => {
      infoSalon.textContent = 'Erreur : ' + type;
    },
  });
});

// =====================================================
//  BOUTON « REJOINDRE »  (on devient invité)
// =====================================================
document.getElementById('boutonRejoindre').addEventListener('click', () => {
  const code = champCode.value.trim();
  if (code === '') {
    infoSalon.textContent = 'Saisis le code du salon.';
    return;
  }

  role = 'invite';
  const monNom = lirePseudo('Invité');
  afficherEcran('aucun');
  infoSalon.textContent = 'Connexion...';

  rejoindreSalon(code, {
    // Connecté à l'hôte : on se présente
    quandConnecte: () => {
      infoSalon.textContent = 'Connecté ! En attente de la salle...';
      envoyerAHote({ type: 'bonjour', nom: monNom });
    },
    // Messages de l'hôte
    quandMessage: (message) => traiterMessageDeLHote(message),
    quandDeconnexion: () => {
      if (refuse) return; // le message de refus est déjà affiché
      afficherEcran('aucun');
      infoSalon.textContent = "L'hôte s'est déconnecté. Recharge la page pour recommencer.";
    },
    quandErreur: (type) => {
      if (type === 'peer-unavailable') {
        infoSalon.textContent = 'Salon introuvable. Vérifie le code et recharge la page.';
      } else {
        infoSalon.textContent = 'Erreur : ' + type;
      }
    },
  });
});

// =====================================================
//  CÔTÉ INVITÉ : messages reçus de l'hôte
// =====================================================
function traiterMessageDeLHote(message) {
  if (message.type === 'refuse') {
    refuse = true;
    afficherEcran('aucun');
    infoSalon.textContent = 'Salon complet, ou partie déjà commencée. Recharge la page pour réessayer plus tard.';
  }

  if (message.type === 'bienvenue') {
    monIdJoueur = message.id;
  }

  // Mise à jour de la salle d'attente
  if (message.type === 'salle') {
    joueursSalle = message.joueurs;
    cleJeu = message.cleJeu;
    enPartie = false;
    infoSalon.textContent = message.info || '';
    afficherSalle();
  }

  // Nouvel état de la partie
  if (message.type === 'etat') {
    cleJeu = message.cleJeu;
    etat = message.etat;
    enPartie = true;
    infoSalon.textContent = '';
    afficher();
  }
}

// =====================================================
//  CÔTÉ HÔTE : messages reçus des invités
// =====================================================
function traiterMessage(idJoueur, message) {
  // Un invité se présente
  if (message.type === 'bonjour' && typeof message.nom === 'string') {
    const dejaPresent = joueursSalle.some(j => j.id === idJoueur);
    if (!dejaPresent && !enPartie) {
      joueursSalle.push({ id: idJoueur, nom: nomUnique(message.nom.trim().slice(0, 15)) });
      envoyerAUn(idJoueur, { type: 'bienvenue', id: idJoueur });
      diffuserSalle('');
    }
  }

  // Un invité clique sur une carte. On n'accepte QUE l'action « retourner »
  if (message.type === 'action' && enPartie && message.action && message.action.type === 'retourner') {
    appliquerAction(idJoueur, message.action);
  }
}

// Évite deux pseudos identiques : « Léa », « Léa (2) », « Léa (3) »...
function nomUnique(nom) {
  const base = nom === '' ? 'Invité' : nom;
  let candidat = base;
  let numero = 2;
  while (joueursSalle.some(j => j.nom === candidat)) {
    candidat = `${base} (${numero})`;
    numero++;
  }
  return candidat;
}

// Un invité est parti
function traiterDepart(idJoueur) {
  const joueur = joueursSalle.find(j => j.id === idJoueur);
  joueursSalle = joueursSalle.filter(j => j.id !== idJoueur);
  if (!joueur) return; // il n'avait pas encore donné son pseudo

  if (enPartie) {
    // On ne peut pas continuer à jouer sans lui : retour à la salle
    enPartie = false;
    clearTimeout(minuteur);
    diffuserSalle(`${joueur.nom} a quitté la partie : retour à la salle d'attente.`);
  } else {
    diffuserSalle(`${joueur.nom} est parti.`);
  }
}

// Envoie la salle d'attente à tous et l'affiche chez l'hôte
function diffuserSalle(info) {
  envoyerATous({ type: 'salle', joueurs: joueursSalle, cleJeu, info });
  infoSalon.textContent = info;
  afficherSalle();
}

// Envoie l'état de la partie à tous et l'affiche chez l'hôte
function diffuserEtat() {
  envoyerATous({ type: 'etat', cleJeu, etat });
  afficher();
}

// =====================================================
//  SALLE D'ATTENTE (affichage)
// =====================================================
function afficherSalle() {
  const jeuChoisi = JEUX[cleJeu];

  listeJoueurs.innerHTML = '';
  joueursSalle.forEach((joueur) => {
    const ligne = document.createElement('li');
    let texte = joueur.nom;
    if (joueur.id === 'hote') texte += ' 👑';
    if (joueur.id === monIdJoueur) texte += ' (toi)';
    ligne.textContent = texte;
    listeJoueurs.appendChild(ligne);
  });

  if (role === 'hote') {
    commandesHote.classList.remove('cache');
    attenteHote.classList.add('cache');
    choixJeu.value = cleJeu;

    const assezDeJoueurs = joueursSalle.length >= jeuChoisi.joueursMin;
    boutonLancer.disabled = !assezDeJoueurs;
    infoMinimum.textContent = assezDeJoueurs
      ? ''
      : `Il faut au moins ${jeuChoisi.joueursMin} joueurs pour lancer ce jeu.`;
  } else {
    commandesHote.classList.add('cache');
    attenteHote.classList.remove('cache');
    attenteHote.textContent = `Jeu choisi : ${jeuChoisi.nom}. En attente du lancement par l'hôte...`;
  }

  afficherEcran('salle');
}

// L'hôte change de jeu dans le menu
choixJeu.addEventListener('change', () => {
  if (role !== 'hote') return;
  cleJeu = choixJeu.value;
  diffuserSalle('');
});

// =====================================================
//  LANCER, REJOUER, RETOURNER À LA SALLE (hôte)
// =====================================================
function lancerPartie() {
  const jeu = JEUX[cleJeu];
  if (joueursSalle.length < jeu.joueursMin) return;

  clearTimeout(minuteur);
  enPartie = true;
  etat = jeu.initialiser(joueursSalle);
  infoSalon.textContent = '';
  diffuserEtat();
}

boutonLancer.addEventListener('click', lancerPartie);
boutonRejouer.addEventListener('click', lancerPartie);

boutonSalle.addEventListener('click', () => {
  clearTimeout(minuteur);
  enPartie = false;
  diffuserSalle('');
});

// =====================================================
//  JOUER (hôte : applique les règles)
// =====================================================
function appliquerAction(idJoueur, action) {
  const jeu = JEUX[cleJeu];
  const ancienEtat = etat;
  etat = jeu.traiterAction(etat, idJoueur, action);

  // Action refusée par les règles : rien n'a changé
  if (etat === ancienEtat) {
    return;
  }

  diffuserEtat();

  // Deux cartes différentes : on les cache après 1 seconde
  if (etat.retournees.length === 2) {
    minuteur = setTimeout(() => {
      if (!enPartie) return; // la partie a été arrêtée entre-temps
      etat = jeu.traiterAction(etat, null, { type: 'resoudre' });
      diffuserEtat();
    }, 1000);
  }
}

// Clic sur une carte
function cliquerCarte(indice) {
  const action = { type: 'retourner', indice };
  if (role === 'hote') {
    appliquerAction('hote', action);          // l'hôte applique directement
  } else {
    envoyerAHote({ type: 'action', action }); // l'invité demande à l'hôte
  }
}

// =====================================================
//  AFFICHAGE DE LA PARTIE (identique pour tout le monde)
//  Pour l'instant il ne sait afficher que le Memory.
// =====================================================
function afficher() {
  const jeu = JEUX[cleJeu];
  afficherEcran('jeu');

  // Les boutons de fin de partie sont réservés à l'hôte
  boutonRejouer.classList.toggle('cache', role !== 'hote');
  boutonSalle.classList.toggle('cache', role !== 'hote');

  // Les cartes
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

  // Les scores : le joueur dont c'est le tour est en surbrillance
  zoneScores.innerHTML = '';
  etat.joueurs.forEach((joueur, position) => {
    const badge = document.createElement('span');
    badge.className = 'badge' + (position === etat.courant ? ' actif' : '');
    badge.textContent = `${joueur.nom} : ${joueur.score}`;
    zoneScores.appendChild(badge);
  });

  // Le message : résultat final, ou à qui le tour
  const resultat = jeu.estTerminee(etat);
  if (resultat.terminee) {
    const noms = resultat.gagnants.map(j => j.nom).join(' et ');
    if (resultat.gagnants.length > 1) {
      messageTour.textContent = `Égalité : ${noms} !`;
    } else {
      messageTour.textContent = `Victoire de ${noms} !`;
    }
  } else {
    const joueurCourant = etat.joueurs[etat.courant];
    if (joueurCourant.id === monIdJoueur) {
      messageTour.textContent = 'À toi de jouer !';
    } else {
      messageTour.textContent = `Tour de ${joueurCourant.nom}`;
    }
  }
}