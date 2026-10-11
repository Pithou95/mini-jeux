import { JEUX } from './jeux.js';
import { AFFICHAGES } from './affichages.js';
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
const zoneJeu = document.getElementById('zoneJeu');

// =====================================================
//  VARIABLES DU PROGRAMME
// =====================================================
let role = null;            // 'hote' ou 'invite'
let monIdJoueur = null;     // mon identifiant dans la partie ('hote', 'j1', 'j2'...)
let joueursSalle = [];      // les joueurs présents : [{ id, nom }, ...]
let cleJeu = 'memory';      // le jeu choisi (une clé de JEUX)
let etat = null;            // l'état de la partie en cours
let enPartie = false;       // true pendant une partie
let minuteur = null;        // délai éventuel avant une action différée
let refuse = false;         // (invité) true si l'hôte nous a refusés

// Le nombre de joueurs actuel convient-il à ce jeu ?
function nombreValide(jeu, nombre) {
  if (jeu.nombresAutorises) {
    return jeu.nombresAutorises.includes(nombre);
  }
  return nombre >= jeu.joueursMin && nombre <= jeu.joueursMax;
}

// Texte décrivant les nombres de joueurs possibles : « 2 à 4 » ou « 2 ou 4 »
function texteNombre(jeu) {
  if (jeu.nombresAutorises) {
    return jeu.nombresAutorises.join(' ou ');
  }
  return `${jeu.joueursMin} à ${jeu.joueursMax}`;
}

// Remplit le menu des jeux
for (const cle in JEUX) {
  const option = document.createElement('option');
  option.value = cle;
  option.textContent = `${JEUX[cle].nom} (${texteNombre(JEUX[cle])} joueurs)`;
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
    quandConnecte: () => {
      infoSalon.textContent = 'Connecté ! En attente de la salle...';
      envoyerAHote({ type: 'bonjour', nom: monNom });
    },
    quandMessage: (message) => traiterMessageDeLHote(message),
    quandDeconnexion: () => {
      if (refuse) return; // le message de refus est déjà affiché
      arreterAffichages();
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

  // Nouvel état de la partie (déjà adapté à ce que je peux voir)
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

  // Un invité envoie une action de jeu. On n'accepte QUE les actions
  // que le jeu autorise aux invités (sinon il pourrait tricher)
  if (message.type === 'action' && enPartie && message.action
      && typeof message.action.type === 'string') {
    const jeu = JEUX[cleJeu];
    if (jeu.actionsAutorisees.includes(message.action.type)) {
      appliquerAction(idJoueur, message.action);
    }
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

// Envoie l'état de la partie à chaque joueur, adapté à ce qu'il a le droit de voir
function diffuserEtat() {
  const jeu = JEUX[cleJeu];
  joueursSalle.forEach((joueur) => {
    if (joueur.id === 'hote') return; // l'hôte affiche directement (voir afficher)
    const vue = jeu.vuePour ? jeu.vuePour(etat, joueur.id) : etat;
    envoyerAUn(joueur.id, { type: 'etat', cleJeu, etat: vue });
  });
  afficher();
}

// Arrête les éventuels chronos des affichages (retour à la salle, déconnexion)
function arreterAffichages() {
  for (const cle in AFFICHAGES) {
    if (AFFICHAGES[cle].arreter) {
      AFFICHAGES[cle].arreter();
    }
  }
}

// =====================================================
//  SALLE D'ATTENTE (affichage)
// =====================================================
function afficherSalle() {
  arreterAffichages();
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

    const nombreOk = nombreValide(jeuChoisi, joueursSalle.length);
    boutonLancer.disabled = !nombreOk;
    infoMinimum.textContent = nombreOk
      ? ''
      : `Ce jeu se joue à ${texteNombre(jeuChoisi)} joueurs (vous êtes ${joueursSalle.length}).`;
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
  if (!nombreValide(jeu, joueursSalle.length)) return;

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
//  JOUER (hôte : applique les règles du jeu)
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

  // Certains jeux demandent une action un peu plus tard (ex. cacher des cartes)
  if (jeu.actionDifferee) {
    const suite = jeu.actionDifferee(etat);
    if (suite) {
      minuteur = setTimeout(() => {
        if (!enPartie) return; // la partie a été arrêtée entre-temps
        etat = jeu.traiterAction(etat, null, suite.action);
        diffuserEtat();
      }, suite.delai);
    }
  }
}

// Appelée par le dessin du jeu quand le joueur fait une action (clic...)
function envoyerAction(action) {
  if (role === 'hote') {
    appliquerAction('hote', action);          // l'hôte applique directement
  } else {
    envoyerAHote({ type: 'action', action }); // l'invité demande à l'hôte
  }
}

// =====================================================
//  AFFICHAGE DE LA PARTIE : on délègue au fichier du jeu
// =====================================================
function afficher() {
  const jeu = JEUX[cleJeu];
  afficherEcran('jeu');

  // Les boutons de fin de partie sont réservés à l'hôte
  boutonRejouer.classList.toggle('cache', role !== 'hote');
  boutonSalle.classList.toggle('cache', role !== 'hote');

  // L'hôte garde l'état complet : il affiche sa propre vue.
  // Les invités ont déjà reçu leur vue, ils l'affichent telle quelle.
  const vue = (role === 'hote' && jeu.vuePour) ? jeu.vuePour(etat, monIdJoueur) : etat;

  AFFICHAGES[cleJeu].afficher({
    conteneur: zoneJeu,
    etat: vue,
    monId: monIdJoueur,
    envoyerAction: envoyerAction,
  });
}