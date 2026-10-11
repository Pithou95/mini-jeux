import { verifierIndice, placeDe } from '../games/codename.js';

// ===================== OUTILS =====================

// Crée un élément HTML avec une classe et un texte
function creer(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

function nomJoueur(etat, id) {
  const joueur = etat.joueurs.find(j => j.id === id);
  return joueur ? joueur.nom : '?';
}

function nomEquipe(equipe) {
  return equipe === 'rouge' ? 'rouge' : 'bleue';
}

function suffixe(equipe) {
  return equipe === 'rouge' ? 'Rouge' : 'Bleu';
}

// ===================== POINT D'ENTRÉE =====================

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  conteneur.innerHTML = '';
  if (etat.phase === 'choix') {
    afficherChoix(conteneur, etat, monId, envoyerAction);
  } else {
    afficherJeu(conteneur, etat, monId, envoyerAction);
  }
}

// ===================== PHASE « CHOIX DES PLACES » =====================

function afficherChoix(conteneur, etat, monId, envoyerAction) {
  conteneur.appendChild(creer('p', 'statutCode', 'Choisissez votre place'));

  const zone = creer('div', 'zonePlaces');
  const equipes = etat.mode === 4 ? ['rouge', 'bleu'] : ['bleu'];

  equipes.forEach((equipe) => {
    const colonne = creer('div', 'colonnePlaces equipe-' + equipe);
    if (etat.mode === 4) {
      colonne.appendChild(creer('h3', null, 'Équipe ' + nomEquipe(equipe)));
    }

    ['espion', 'operateur'].forEach((role) => {
      const cle = role + suffixe(equipe);
      const occupant = etat.places[cle];
      const titre = role === 'espion' ? '🕵️ Espion' : '🎯 Opérateur';
      const bouton = creer('button', 'place');

      if (occupant === null) {
        bouton.textContent = `${titre} : libre`;
        bouton.addEventListener('click', () => envoyerAction({ type: 'choisirPlace', place: cle }));
      } else if (occupant === monId) {
        bouton.textContent = `${titre} : ${nomJoueur(etat, occupant)} (toi)`;
        bouton.classList.add('moi');
        bouton.addEventListener('click', () => envoyerAction({ type: 'quitterPlace' }));
      } else {
        bouton.textContent = `${titre} : ${nomJoueur(etat, occupant)}`;
        bouton.disabled = true;
      }
      colonne.appendChild(bouton);
    });

    zone.appendChild(colonne);
  });
  conteneur.appendChild(zone);

  const total = Object.keys(etat.places).length;
  const prises = Object.values(etat.places).filter(id => id !== null).length;
  conteneur.appendChild(creer('p', null, `${prises} / ${total} places prises. Clique sur ta place pour la quitter.`));

  if (monId === 'hote') {
    const bouton = creer('button', 'boutonCommencer', 'Commencer la partie');
    bouton.disabled = prises < total;
    bouton.addEventListener('click', () => envoyerAction({ type: 'demarrer' }));
    conteneur.appendChild(bouton);
  } else {
    conteneur.appendChild(creer('p', null, "L'hôte lancera la partie quand toutes les places seront prises."));
  }
}

// ===================== PHASE « JEU » ET « FIN » =====================

function afficherJeu(conteneur, etat, monId, envoyerAction) {
  const fin = etat.phase === 'fin';
  const equipe = etat.equipeCourante;
  const suff = suffixe(equipe);
  const maPlace = placeDe(etat, monId);

  const monTourEspion = !fin && maPlace === 'espion' + suff && etat.indice === null;
  const monTourOperateur = !fin && maPlace === 'operateur' + suff && etat.indice !== null;

  // ----- Message principal -----
  let texteStatut;
  if (fin) {
    const gagnante = etat.resultat.equipeGagnante;
    if (gagnante !== null) {
      const qui = etat.mode === 4 ? `l'équipe ${nomEquipe(gagnante)}` : 'votre équipe';
      texteStatut = `🏆 Victoire de ${qui} ! ${etat.resultat.message}`;
    } else {
      texteStatut = `💀 Défaite ! ${etat.resultat.message}`;
    }
  } else if (etat.indice === null) {
    texteStatut = monTourEspion
      ? 'À toi de donner un indice !'
      : `${nomJoueur(etat, etat.places['espion' + suff])} (espion) cherche un indice...`;
  } else {
    texteStatut = monTourOperateur
      ? 'À toi de deviner : clique sur une carte !'
      : `${nomJoueur(etat, etat.places['operateur' + suff])} (opérateur) doit deviner...`;
  }
  if (!fin && etat.mode === 4) {
    texteStatut = `Équipe ${nomEquipe(equipe)} : ` + texteStatut;
  }
  conteneur.appendChild(creer('p', 'statutCode', texteStatut));

  // ----- Mon rôle -----
  if (maPlace !== null) {
    let texteRole = maPlace.startsWith('espion') ? "Tu es l'espion" : "Tu es l'opérateur";
    if (etat.mode === 4) {
      texteRole += ` de l'équipe ${nomEquipe(maPlace.endsWith('Rouge') ? 'rouge' : 'bleu')}`;
    }
    conteneur.appendChild(creer('p', 'roleCode', texteRole));
  }

  // ----- Panneau d'informations -----
  const panneau = creer('div', 'panneauCode');
  if (etat.mode === 4) {
    ['rouge', 'bleu'].forEach((e) => {
      const actif = !fin && e === equipe ? ' actif' : '';
      panneau.appendChild(
        creer('span', 'badgeCode equipe-' + e + actif, `Équipe ${nomEquipe(e)} : ${etat.restantes[e]} à trouver`)
      );
    });
  } else {
    const vies = Math.max(0, 3 - etat.erreurs);
    panneau.appendChild(creer('span', 'viesCode', '❤️'.repeat(vies) + '🖤'.repeat(3 - vies)));
    panneau.appendChild(
      creer('span', 'badgeCode', etat.jokerDisponible ? '🃏 Joker disponible' : '🃏 Joker utilisé')
    );
    panneau.appendChild(creer('span', 'badgeCode', `${etat.restantes.bleu} cartes à trouver`));
  }
  conteneur.appendChild(panneau);

  if (!fin && etat.mode === 2 && etat.erreurs === 2) {
    conteneur.appendChild(creer('p', 'alerteCode', '⚠️ Dernière vie: à la prochaine erreur tié foutu !'));
  }

  // ----- Indice en cours -----
  if (!fin && etat.indice !== null) {
    conteneur.appendChild(creer('p', 'indiceCode', `Indice : ${etat.indice.mot.toUpperCase()} — ${etat.indice.nombre}`));
    conteneur.appendChild(creer('p', 'roleCode', `Essais restants : ${etat.essais} (le dernier est un bonus facultatif)`));
  }

  // ----- Bouton « Terminer le tour » (opérateur) -----
  if (monTourOperateur) {
    const boutonFin = creer('button', 'boutonIndice', 'Terminer le tour');
    boutonFin.disabled = etat.trouvesCeTour < 1;
    boutonFin.addEventListener('click', () => envoyerAction({ type: 'terminerTour' }));
    conteneur.appendChild(boutonFin);
    if (etat.trouvesCeTour < 1) {
      conteneur.appendChild(creer('p', 'roleCode', 'Trouve au moins une carte avant de pouvoir terminer le tour.'));
    }
  }

  // ----- Formulaire de l'espion -----
  if (monTourEspion) {
    conteneur.appendChild(creerFormulaireIndice(etat, envoyerAction));
  }

  // ----- Plateau de 25 cartes -----
  const plateau = creer('div', 'plateauCode');
  etat.cartes.forEach((carte, i) => {
    const div = creer('div', 'carteCode', carte.mot);
    if (carte.revelee) {
      div.classList.add('revelee', 'couleur-' + carte.couleur);
    } else if (carte.couleur) {
      // Couleur connue sans être révélée : espions, ou fin de partie
      div.classList.add('secrete', 'couleur-' + carte.couleur);
    }
    if (monTourOperateur && !carte.revelee) {
      div.classList.add('cliquable');
      div.addEventListener('click', () => envoyerAction({ type: 'reveler', indice: i }));
    }
    plateau.appendChild(div);
  });
  conteneur.appendChild(plateau);

  // ----- Historique (le plus récent en haut) -----
  if (etat.journal.length > 0) {
    conteneur.appendChild(creer('h3', null, 'Historique'));
    const liste = creer('ul', 'journalCode');
    [...etat.journal].reverse().forEach((entree) => {
      liste.appendChild(creer('li', 'equipe-' + entree.equipe, entree.texte));
    });
    conteneur.appendChild(liste);
  }
}

// Le formulaire « mot + nombre » de l'espion
function creerFormulaireIndice(etat, envoyerAction) {
  const formulaire = creer('div', 'formulaireIndice');

  const champMot = creer('input');
  champMot.placeholder = 'Ton indice (un seul mot)';
  champMot.maxLength = 30;

  const champNombre = creer('input');
  champNombre.type = 'number';
  champNombre.min = 1;
  champNombre.max = etat.restantes[etat.equipeCourante];
  champNombre.value = etat.mode === 2 && !etat.jokerDisponible ? 2 : 1;

  const bouton = creer('button', 'boutonIndice', "Donner l'indice");
  const erreur = creer('p', 'alerteCode');

  function envoyer() {
    const nombre = parseInt(champNombre.value, 10);
    const probleme = verifierIndice(etat, champMot.value, nombre);
    if (probleme) {
      erreur.textContent = probleme;
      return;
    }
    envoyerAction({ type: 'donnerIndice', mot: champMot.value.trim(), nombre });
  }

  bouton.addEventListener('click', envoyer);
  champMot.addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyer(); });

  const ligne = creer('div', 'ligne');
  ligne.append(champMot, champNombre, bouton);
  formulaire.appendChild(ligne);

  if (etat.mode === 2) {
    formulaire.appendChild(creer('p', 'roleCode',
      etat.jokerDisponible
        ? 'Minimum 2 cartes, ou 1 seule carte en utilisant ton joker (une seule fois).'
        : 'Le joker est utilisé : il faut faire deviner au moins 2 cartes.'));
  }
  formulaire.appendChild(erreur);
  return formulaire;
}