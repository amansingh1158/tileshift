import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Game } from '../app/js/engine.js';

const dom = new JSDOM(
  `<!DOCTYPE html><html><head></head><body><div id="board"></div></body></html>`,
  { url: 'http://localhost/' }
);

global.window = dom.window;
global.document = dom.window.document;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
global.localStorage = dom.window.localStorage;

const { BoardView, THEMES } = await import('../app/js/ui.js');

let view;

before(() => {
  view = new BoardView(document.getElementById('board'));
});

test('ui: full render creates one tile per occupied cell', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 1 });
  game.board.cells = [2, 0, 4, 0, 0, 8, 0, 16, 0, 0, 32, 0, 64, 0, 0, 128];
  view.render(game);
  assert.equal(view.tiles.size, 7);
  assert.equal(view.tileLayer.querySelectorAll('.tile').length, 7);
  assert.equal(view.tileLayer.querySelectorAll('.cell').length, 0);
  assert.equal(view.cellLayer.querySelectorAll('.cell').length, 16);
});

test('ui: setSize rebuilds the background grid', () => {
  view.setSize(3, 5);
  assert.equal(view.cellLayer.querySelectorAll('.cell').length, 15);
});

test('ui: applyMove keeps merged tiles when pair slides over empty cells', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 1 });
  // Row 0: [0,2,2,0] LEFT -> merged 4 must end up at cell 0 (this used to vanish).
  game.board.cells = [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  view.render(game);
  assert.equal(view.tiles.size, 2);

  const moved = game.attemptMove('left');
  assert.equal(moved, true);
  view.applyMove(game, game.lastSpawnIndex);

  const expectedFilled = game.board.cells.filter((v) => v !== 0).length;
  assert.equal(view.tiles.size, expectedFilled, 'every engine tile has a DOM tile');
  assert.equal(view.tiles.get(0).value, 4, 'merged 4 is rendered at cell 0');
});

test('ui: applyMove with merge and follow-up slide keeps all tiles', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 1 });
  // Row 0: [2,2,4,0] LEFT -> merged 4@0, slid 4@1, plus spawn.
  game.board.cells = [2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  view.render(game);
  const moved = game.attemptMove('left');
  assert.equal(moved, true);
  view.applyMove(game, game.lastSpawnIndex);
  const expectedFilled = game.board.cells.filter((v) => v !== 0).length;
  assert.equal(view.tiles.size, expectedFilled);
  assert.ok(view.tiles.has(0), 'merged tile sits at index 0');
  assert.ok(view.tiles.has(1), 'slid tile sits at index 1');
  assert.equal(view.tiles.get(0).value, 4);
});

test('ui: theme palette covers 2..2048 and high tiles', () => {
  for (const theme of Object.keys(THEMES)) {
    const t = THEMES[theme];
    for (let v = 2; v <= 2048; v *= 2) {
      assert.ok(t.palette[v], `${theme} missing palette for ${v}`);
    }
    assert.ok(t.boardBg && t.emptyCell && t.body.bg && t.body.text);
  }
});

test('ui: tiles are positioned at their own cell, not the top-left corner', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 2 });
  game.board.cells = [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0];
  view.render(game, { spawnAll: true });
  const t1 = view.tiles.get(1);
  const t2 = view.tiles.get(10);
  assert.ok(t1.el.style.transform.startsWith('translate('));
  assert.notEqual(t1.el.style.transform, 'translate(0px, 0px)', 'cell 1 must not sit at the corner');
  assert.notEqual(t2.el.style.transform, 'translate(0px, 0px)', 'cell 10 must not sit at the corner');
  // Spawn scale animation must live on the INNER element so it never
  // overrides the outer translate (this was the corner-jump bug).
  const inner = t1.el.querySelector('.tile-inner');
  assert.ok(inner, 'tile has inner wrapper');
  assert.ok(inner.classList.contains('tile-spawn'));
  assert.ok(!t1.el.classList.contains('tile-spawn'));
});

test('ui: merge pop animation is applied to the inner element', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 1 });
  game.board.cells = [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  view.render(game);
  game.attemptMove('left');
  view.applyMove(game, game.lastSpawnIndex);
  const survivor = view.tiles.get(0);
  assert.ok(survivor.el._inner.classList.contains('tile-merge'), 'pop animation on inner');
  assert.ok(!survivor.el.classList.contains('tile-merge'), 'outer keeps clean translate');
  assert.ok(survivor.el.style.transform.startsWith('translate('), 'outer still translated');
});

test('ui: render with spawnAll adds spawn animation class', () => {
  view.setSize(2, 2);
  const game = new Game({ seed: 2 });
  game.board.cells = [2, 4, 0, 0];
  view.render(game, { spawnAll: true });
  const spawns = view.tileLayer.querySelectorAll('.tile-spawn');
  assert.equal(spawns.length, 2);
});