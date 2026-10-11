export const chronometre = {
  nom: 'Chronomètre',
  joueursMin: 2,
  joueursMax: 4,

  // Actions qu'un invité a le droit d'envoyer à l'hôte
  actionsAutorisees: ['stop'],

  // Crée la partie : une cible entre 5 et 20 secondes
  initialiser(joueurs) {
    return {
      idPartie: Math.random().toString(36).substring(2), // identifie cette partie
      cible: 5 + Math.floor(Math.random() * 16),         // entier de 5 à 20
      joueurs: joueurs.map(j => ({ id: j.id, nom: j.nom, temps: null })),
    };
  },

  // Un joueur annonce le temps (en millisecondes) qu'il a mesuré en cliquant
  traiterAction(etat, idJoueur, action) {
    if (action.type !== 'stop') {
      return etat;
    }

    const nouvelEtat = structuredClone(etat);
    const joueur = nouvelEtat.joueurs.find(j => j.id === idJoueur);

    // Le temps doit être un vrai nombre, raisonnable
    const tempsValide =
      typeof action.temps === 'number' &&
      Number.isFinite(action.temps) &&
      action.temps >= 0 &&
      action.temps <= 120000;

    // Refus : joueur inconnu, a déjà stoppé, ou temps invalide
    if (!joueur || joueur.temps !== null || !tempsValide) {
      return etat;
    }

    joueur.temps = Math.round(action.temps);
    return nouvelEtat;
  },

  // La partie est finie quand tout le monde a stoppé : le plus proche de la cible gagne
  estTerminee(etat) {
    if (!etat.joueurs.every(j => j.temps !== null)) {
      return { terminee: false };
    }
    const cibleMs = etat.cible * 1000;
    const ecarts = etat.joueurs.map(j => Math.abs(j.temps - cibleMs));
    const meilleurEcart = Math.min(...ecarts);
    return {
      terminee: true,
      gagnants: etat.joueurs.filter((j, position) => ecarts[position] === meilleurEcart),
    };
  },
};