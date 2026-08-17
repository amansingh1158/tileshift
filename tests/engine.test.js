import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTIONS,
  Game,
  canMove,
  createBoard,
  hasReached,
  highestTile,
  isGameOver,
  move,
  spawnRandom,
} from '../app/js/engine.js';

function cellsOf(arr, cols) {
  return createBoard(arr.length / cols, cols).cells;
}

test('mergeLine: compress and merge left', () => {
  const { board } = move({ rows: 1, cols: 4, cells: [2, 2, 2, 2] }, DIRECTIONS.LEFT);
  assert.deepEqual(board.cells, [4, 4, 0, 0]);
});

test('mergeLine: merged tile does not merge again in same move', () => {
  const { board } = move({ rows: 1, cols: 4, cells: [4, 2, 2, 0] }, DIRECTIONS.LEFT);
  assert.deepEqual(board.cells, [4, 4, 0, 0]);
});

test('move LEFT: classic 2048 example', () => {
  const { board, score } = move({ rows: 1, cols: 4, cells: [2, 2, 4, 0] }, DIRECTIONS.LEFT);
  assert.deepEqual(board.cells, [4, 4, 0, 0]);
  assert.equal(score, 4);
});

test('move RIGHT mirrors LEFT', () => {
  const { board } = move({ rows: 1, cols: 4, cells: [2, 2, 4, 0] }, DIRECTIONS.RIGHT);
  assert.deepEqual(board.cells, [0, 0, 4, 4]);
});

test('move UP and DOWN on a column', () => {
  const cells = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0];
  const up = move({ rows: 4, cols: 4, cells }, DIRECTIONS.UP);
  assert.deepEqual(up.board.cells, [4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const down = move({ rows: 4, cols: 4, cells }, DIRECTIONS.DOWN);
  assert.deepEqual(down.board.cells, [0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]);
});

test('moved flag is false when nothing changes', () => {
  const board = { rows: 2, cols: 2, cells: [4, 8, 2, 4] };
  const res = move(board, DIRECTIONS.LEFT);
  assert.equal(res.moved, false);
});

test('spawnRandom lands on an empty cell', () => {
  const board = { rows: 4, cols: 4, cells: new Array(16).fill(0) };
  const { board: next, index } = spawnRandom(board, () => 0);
  assert.ok(index >= 0 && index < 16);
  assert.equal(next.cells.filter((v) => v !== 0).length, 1);
  assert.ok([2, 4].includes(next.cells[index]));
});

test('game over detection', () => {
  const board = { rows: 2, cols: 2, cells: [2, 4, 8, 16] };
  assert.equal(isGameOver(board), true);
  const ok = { rows: 2, cols: 2, cells: [2, 4, 8, 8] };
  assert.equal(isGameOver(ok), false);
  const ok2 = { rows: 2, cols: 2, cells: [2, 4, 8, 0] };
  assert.equal(isGameOver(ok2), false);
});

test('canMove detects vertical merges', () => {
  const board = { rows: 2, cols: 2, cells: [2, 16, 2, 8] };
  assert.equal(canMove(board), true);
});

test('highestTile and hasReached', () => {
  const board = { rows: 1, cols: 3, cells: [4, 2048, 8] };
  assert.equal(highestTile(board), 2048);
  assert.equal(hasReached(board, 2048), true);
});

test('Game: reset places exactly two tiles', () => {
  const g = new Game({ seed: 42 });
  g.reset();
  assert.equal(g.board.cells.filter((v) => v !== 0).length, 2);
  assert.equal(g.over, false);
});

test('Game: valid move increases score and adds a tile', () => {
  const g = new Game({ seed: 7 });
  g.reset();
  const before = g.board.cells.filter((v) => v !== 0).length;
  // Force a mergeable state: two 2s side by side.
  g.board.cells[0] = 2;
  g.board.cells[1] = 2;
  const moved = g.attemptMove(DIRECTIONS.LEFT);
  assert.equal(moved, true);
  assert.equal(g.score, 4);
  assert.ok(g.board.cells.filter((v) => v !== 0).length >= before - 1);
});

test('Game: invalid move returns false and changes nothing', () => {
  const g = new Game({ seed: 3 });
  g.board = { rows: 2, cols: 2, cells: [2, 4, 8, 16] };
  const moved = g.attemptMove(DIRECTIONS.LEFT);
  assert.equal(moved, false);
  assert.equal(g.score, 0);
});

test('Game: undo restores previous state', () => {
  const g = new Game({ seed: 9 });
  g.board = { rows: 2, cols: 2, cells: [2, 2, 0, 0] };
  g.attemptMove(DIRECTIONS.LEFT);
  const scoreAfter = g.score;
  const undoOk = g.undo();
  assert.equal(undoOk, true);
  assert.equal(g.score, 0);
  assert.deepEqual(g.board.cells, [2, 2, 0, 0]);
  assert.equal(scoreAfter, 4);
});

test('Game: reaching target sets won', () => {
  const g = new Game({ seed: 5 });
  g.board = { rows: 2, cols: 2, cells: [1024, 1024, 0, 0] };
  g.attemptMove(DIRECTIONS.LEFT);
  assert.equal(g.won, true);
  assert.equal(g.over, false);
});

test('Game: continueAfterWin lets play resume', () => {
  const g = new Game({ seed: 5 });
  g.board = { rows: 2, cols: 2, cells: [1024, 1024, 0, 0] };
  g.attemptMove(DIRECTIONS.LEFT);
  g.continueAfterWin();
  assert.equal(g.won, false);
  assert.equal(g.continued, true);
});

test('Game: serialize/deserialize round-trip', () => {
  const g = new Game({ seed: 11 });
  g.reset();
  g.attemptMove(DIRECTIONS.UP);
  g.attemptMove(DIRECTIONS.RIGHT);
  const restored = Game.deserialize(g.serialize());
  assert.deepEqual(restored.board.cells, g.board.cells);
  assert.equal(restored.score, g.score);
  assert.equal(restored.over, g.over);
  assert.equal(restored.won, g.won);
  assert.equal(restored.rows, g.rows);
  assert.equal(restored.cols, g.cols);
});

test('move emits animation plan with from/to and merge flags', () => {
  // Row: 2@0, 2@1, 4@2 -> left => merged 4@0 (from 1), slide 4@2->1
  const { plan } = move({ rows: 1, cols: 4, cells: [2, 2, 4, 0] }, DIRECTIONS.LEFT);
  const merged = plan.find((p) => p.merged);
  const slide = plan.find((p) => !p.merged);
  assert.deepEqual(merged, { value: 4, from: 1, to: 0, merged: true });
  assert.deepEqual(slide, { value: 4, from: 2, to: 1, merged: false });
});

test('Game: rectangle boards work', () => {
  const g = new Game({ rows: 3, cols: 5, seed: 1 });
  g.reset();
  assert.equal(g.board.cells.length, 15);
  const before = g.board.cells.filter((v) => v !== 0).length;
  g.board.cells[0] = 4;
  g.board.cells[1] = 4;
  const moved = g.attemptMove(DIRECTIONS.LEFT);
  assert.equal(moved, true);
  assert.ok(g.board.cells.filter((v) => v !== 0).length >= before);
});