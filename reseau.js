// Préfixe pour que les identifiants soient uniques sur le serveur public
const PREFIXE = 'pithou95-memory-';

let participant = null;      // notre Peer
let connexionInvite = null;  // (hôte) la connexion vers l'invité
let connexionHote = null;    // (invité) la connexion vers l'hôte

// ----- CÔTÉ HÔTE -----

// Crée un salon. « rappels » est un objet qui contient les fonctions à appeler
// quand quelque chose se passe : quandPret, quandMessage, quandDeconnexion, quandErreur
export function creerSalon(rappels) {
  const code = Math.random().toString(36).substring(2, 6).toUpperCase();
  participant = new Peer(PREFIXE + code);

  participant.on('open', () => {
    rappels.quandPret(code);
  });

  participant.on('connection', (connexion) => {
    // Salon limité à 2 joueurs : si quelqu'un est déjà là, on refuse
    if (connexionInvite) {
      connexion.on('open', () => connexion.close());
      return;
    }
    connexionInvite = connexion;
    connexion.on('data', (donnee) => rappels.quandMessage(donnee));
    connexion.on('close', () => {
      connexionInvite = null;
      rappels.quandDeconnexion();
    });
  });

  participant.on('error', (erreur) => rappels.quandErreur(erreur.type));
}

// L'hôte envoie un message à l'invité
export function envoyerAInvite(donnee) {
  if (connexionInvite && connexionInvite.open) {
    connexionInvite.send(donnee);
  }
}

// ----- CÔTÉ INVITÉ -----

// Rejoint un salon avec son code. Rappels : quandConnecte, quandMessage, quandDeconnexion, quandErreur
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