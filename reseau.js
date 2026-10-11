// Préfixe pour que les identifiants soient uniques sur le serveur public
const PREFIXE = 'pithou95-memory-';

// L'hôte accepte au maximum 3 invités (soit 4 joueurs avec lui)
const MAX_INVITES = 3;

let participant = null;      // notre Peer
let connexionHote = null;    // (invité) la connexion vers l'hôte
let compteur = 0;            // (hôte) sert à fabriquer les identifiants j1, j2, j3...

// (hôte) les connexions des invités : { j1: connexion, j2: connexion, ... }
const connexionsInvites = {};

// ----- CÔTÉ HÔTE -----

// Rappels à fournir : quandPret(code), accepterArrivee(), quandMessage(idJoueur, message),
// quandDepart(idJoueur), quandErreur(type)
export function creerSalon(rappels) {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  participant = new Peer(PREFIXE + code);

  participant.on('open', () => rappels.quandPret(code));

  participant.on('connection', (connexion) => {
    const nombreInvites = Object.keys(connexionsInvites).length;

    // Salon complet ou partie en cours : on refuse poliment
    if (nombreInvites >= MAX_INVITES || !rappels.accepterArrivee()) {
      connexion.on('open', () => {
        connexion.send({ type: 'refuse' });
        setTimeout(() => connexion.close(), 500);
      });
      return;
    }

    compteur++;
    const idJoueur = 'j' + compteur;
    connexionsInvites[idJoueur] = connexion;

    connexion.on('data', (donnee) => rappels.quandMessage(idJoueur, donnee));
    connexion.on('close', () => {
      delete connexionsInvites[idJoueur];
      rappels.quandDepart(idJoueur);
    });
  });

  participant.on('error', (erreur) => rappels.quandErreur(erreur.type));
}

// L'hôte envoie un message à TOUS les invités
export function envoyerATous(donnee) {
  for (const id in connexionsInvites) {
    if (connexionsInvites[id].open) {
      connexionsInvites[id].send(donnee);
    }
  }
}

// L'hôte envoie un message à UN invité
export function envoyerAUn(idJoueur, donnee) {
  const connexion = connexionsInvites[idJoueur];
  if (connexion && connexion.open) {
    connexion.send(donnee);
  }
}

// ----- CÔTÉ INVITÉ -----

// Rappels à fournir : quandConnecte(), quandMessage(message), quandDeconnexion(), quandErreur(type)
export function rejoindreSalon(code, rappels) {
  participant = new Peer(); // identifiant attribué automatiquement

  participant.on('open', () => {
    connexionHote = participant.connect(PREFIXE + code.toUpperCase());
    connexionHote.on('open', () => rappels.quandConnecte());
    connexionHote.on('data', (donnee) => rappels.quandMessage(donnee));
    connexionHote.on('close', () => rappels.quandDeconnexion());
  });

  participant.on('error', (erreur) => rappels.quandErreur(erreur.type));
}

// L'invité envoie un message à l'hôte
export function envoyerAHote(donnee) {
  if (connexionHote && connexionHote.open) {
    connexionHote.send(donnee);
  }
}