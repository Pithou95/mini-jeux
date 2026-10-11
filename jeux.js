import { memory } from './games/memory.js';
import { chronometre } from './games/chronometre.js';

// La clé (à gauche) identifie le jeu dans les messages réseau
export const JEUX = {
  memory: memory,
  chronometre: chronometre,
};