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

test('ui: applyMove slides and merges tiles', () => {
  view.setSize(4, 4);
  const game = new Game({ seed: 1 });
  // Row 0: [2,2,4,0], other rows empty -> LEFT merge produces 4@0, slide 4 to 1
  game.board.cells = [2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  view.render(game);
  assert.equal(view.tiles.size, 3);

  const { board, plan } = (() => {
    // Replay the same move the engine would do.
    const moved = game.attemptMove('left');
    assert.equal(moved, true);
    return { board: game.board, plan: game.lastMovePlan };
  })();

  view.applyMove(game, game.lastSpawnIndex);
  // After a 2+2 merge and 4 sliding, there are 2 surviving tiles + 1 spawn.
  const expectedFilled = board.cells.filter((v) => v !== 0).length;
  assert.equal(view.tiles.size, expectedFilled);
  assert.ok(view.tiles.has(0), 'merged tile sits at index 0');
  const merged = plan.find((p) => p.merged);
  assert.ok(merged, 'plan must contain a merge entry');
  assert.equal(view.tiles.get(0).value, 4, 'merged tile value updated');
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

test('ui: render with spawnAll adds spawn animation class', () => {
  view.setSize(2, 2);
  const game = new Game({ seed: 2 });
  game.board.cells = [2, 4, 0, 0];
  view.render(game, { spawnAll: true });
  const spawns = view.tileLayer.querySelectorAll('.tile-spawn');
  assert.equal(spawns.length, 2);
});