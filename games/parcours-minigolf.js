// ===================== LES TROUS DU MINI-GOLF =====================
// Le terrain fait toujours 400 de large sur 560 de haut (x vers la droite, y vers le BAS).
// Chaque trou est décrit par :
//   contour   : les coins du terrain jouable (une forme fermée, les murs sont les côtés)
//   obstacles : des blocs { type: 'rect', x, y, w, h } ou des plots ronds { type: 'cercle', x, y, r }
//   sable     : des zones { x, y, w, h } où la balle ralentit très vite
//   depart    : le point de départ des balles
//   trou      : la position du trou
// Pour ajouter un trou, copie un des blocs ci-dessous à la fin de la liste PARCOURS.

export const LARGEUR = 400;
export const HAUTEUR = 560;

export const PARCOURS = [
  {
    nom: 'Droit au but',
    difficulte: 1,
    contour: [[110, 30], [290, 30], [290, 540], [110, 540]],
    obstacles: [],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 90 },
  },
  {
    nom: 'Le goulot',
    difficulte: 1,
    contour: [[60, 540], [340, 540], [340, 330], [230, 330], [230, 200], [310, 200],
              [310, 30], [90, 30], [90, 200], [170, 200], [170, 330], [60, 330]],
    obstacles: [],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 85 },
  },
  {
    nom: 'Le virage',
    difficulte: 1,
    contour: [[60, 540], [160, 540], [160, 300], [360, 300], [360, 200], [60, 200]],
    obstacles: [],
    sable: [],
    depart: { x: 110, y: 495 },
    trou: { x: 320, y: 250 },
  },
  {
    nom: 'Le mur',
    difficulte: 1,
    contour: [[60, 30], [340, 30], [340, 540], [60, 540]],
    obstacles: [{ type: 'rect', x: 130, y: 270, w: 140, h: 24 }],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 85 },
  },
  {
    nom: 'Le bunker',
    difficulte: 1,
    contour: [[70, 30], [330, 30], [330, 540], [70, 540]],
    obstacles: [],
    sable: [{ x: 70, y: 240, w: 180, h: 80 }],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 85 },
  },
  {
    nom: 'Le zigzag',
    difficulte: 2,
    contour: [[40, 30], [360, 30], [360, 540], [40, 540]],
    obstacles: [
      { type: 'rect', x: 40, y: 360, w: 250, h: 20 },
      { type: 'rect', x: 110, y: 200, w: 250, h: 20 },
    ],
    sable: [],
    depart: { x: 100, y: 495 },
    trou: { x: 320, y: 90 },
  },
  {
    nom: 'Les plots',
    difficulte: 2,
    contour: [[40, 30], [360, 30], [360, 540], [40, 540]],
    obstacles: [
      { type: 'cercle', x: 110, y: 340, r: 20 },
      { type: 'cercle', x: 290, y: 340, r: 20 },
      { type: 'cercle', x: 200, y: 250, r: 20 },
      { type: 'cercle', x: 110, y: 160, r: 20 },
      { type: 'cercle', x: 290, y: 160, r: 20 },
    ],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 75 },
  },
  {
    nom: 'Le sablier',
    difficulte: 2,
    contour: [[60, 540], [340, 540], [340, 440], [230, 300], [340, 160], [340, 30],
              [60, 30], [60, 160], [170, 300], [60, 440]],
    obstacles: [],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 280, y: 90 },
  },
  {
    nom: 'Les piliers',
    difficulte: 2,
    contour: [[40, 30], [360, 30], [360, 540], [40, 540]],
    obstacles: [
      { type: 'rect', x: 90, y: 390, w: 50, h: 50 },
      { type: 'rect', x: 260, y: 390, w: 50, h: 50 },
      { type: 'rect', x: 175, y: 290, w: 50, h: 50 },
      { type: 'rect', x: 90, y: 190, w: 50, h: 50 },
      { type: 'rect', x: 260, y: 190, w: 50, h: 50 },
    ],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 80 },
  },
  {
    nom: 'Les deux bunkers',
    difficulte: 2,
    contour: [[60, 30], [340, 30], [340, 540], [60, 540]],
    obstacles: [{ type: 'rect', x: 140, y: 120, w: 120, h: 24 }],
    sable: [
      { x: 60, y: 380, w: 150, h: 60 },
      { x: 190, y: 240, w: 150, h: 60 },
    ],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 75 },
  },
  {
    nom: 'La serrure',
    difficulte: 2,
    contour: [[150, 540], [250, 540], [250, 380], [340, 380], [340, 30], [60, 30], [60, 380], [150, 380]],
    obstacles: [{ type: 'cercle', x: 200, y: 200, r: 35 }],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 80 },
  },
  {
    nom: 'La chicane',
    difficulte: 2,
    contour: [[100, 30], [300, 30], [300, 540], [100, 540]],
    obstacles: [
      { type: 'rect', x: 100, y: 420, w: 120, h: 18 },
      { type: 'rect', x: 180, y: 320, w: 120, h: 18 },
      { type: 'rect', x: 100, y: 220, w: 120, h: 18 },
    ],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 80 },
  },
  {
    nom: 'Le serpent',
    difficulte: 3,
    contour: [[40, 540], [360, 540], [360, 300], [120, 300], [120, 220], [360, 220],
              [360, 140], [40, 140], [40, 380], [280, 380], [280, 460], [40, 460]],
    obstacles: [],
    sable: [],
    depart: { x: 80, y: 500 },
    trou: { x: 320, y: 180 },
  },
  {
    nom: 'Le fossé de sable',
    difficulte: 3,
    contour: [[40, 30], [360, 30], [360, 540], [40, 540]],
    obstacles: [
      { type: 'cercle', x: 130, y: 300, r: 18 },
      { type: 'cercle', x: 270, y: 300, r: 18 },
      { type: 'cercle', x: 200, y: 380, r: 18 },
    ],
    sable: [{ x: 110, y: 40, w: 180, h: 120 }],
    depart: { x: 200, y: 495 },
    trou: { x: 200, y: 90 },
  },
  {
    nom: "L'enclos",
    difficulte: 3,
    contour: [[40, 30], [360, 30], [360, 540], [40, 540]],
    obstacles: [
      { type: 'rect', x: 120, y: 60, w: 170, h: 14 },
      { type: 'rect', x: 120, y: 60, w: 14, h: 130 },
      { type: 'rect', x: 120, y: 176, w: 170, h: 14 },
      { type: 'cercle', x: 250, y: 320, r: 25 },
    ],
    sable: [],
    depart: { x: 200, y: 495 },
    trou: { x: 190, y: 125 },
  },
];

// Le trou bonus (départage) : terrain dégagé, le trou en haut, les balles à égale distance en bas
export const TROU_BONUS = {
  nom: 'Trou bonus',
  difficulte: 1,
  contour: [[20, 20], [380, 20], [380, 540], [20, 540]],
  obstacles: [],
  sable: [],
  depart: { x: 200, y: 400 },
  trou: { x: 200, y: 140 },
};