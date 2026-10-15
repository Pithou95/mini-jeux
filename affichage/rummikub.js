import { verifierCoup, evaluerEnsemble } from '../games/rummikub.js';

const ORDRE_COULEURS = { noir: 0, rouge: 1, bleu: 2, jaune: 3 };
const ENSEMBLES_PAR_PAQUET = 5; // nombre de lignes dans un paquet

// ===================== MÉMOIRE DU MODULE =====================
// Ces variables survivent entre deux affichages

let contexte = null;          // { conteneur, etat, monId, envoyerAction }
let tuilesParId = new Map();  // id -> tuile (table + ma main)
let idsAnciens = new Set();   // les tuiles qui étaient sur la table au début du tour
let brouillon = null;         // mon arrangement en cours : { table: [[id...]], main: [id...] }
let ordreMain = [];           // l'ordre de TOUT mon jeu (mémorisé d'un tour à l'autre)
let cleSynchro = null;        // identifie le tour en cours
let idPartieVue = null;
let glisse = null;            // le glisser-déposer en cours
let selection = new Set();    // les tuiles sur lesquelles j'ai cliqué

// ===================== OUTILS =====================

function creer(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

function nomDe(etat, id) {
  const joueur = etat.joueurs.find(j => j.id === id);
  return joueur ? joueur.nom : '?';
}

// Retire une tuile de partout (jeu et ensembles), sur place
function retirer(id) {
  [brouillon.main, ...brouillon.table].forEach((liste) => {
    const position = liste.indexOf(id);
    if (position !== -1) liste.splice(position, 1);
  });
}

// Insère une tuile dans une liste, avant ou après la tuile cible (ou à la fin)
function inserer(liste, id, idCible, apres) {
  let position = liste.length;
  if (idCible !== null) {
    const i = liste.indexOf(idCible);
    if (i !== -1) position = i + (apres ? 1 : 0);
  }
  liste.splice(position, 0, id);
}

// Insère plusieurs tuiles, l'une derrière l'autre, à l'endroit visé
function insererPlusieurs(liste, ids, idCible, apres) {
  let reference = idCible;
  let apresReference = apres;
  ids.forEach((id) => {
    inserer(liste, id, reference, apresReference);
    reference = id;          // la suivante se place juste derrière celle-ci
    apresReference = true;
  });
}

// Supprime les ensembles devenus vides
function nettoyer() {
  brouillon.table = brouillon.table.filter(ensemble => ensemble.length > 0);
}

// Mes tuiles sélectionnées, dans l'ordre où elles apparaissent à l'écran
function selectionOrdonnee() {
  const ordre = [...brouillon.main, ...brouillon.table.flat()];
  return ordre.filter(id => selection.has(id));
}

// Remet mon brouillon comme au début du tour
function reinitialiserBrouillon(etat) {
  brouillon = {
    table: etat.table.map(ensemble => ensemble.map(t => t.id)),
    main: [...ordreMain],
  };
  selection.clear();
}

// Appelée à chaque réception d'un état : met à jour la mémoire du module
function synchroniser(etat) {
  tuilesParId = new Map();
  etat.table.flat().forEach(t => tuilesParId.set(t.id, t));
  etat.main.forEach(t => tuilesParId.set(t.id, t));
  idsAnciens = new Set(etat.table.flat().map(t => t.id));

  // Nouvelle partie : on repart de zéro
  if (etat.idPartie !== idPartieVue) {
    idPartieVue = etat.idPartie;
    ordreMain = [];
    selection.clear();
  }
  // On garde l'ordre que j'avais choisi, les nouvelles tuiles vont à la fin
  const ids = etat.main.map(t => t.id);
  ordreMain = ordreMain.filter(id => ids.includes(id))
    .concat(ids.filter(id => !ordreMain.includes(id)));

  // On oublie les sélections de tuiles qui n'existent plus
  selection = new Set([...selection].filter(id => tuilesParId.has(id)));

  // Nouveau tour : on repart de l'état officiel
  const cle = `${etat.idPartie}:${etat.numeroTour}:${etat.phase}`;
  if (cle !== cleSynchro) {
    cleSynchro = cle;
    reinitialiserBrouillon(etat);
  }
}

// Appelé quand on quitte la partie (retour à la salle)
export function arreter() {
  nettoyerGlisse();
  brouillon = null;
  cleSynchro = null;
  selection.clear();
}

// ===================== GLISSER-DÉPOSER (souris ET doigt) =====================

function debutGlisser(e, id) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const element = e.currentTarget;
  element.setPointerCapture(e.pointerId);

  // Si la tuile fait partie de la sélection, on déplace toute la sélection
  const ids = selection.has(id) ? selectionOrdonnee() : [id];

  glisse = { id, ids, element, x0: e.clientX, y0: e.clientY, fantome: null, largeur: 0, hauteur: 0 };
  element.addEventListener('pointermove', pendantGlisser);
  element.addEventListener('pointerup', finGlisser);
  element.addEventListener('pointercancel', annulerGlisser);
}

function pendantGlisser(e) {
  if (!glisse) return;

  // On ne commence à glisser qu'après quelques pixels (pour ne pas confondre avec un simple clic)
  if (!glisse.fantome) {
    if (Math.hypot(e.clientX - glisse.x0, e.clientY - glisse.y0) < 6) return;
    const rect = glisse.element.getBoundingClientRect();
    glisse.largeur = rect.width;
    glisse.hauteur = rect.height;

    // Les tuiles déplacées deviennent transparentes à leur place d'origine
    // (à faire AVANT d'ajouter le fantôme, qui est aussi une « .tuile »)
    document.querySelectorAll('.tuile').forEach((element) => {
      if (glisse.ids.includes(Number(element.dataset.id))) element.classList.add('enGlisse');
    });

    // Le fantôme : une copie de la tuile saisie, qui suit le doigt ou la souris
    const fantome = glisse.element.cloneNode(true);
    fantome.classList.remove('selectionnee', 'posee', 'enGlisse');
    fantome.classList.add('tuileFantome');
    fantome.style.width = rect.width + 'px';
    fantome.style.height = rect.height + 'px';
    if (glisse.ids.length > 1) {
      fantome.appendChild(creer('span', 'badgeNombre', '×' + glisse.ids.length));
    }
    document.body.appendChild(fantome);
    glisse.fantome = fantome;
  }
  glisse.fantome.style.left = (e.clientX - glisse.largeur / 2) + 'px';
  glisse.fantome.style.top = (e.clientY - glisse.hauteur / 2) + 'px';
}

function finGlisser(e) {
  const g = glisse;
  nettoyerGlisse();
  if (!g) return;

  if (g.fantome) {
    // Un vrai glisser : on dépose
    const cible = document.elementFromPoint(e.clientX, e.clientY);
    deposer(g.ids, cible, e.clientX);
  } else {
    // Un simple clic : on sélectionne ou on désélectionne la tuile
    if (selection.has(g.id)) {
      selection.delete(g.id);
    } else {
      selection.add(g.id);
    }
    dessiner();
  }
}

function annulerGlisser() {
  nettoyerGlisse();
}

function nettoyerGlisse() {
  if (!glisse) return;
  glisse.element.removeEventListener('pointermove', pendantGlisser);
  glisse.element.removeEventListener('pointerup', finGlisser);
  glisse.element.removeEventListener('pointercancel', annulerGlisser);
  document.querySelectorAll('.enGlisse').forEach(el => el.classList.remove('enGlisse'));
  if (glisse.fantome) glisse.fantome.remove();
  glisse = null;
}

// Que faire quand on lâche les tuiles « ids » au-dessus de l'élément « cible » ?
function deposer(ids, cible, x) {
  if (!cible || !brouillon) return;
  const { etat, monId } = contexte;
  const monTour = etat.phase === 'jeu' && etat.joueurs[etat.courant].id === monId;

  const tuileCible = cible.closest('.tuile');
  const idCible = tuileCible ? Number(tuileCible.dataset.id) : null;
  if (idCible !== null && ids.includes(idCible)) return; // lâchées sur l'une d'elles

  // Avant ou après la tuile visée ?
  let apres = false;
  if (tuileCible) {
    const rect = tuileCible.getBoundingClientRect();
    apres = x > rect.left + rect.width / 2;
  }

  // 1) Dans mon jeu (toujours possible pour trier, sauf pour les tuiles déjà sur la table)
  if (cible.closest('#mainJoueur')) {
    const deplacables = ids.filter(id => !idsAnciens.has(id));
    if (deplacables.length === 0) return;

    deplacables.forEach(retirer);
    insererPlusieurs(brouillon.main, deplacables, idCible, apres);

    // On mémorise aussi le nouvel ordre de mon jeu
    ordreMain = ordreMain.filter(i => !deplacables.includes(i));
    insererPlusieurs(ordreMain, deplacables, idCible, apres);

    selection.clear();
    nettoyer();
    dessiner();
    return;
  }

  // Le reste (la table) n'est possible que pendant mon tour
  if (!monTour) return;

  // 2) Dans un ensemble existant
  const zoneEnsemble = cible.closest('[data-ensemble]');
  if (zoneEnsemble) {
    const ensemble = brouillon.table[Number(zoneEnsemble.dataset.ensemble)];
    if (!ensemble) return;
    ids.forEach(retirer);
    insererPlusieurs(ensemble, ids, idCible, apres);
    selection.clear();
    nettoyer();
    dessiner();
    return;
  }

  // 3) Dans un nouvel ensemble (toutes les tuiles ensemble)
  if (cible.closest('#nouvelEnsemble')) {
    const nouveau = [];
    brouillon.table.push(nouveau);
    ids.forEach(retirer);
    ids.forEach(id => nouveau.push(id));
    selection.clear();
    nettoyer();
    dessiner();
  }
}

// ===================== POSE PAR CLIC =====================

// Pose toutes les tuiles sélectionnées dans un NOUVEL ensemble
function poserSelection() {
  if (!brouillon || selection.size === 0) return;

  const ids = selectionOrdonnee();   // dans l'ordre d'affichage
  const nouveau = [];
  brouillon.table.push(nouveau);
  ids.forEach(retirer);              // on les enlève de leur place actuelle
  ids.forEach(id => nouveau.push(id));

  selection.clear();
  nettoyer();
  dessiner();
}

// Ajoute toutes les tuiles sélectionnées à la FIN d'un ensemble existant
function ajouterSelectionA(indexEnsemble) {
  if (!brouillon || selection.size === 0) return;
  const ensemble = brouillon.table[indexEnsemble];
  if (!ensemble) return;

  const ids = selectionOrdonnee().filter(id => !ensemble.includes(id));
  if (ids.length === 0) return;

  ids.forEach(retirer);
  ids.forEach(id => ensemble.push(id));

  selection.clear();
  nettoyer();
  dessiner();
}

// ===================== TRI DU JEU =====================

function trierMain(critere) {
  const cle = (id) => {
    const t = tuilesParId.get(id);
    if (t.joker) return [99, 99];
    const c = ORDRE_COULEURS[t.couleur];
    return critere === 'couleur' ? [c, t.valeur] : [t.valeur, c];
  };
  const comparer = (a, b) => {
    const ka = cle(a);
    const kb = cle(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  };
  brouillon.main.sort(comparer);
  ordreMain.sort(comparer);
  dessiner();
}

// ===================== AFFICHAGE =====================

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  contexte = { conteneur, etat, monId, envoyerAction };
  nettoyerGlisse();
  synchroniser(etat);
  dessiner();
}

// Crée une tuile. « deplacable » : on peut la glisser. « surTable » : elle est dans un ensemble.
function creerTuile(id, deplacable, surTable) {
  const tuile = tuilesParId.get(id);
  const div = creer('div', 'tuile');
  div.dataset.id = id;

  if (tuile.joker) {
    div.classList.add('joker');
    div.textContent = '☺';
  } else {
    div.classList.add('couleur-' + tuile.couleur);
    div.textContent = tuile.valeur;
  }
  // Les tuiles que j'ai posées pendant ce tour sont entourées
  if (surTable && !idsAnciens.has(id)) div.classList.add('posee');
  // Les tuiles sélectionnées sont soulevées
  if (selection.has(id)) div.classList.add('selectionnee');

  if (deplacable) {
    div.classList.add('deplacable');
    div.addEventListener('pointerdown', (e) => debutGlisser(e, id));
  }
  return div;
}

function dessiner() {
  const { conteneur, etat, monId, envoyerAction } = contexte;
  conteneur.innerHTML = '';

  const fin = etat.phase === 'fin';
  const courant = etat.joueurs[etat.courant];
  const monTour = !fin && courant.id === monId;
  const moi = etat.joueurs.find(j => j.id === monId);

  // ----- Message principal -----
  let texte;
  if (fin) {
    const gagnant = etat.resultat.gagnant;
    if (gagnant === null) {
      texte = `🤝 ${etat.resultat.message}`;
    } else if (gagnant === monId) {
      texte = '🏆 Bravo, tu as posé toutes tes tuiles : tié TROP FORT !';
    } else {
      texte = `💀 ${nomDe(etat, gagnant)} a posé toutes ses tuiles : t'es TROP TROP NUL.`;
    }
  } else {
    texte = monTour ? 'À toi de jouer !' : `Tour de ${courant.nom}`;
  }
  conteneur.appendChild(creer('p', 'statutCode', texte));

  // ----- Joueurs et pioche -----
  const panneau = creer('div', 'panneauCode');
  etat.joueurs.forEach((joueur, position) => {
    const actif = !fin && position === etat.courant ? ' actif' : '';
    const pose = joueur.aPose ? '' : ' (n\'a pas encore posé)';
    panneau.appendChild(creer('span', 'badgeCode' + actif, `${joueur.nom} : ${joueur.nbTuiles} tuile(s)${pose}`));
  });
  panneau.appendChild(creer('span', 'badgeCode', `Pioche : ${etat.taillePioche}`));
  conteneur.appendChild(panneau);

  if (etat.dernierEvenement && !fin) {
    conteneur.appendChild(creer('p', 'roleCode', etat.dernierEvenement));
  }

  // ----- La table : des paquets de 5 lignes, 3 paquets par ligne -----
  const table = creer('div');
  table.id = 'tableRummikub';

  if (brouillon.table.length > 0) {
    const grille = creer('div');
    grille.id = 'grillePaquets';
    let paquet = null;

    brouillon.table.forEach((ensemble, index) => {
      // Tous les 5 ensembles, on commence un nouveau paquet
      if (index % ENSEMBLES_PAR_PAQUET === 0) {
        paquet = creer('div', 'paquet');
        grille.appendChild(paquet);
      }

      const div = creer('div', 'ensemble');
      div.dataset.ensemble = index;
      if (monTour) {
        const valide = evaluerEnsemble(ensemble.map(id => tuilesParId.get(id)));
        div.classList.add(valide ? 'valide' : 'invalide');

        // Des tuiles sont sélectionnées : cliquer sur le fond de l'ensemble les y ajoute
        if (selection.size > 0) {
          div.classList.add('cible');
          div.addEventListener('click', (e) => {
            if (e.target === div) ajouterSelectionA(index);
          });
        }
      }
      ensemble.forEach(id => div.appendChild(creerTuile(id, monTour, true)));
      paquet.appendChild(div);
    });
    table.appendChild(grille);
  }

  if (monTour) {
    const zone = creer('div');
    zone.id = 'nouvelEnsemble';
    if (selection.size > 0) {
      zone.classList.add('prete');
      zone.textContent = `＋ Clique ici pour poser les ${selection.size} tuile(s) sélectionnée(s)`;
    } else {
      zone.textContent = '＋ Sélectionne des tuiles puis clique ici (ou glisse-les ici) pour créer un nouvel ensemble';
    }
    zone.addEventListener('click', poserSelection);
    table.appendChild(zone);
  } else if (brouillon.table.length === 0) {
    table.appendChild(creer('p', null, 'La table est vide.'));
  }
  conteneur.appendChild(table);

  // ----- Mon jeu -----
  if (!fin || brouillon.main.length > 0) {
    conteneur.appendChild(creer('h3', null, 'Ton jeu'));
    const main = creer('div');
    main.id = 'mainJoueur';
    brouillon.main.forEach(id => main.appendChild(creerTuile(id, !fin, false)));
    conteneur.appendChild(main);
  }

  if (fin) return;

  // ----- Boutons de tri et de sélection -----
  const ligneTri = creer('div', 'ligne');
  const boutonCouleur = creer('button', 'boutonRummikub petit', 'Trier par couleur');
  boutonCouleur.addEventListener('click', () => trierMain('couleur'));
  const boutonValeur = creer('button', 'boutonRummikub petit', 'Trier par valeur');
  boutonValeur.addEventListener('click', () => trierMain('valeur'));
  ligneTri.append(boutonCouleur, boutonValeur);

  if (selection.size > 0) {
    const boutonDeselection = creer('button', 'boutonRummikub petit',
      `Tout désélectionner (${selection.size})`);
    boutonDeselection.addEventListener('click', () => {
      selection.clear();
      dessiner();
    });
    ligneTri.appendChild(boutonDeselection);
  }
  conteneur.appendChild(ligneTri);
  conteneur.appendChild(creer('p', 'roleCode',
    'Clique sur plusieurs tuiles pour les sélectionner, puis glisse l\'une d\'elles : toutes la suivent.'));

  // ----- Commandes de mon tour -----
  if (monTour) {
    const verdict = verifierCoup(etat.table, etat.main, moi.aPose, brouillon.table);

    let message;
    if (verdict.ok) {
      message = '✅ Coup valide : tu peux valider.';
      if (verdict.points !== undefined) message += ` (${verdict.points} points)`;
    } else {
      message = verdict.message;
    }
    conteneur.appendChild(creer('p', verdict.ok ? 'roleCode' : 'alerteCode', message));
    if (!moi.aPose) {
      conteneur.appendChild(creer('p', 'roleCode',
        'Premier dépôt : 30 points minimum, uniquement avec tes tuiles (sans toucher à la table).'));
    }

    const ligne = creer('div', 'ligne');

    const boutonValider = creer('button', 'boutonRummikub', 'Valider');
    boutonValider.disabled = !verdict.ok;
    boutonValider.addEventListener('click', () => {
      envoyerAction({ type: 'valider', table: brouillon.table.filter(e => e.length > 0) });
    });

    const boutonAnnuler = creer('button', 'boutonRummikub', 'Annuler mes changements');
    boutonAnnuler.addEventListener('click', () => {
      reinitialiserBrouillon(etat);
      dessiner();
    });

    const boutonPiocher = creer('button', 'boutonRummikub', 'Piocher et finir le tour');
    boutonPiocher.addEventListener('click', () => envoyerAction({ type: 'piocher' }));

    ligne.append(boutonValider, boutonAnnuler, boutonPiocher);
    conteneur.appendChild(ligne);
  }
}