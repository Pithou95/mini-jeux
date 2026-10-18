import { memory } from './games/memory.js';
import { chronometre } from './games/chronometre.js';
import { codename } from './games/codename.js';
import { rummikub } from './games/rummikub.js';
import { sumo } from './games/sumo.js';
import { pays } from './games/pays.js';

// La clé (à gauche) identifie le jeu dans les messages réseau
export const JEUX = {
  memory: memory,
  chronometre: chronometre,
  codename: codename,
  rummikub: rummikub,
  sumo: sumo,
  pays: pays,
};