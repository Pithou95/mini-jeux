import { CONSTANTES } from '../games/pays.js';

const { DUREE_QUESTION } = CONSTANTES;

// ===================== MÉMOIRE DU MODULE =====================
// Ces variables survivent entre deux affichages

let contexte = null;       // { conteneur, etat, monId, envoyerAction }
let cleQuestion = '';      // identifie la question affichée
let clePhase = '';         // identifie la phase affichée (question, révélation, fin)
let instantDebut = 0;      // l'instant où la question est apparue sur MON écran
let instantPhase = 0;      // l'instant où la phase actuelle est apparue
let dejaEnvoye = false;    // j'ai déjà répondu (ou passé) à cette question
let choixLocal = null;     // la proposition que j'ai cliquée
let passeLocal = false;    // j'ai cliqué sur « Passer »
let intervalle = null;     // met à jour le compte à rebours

// ===================== OUTILS =====================

function creer(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

function secondes(ms) {
  return (ms / 1000).toFixed(2).replace('.', ',') + ' s';
}

// Appelé quand on quitte la partie (retour à la salle)
export function arreter() {
  clearInterval(intervalle);
  intervalle = null;
  cleQuestion = '';
  clePhase = '';
}

// ===================== POINT D'ENTRÉE =====================

export function afficher({ conteneur, etat, monId, envoyerAction }) {
  contexte = { conteneur, etat, monId, envoyerAction };

  // Nouvelle question : mon chrono personnel repart de zéro
  const cle = `${etat.idPartie}:${etat.numero}`;
  if (cle !== cleQuestion) {
    cleQuestion = cle;
    instantDebut = performance.now();
    dejaEnvoye = false;
    choixLocal = null;
    passeLocal = false;
  }
  const clePh = `${cle}:${etat.phase}`;
  if (clePh !== clePhase) {
    clePhase = clePh;
    instantPhase = performance.now();
  }

  dessiner();

  clearInterval(intervalle);
  intervalle = null;
  if (etat.phase !== 'fin') {
    intervalle = setInterval(majTemps, 100);
  }
}

// ===================== MES ACTIONS =====================

function repondre(indice) {
  if (dejaEnvoye) return;
  // C'est MON navigateur qui mesure le temps : le réseau n'a aucune influence
  const temps = Math.round(performance.now() - instantDebut);
  if (temps > DUREE_QUESTION * 1000) return;

  dejaEnvoye = true;
  choixLocal = indice;
  contexte.envoyerAction({ type: 'repondre', choix: indice, temps });
  dessiner();
}

function passerQuestion() {
  if (dejaEnvoye) return;
  dejaEnvoye = true;
  passeLocal = true;
  contexte.envoyerAction({ type: 'passer' });
  dessiner();
}

// ===================== COMPTE À REBOURS =====================

function majTemps() {
  if (!contexte) return;
  const { etat } = contexte;
  const texte = document.getElementById('texteTempsPays');
  if (!texte) return;

  if (etat.phase === 'question') {
    const reste = Math.max(0, DUREE_QUESTION - (performance.now() - instantDebut) / 1000);
    texte.textContent = `Temps restant : ${Math.ceil(reste)} s`;
    const barre = document.getElementById('barreTempsPays');
    if (barre) {
      barre.style.width = (reste / DUREE_QUESTION * 100) + '%';
      barre.classList.toggle('urgent', reste <= 3);
    }
    // Temps écoulé : on ne peut plus répondre
    if (reste <= 0) {
      document.querySelectorAll('.optionPays, #boutonPasser').forEach((bouton) => {
        bouton.disabled = true;
      });
    }
  } else if (etat.phase === 'revelation') {
    const reste = Math.max(0, etat.pause - (performance.now() - instantPhase) / 1000);
    texte.textContent = `Question suivante dans ${Math.ceil(reste)} s`;
  }
}

// ===================== DESSIN =====================

function dessiner() {
  const { conteneur, etat, monId } = contexte;
  conteneur.innerHTML = '';

  const q = etat.question;
  const enQuestion = etat.phase === 'question';
  const aDejaRepondu = dejaEnvoye || etat.maReponse !== null;
  const aPasse = passeLocal || (etat.maReponse !== null && etat.maReponse.passe);
  const monChoix = choixLocal !== null ? choixLocal : (etat.maReponse ? etat.maReponse.choix : null);
  const bonne = etat.derniere ? etat.derniere.bonne : null;

  // ----- Titre -----
  conteneur.appendChild(creer('p', 'statutCode', `Question ${etat.numero} — premier à ${etat.objectif} points`));

  // ----- Scores (✅ = a déjà répondu, sans dire quoi) -----
  const scores = creer('div', 'panneauCode');
  etat.joueurs.forEach((joueur) => {
    let texte = `${joueur.nom}${joueur.id === monId ? ' (toi)' : ''} : ${joueur.score}`;
    if (enQuestion && etat.aRepondu[joueur.id]) texte += ' ✅';
    scores.appendChild(creer('span', 'badgeCode' + (joueur.id === monId ? ' actif' : ''), texte));
  });
  conteneur.appendChild(scores);

  // ----- Minuteur -----
  if (enQuestion) {
    const barre = creer('div', 'barrePays');
    const rempli = creer('div');
    rempli.id = 'barreTempsPays';
    barre.appendChild(rempli);
    conteneur.appendChild(barre);
  }
  const texteTemps = creer('p', 'roleCode');
  texteTemps.id = 'texteTempsPays';
  conteneur.appendChild(texteTemps);

  // ----- La question -----
  const bloc = creer('div', 'blocQuestionPays');
  bloc.appendChild(creer('p', 'enoncePays', q.enonce));
  if (q.drapeau) {
    const image = document.createElement('img');
    image.id = 'drapeauPays';
    image.src = `images_pays/${q.drapeau}.webp`;
    image.alt = 'Drapeau à identifier';
    bloc.appendChild(image);
  }
  if (q.sujetTexte) {
    bloc.appendChild(creer('p', 'sujetPays', q.sujetTexte));
  }
  conteneur.appendChild(bloc);

  // ----- Les 4 propositions -----
  const grille = creer('div', 'optionsPays');
  q.options.forEach((texte, i) => {
    const bouton = creer('button', 'optionPays', texte);
    bouton.type = 'button';

    if (enQuestion) {
      if (aDejaRepondu) {
        bouton.disabled = true;
        if (i === monChoix) bouton.classList.add('choisie');
      } else {
        bouton.addEventListener('click', () => repondre(i));
      }
    } else {
      // Révélation : la bonne réponse en vert, ma mauvaise réponse en rouge
      bouton.disabled = true;
      if (i === bonne) bouton.classList.add('bonne');
      else if (i === monChoix) bouton.classList.add('mauvaise');
      if (i === monChoix) bouton.classList.add('choisie');
    }
    grille.appendChild(bouton);
  });
  conteneur.appendChild(grille);

  // ----- Passer / message d'attente -----
  if (enQuestion && !aDejaRepondu) {
    const passer = creer('button', null, 'Passer');
    passer.id = 'boutonPasser';
    passer.type = 'button';
    passer.addEventListener('click', passerQuestion);
    conteneur.appendChild(passer);
  }
  if (enQuestion && aDejaRepondu) {
    conteneur.appendChild(creer('p', 'roleCode',
      aPasse ? 'Tu as passé cette question. En attente des autres joueurs...'
             : 'Réponse enregistrée. En attente des autres joueurs...'));
  }

  // ----- Résultats de la question -----
  if (!enQuestion && etat.derniere) {
    conteneur.appendChild(creer('h3', null, 'Résultats de la question'));
    conteneur.appendChild(creerResultats(etat));
  }

  // ----- Fin de partie -----
  if (etat.phase === 'fin') {
    conteneur.appendChild(creerFin(etat, monId));
  }

  majTemps();
}

// La liste « qui a répondu quoi, et combien de points »
function creerResultats(etat) {
  const liste = creer('ul', 'resultatsPays');
  etat.derniere.details.forEach((d) => {
    let texte;
    let classe = 'neutre';
    if (d.choix !== null) {
      classe = d.correct ? 'bien' : 'mal';
      texte = `${d.correct ? '✅' : '❌'} ${d.nom} : ${etat.question.options[d.choix]} (${secondes(d.temps)})`;
    } else {
      texte = `➖ ${d.nom} : ${d.passe ? 'a passé' : 'pas de réponse'}`;
    }
    const points = d.delta > 0 ? `+${d.delta}` : String(d.delta);
    texte += ` → ${points} ${Math.abs(d.delta) > 1 ? 'pts' : 'pt'}`;
    if (d.premier) texte += ' (⚡ le plus rapide : bonus inclus)';
    liste.appendChild(creer('li', classe, texte));
  });
  return liste;
}

// Le bandeau final et le classement
function creerFin(etat, monId) {
  const bloc = creer('div', 'finPays');
  const ids = etat.resultat.gagnantsIds;

  let titre;
  if (ids.length > 1) {
    titre = '🤝 Égalité parfaite !';
  } else if (ids[0] === monId) {
    titre = '🏆 Tu remportes la partie, tié un puit de connaissances !';
  } else {
    const gagnant = etat.joueurs.find(j => j.id === ids[0]);
    titre = `💀 ${gagnant.nom} remporte la partie, tié nul cultive toi.`;
  }
  bloc.appendChild(creer('p', 'statutCode', titre));
  bloc.appendChild(creer('p', 'roleCode', etat.resultat.message));

  const lent = (j) => (j.moyenne === null ? 1e12 : j.moyenne);
  const classement = [...etat.joueurs].sort((a, b) => b.score - a.score || lent(a) - lent(b));
  const liste = creer('ul', 'resultatsPays');
  classement.forEach((joueur, position) => {
    const moyenne = joueur.moyenne === null ? '—' : secondes(joueur.moyenne);
    liste.appendChild(creer('li', ids.includes(joueur.id) ? 'bien' : 'neutre',
      `${position + 1}. ${joueur.nom} : ${joueur.score} ${Math.abs(joueur.score) > 1 ? 'pts' : 'pt'} (temps moyen des bonnes réponses : ${moyenne})`));
  });
  bloc.appendChild(liste);
  return bloc;
}