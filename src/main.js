import { createGame } from './game.js';

const canvas = document.getElementById('c');
const game = createGame(canvas);

// Debug handle: mounted on window.__game in dev only. The whole block is
// statically stripped from production builds.
if (import.meta.env.DEV) window.__game = game;
