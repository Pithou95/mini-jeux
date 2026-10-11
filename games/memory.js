const SYMBOLES = [
    'images_memory/assis.jpg',
    'images_memory/carton.webp',
    'images_memory/chat.webp',
    'images_memory/dali.webp',
    'images_memory/dodo.webp',
    'images_memory/hoop.webp',
    'images_memory/skate.webp',
    'images_memory/taf.webp'
];

// Mélange un tableau, comme un paquet de cartes
function melanger(tableau) {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
}

export const memory = {
  nom: 'Memory',
  joueursMin: 2,
  joueursMax: 4,

  // Crée l'état de départ de la partie
  initialiser(joueurs) {
    const symboles = melanger([...SYMBOLES, ...SYMBOLES]);
    return {
      cartes: symboles.map((symbole, id) => ({ id, symbole, statut: 'cachee' })),
      joueurs: joueurs.map(j => ({ id: j.id, nom: j.nom, score: 0 })),
      courant: Math.floor(Math.random() * joueurs.length),
      retournees: [],
    };
  },

  // Applique une action et renvoie le nouvel état
  traiterAction(etat, idJoueur, action) {
    const nouvelEtat = structuredClone(etat);

    // Action : retourner une carte
    if (action.type === 'retourner') {
      const carte = nouvelEtat.cartes[action.indice];
      const cEstSonTour = nouvelEtat.joueurs[nouvelEtat.courant].id === idJoueur;

      // Actions interdites : on ne change rien
      if (!carte || !cEstSonTour || nouvelEtat.retournees.length >= 2 || carte.statut !== 'cachee') {
        return etat;
      }

      carte.statut = 'retournee';
      nouvelEtat.retournees.push(action.indice);

      // Si deux cartes sont retournées, on compare
      if (nouvelEtat.retournees.length === 2) {
        const [carteA, carteB] = nouvelEtat.retournees.map(i => nouvelEtat.cartes[i]);
        if (carteA.symbole === carteB.symbole) {
          carteA.statut = 'trouvee';
          carteB.statut = 'trouvee';
          nouvelEtat.joueurs[nouvelEtat.courant].score++;
          nouvelEtat.retournees = [];
        }
      }
      return nouvelEtat;
    }

    // Action : cacher les 2 cartes différentes et passer au joueur suivant
    if (action.type === 'resoudre') {
      if (nouvelEtat.retournees.length !== 2) {
        return etat;
      }
      nouvelEtat.retournees.forEach(i => {
        nouvelEtat.cartes[i].statut = 'cachee';
      });
      nouvelEtat.retournees = [];
      nouvelEtat.courant = (nouvelEtat.courant + 1) % nouvelEtat.joueurs.length;
      return nouvelEtat;
    }

    // Action inconnue : on ne change rien
    return etat;
  },

  // Dit si la partie est finie, et qui a gagné
  estTerminee(etat) {
    const terminee = etat.cartes.every(c => c.statut === 'trouvee');
    if (!terminee) {
      return { terminee: false };
    }
    const meilleurScore = Math.max(...etat.joueurs.map(j => j.score));
    return {
      terminee: true,
      gagnants: etat.joueurs.filter(j => j.score === meilleurScore),
    };
  },
};