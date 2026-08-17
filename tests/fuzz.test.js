import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { COMBO_BONUS, DIRECTIONS, Game } from '../app/js/engine.js';

const dom = new JSDOM('<div id="board"></div>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
global.localStorage = dom.window.localStorage;

const { BoardView } = await import('../app/js/ui.js');

const DIRS = [DIRECTIONS.UP, DIRECTIONS.DOWN, DIRECTIONS.LEFT, DIRECTIONS.RIGHT];

test('fuzz: engine and view stay in sync across many games and moves', () => {
  let totalMoves = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const g = new Game({ seed });
    g.reset();
    const view = new BoardView(document.getElementById('board'));
    view.setSize(g.rows, g.cols);
    view.render(g);

    let expectedScore = 0;
    for (let i = 0; i < 200 && !g.over; i++) {
      const dir = DIRS[(seed * 7 + i * 13) % 4];
      const moved = g.attemptMove(dir);
      if (moved) {
        view.applyMove(g, g.lastSpawnIndex);
        const filled = g.board.cells.filter((v) => v !== 0).length;
        assert.equal(view.tiles.size, filled, `seed ${seed} move ${i}: engine/view tile count`);
        for (const [idx, rec] of view.tiles) {
          assert.equal(g.board.cells[idx], rec.value, `seed ${seed} move ${i}: tile ${idx} value`);
        }
        const plan = g.lastMovePlan || [];
        const merges = plan.filter((p) => p.merged).length;
        const mergedSum = plan.filter((p) => p.merged).reduce((s, p) => s + p.value, 0);
        expectedScore += mergedSum + (merges >= 2 ? (merges - 1) * COMBO_BONUS : 0);
        assert.equal(g.score, expectedScore, `seed ${seed} move ${i}: score = merges + combos`);
        totalMoves++;
      }
      if (g.won) g.continueAfterWin();
    }
    view.setSize(g.rows, g.cols); // dispose cleanly
  }
  assert.ok(totalMoves > 10000, `expected many moves, got ${totalMoves}`);
});

test('fuzz: game-over detection only after a full locked board', () => {
  let gameOvers = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const g = new Game({ seed });
    g.reset();
    for (let i = 0; i < 2000 && !g.over; i++) {
      g.attemptMove(DIRS[(seed + i) % 4]);
      if (g.over) {
        // Board must be full and without any adjacent equal tiles.
        const cells = g.board.cells;
        assert.ok(cells.every((v) => v !== 0), 'game over implies full board');
        const rows = g.rows;
        const cols = g.cols;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (c + 1 < cols) assert.notEqual(cells[r * cols + c], cells[r * cols + c + 1]);
            if (r + 1 < rows) assert.notEqual(cells[r * cols + c], cells[(r + 1) * cols + c]);
          }
        }
        gameOvers++;
        break;
      }
    }
  }
  assert.ok(gameOvers > 30, `expected frequent game overs, got ${gameOvers}`);
});