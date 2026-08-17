// Pure game logic. No DOM, no side effects — fully unit-testable in Node.
// Board cells are stored as a flat array of length rows*cols. 0 = empty.

export const DIRECTIONS = Object.freeze({ UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' });
export const DEFAULT_TARGET = 2048;
export const DEFAULT_ROWS = 4;
export const DEFAULT_COLS = 4;

// Deterministic PRNG (mulberry32) so tests are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBoard(rows, cols) {
  return { rows, cols, cells: new Array(rows * cols).fill(0) };
}

export function cloneBoard(board) {
  return { rows: board.rows, cols: board.cols, cells: board.cells.slice() };
}

export function indexOf(row, col, cols) {
  return row * cols + col;
}

export function getCell(board, row, col) {
  return board.cells[indexOf(row, col, board.cols)];
}

// Compress a line to the left and merge adjacent equal pairs (left to right).

// Read a line (row or column) oriented in the direction of travel.
// Each entry carries its absolute cell index so the UI can animate movement.
function lineAt(board, dir, index) {
  const { rows, cols, cells } = board;
  const out = [];
  if (dir === DIRECTIONS.UP || dir === DIRECTIONS.DOWN) {
    for (let r = 0; r < rows; r++) {
      const rr = dir === DIRECTIONS.UP ? r : rows - 1 - r;
      out.push({ value: cells[rr * cols + index], idx: rr * cols + index });
    }
  } else {
    for (let c = 0; c < cols; c++) {
      const cc = dir === DIRECTIONS.LEFT ? c : cols - 1 - c;
      out.push({ value: cells[index * cols + cc], idx: index * cols + cc });
    }
  }
  return out;
}

// Slide + merge the whole board in a direction.
// Returns { board, score, moved, plan } where plan describes every tile that
// moved or merged: { value, from, to, merged }. `to` is the absolute cell index
// the tile now occupies; for a merged tile `from` is the cell of the tile that
// slid in and disappeared, and the surviving tile sits at `to`.
export function move(board, dir) {
  const next = cloneBoard(board);
  let score = 0;
  let moved = false;
  const plan = [];
  const lineCount = dir === DIRECTIONS.UP || dir === DIRECTIONS.DOWN ? next.cols : next.rows;
  for (let i = 0; i < lineCount; i++) {
    const line = lineAt(next, dir, i);
    const res = mergeLineIndexed(line);
    if (res.moved) moved = true;
    score += res.score;
    for (const tile of res.out) {
      if (tile.value !== 0) {
        if (tile.merged) {
          plan.push({ value: tile.value, from: tile.srcs[1], to: tile.to, merged: true });
        } else {
          plan.push({ value: tile.value, from: tile.srcs[0], to: tile.to, merged: false });
        }
      }
    }
    setLineValues(next, dir, i, res.out);
  }
  return { board: next, score, moved, plan };
}

// Compress + merge an indexed line (already oriented in travel direction).
function mergeLineIndexed(line) {
  const tiles = line.filter((t) => t.value !== 0);
  const out = [];
  let score = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
      out.push({ value: tiles[i].value * 2, srcs: [tiles[i].idx, tiles[i + 1].idx], merged: true });
      score += tiles[i].value * 2;
      i++;
    } else {
      out.push({ value: tiles[i].value, srcs: [tiles[i].idx], merged: false });
    }
  }
  const placed = [];
  let outIdx = 0;
  for (let k = 0; k < line.length; k++) {
    if (outIdx < out.length) {
      placed.push({ ...out[outIdx], to: line[k].idx });
      outIdx++;
    } else {
      placed.push({ value: 0, srcs: [], to: line[k].idx, merged: false });
    }
  }
  const moved = line.some((t, k) => t.value !== placed[k].value);
  return { out: placed, score, moved };
}

function setLineValues(board, dir, index, values) {
  const { rows, cols, cells } = board;
  for (let k = 0; k < values.length; k++) {
    cells[values[k].to] = values[k].value;
  }
}

export function emptyCells(board) {
  const out = [];
  board.cells.forEach((v, i) => {
    if (v === 0) out.push(i);
  });
  return out;
}

export function canMove(board) {
  const { rows, cols, cells } = board;
  if (cells.some((v) => v === 0)) return true;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (cells[r * cols + c] === cells[r * cols + c + 1]) return true;
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] === cells[(r + 1) * cols + c]) return true;
    }
  }
  return false;
}

export const isGameOver = (board) => !canMove(board);

// 90% chance of a 2, 10% of a 4.
export function randomTileValue(rng = Math.random) {
  return rng() < 0.9 ? 2 : 4;
}

// Spawn a new tile on a random empty cell. Returns null when board is full.
export function spawnRandom(board, rng = Math.random) {
  const empty = emptyCells(board);
  if (empty.length === 0) return null;
  const at = empty[Math.floor(rng() * empty.length)];
  const next = cloneBoard(board);
  next.cells[at] = randomTileValue(rng);
  return { board: next, index: at };
}

export function highestTile(board) {
  return board.cells.reduce((m, v) => Math.max(m, v), 0);
}

export function hasReached(board, target) {
  return highestTile(board) >= target;
}

// A full game session with score, undo history and end-of-game state.
export class Game {
  constructor({ rows = DEFAULT_ROWS, cols = DEFAULT_COLS, target = DEFAULT_TARGET, seed } = {}) {
    this.rows = rows;
    this.cols = cols;
    this.target = target;
    this.rng = seed !== undefined ? mulberry32(seed) : Math.random;
    this.board = createBoard(rows, cols);
    this.score = 0;
    this.best = 0;
    this.over = false;
    this.won = false;
    this.continued = false;
    this.history = [];
    this.lastMovePlan = [];
    this.lastSpawnIndex = null;
  }

  reset() {
    this.board = createBoard(this.rows, this.cols);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.continued = false;
    this.history = [];
    let b = this.board;
    b = spawnRandom(b, this.rng).board;
    b = spawnRandom(b, this.rng).board;
    this.board = b;
  }

  // Attempt a move. Returns true when the board actually moved.
  attemptMove(dir) {
    if (this.over || this.won) return false;
    const res = move(this.board, dir);
    if (!res.moved) return false;

    this.history.push({
      board: this.board.cells.slice(),
      score: this.score,
      won: this.won,
      continued: this.continued,
    });
    if (this.history.length > 50) this.history.shift();

    this.lastMovePlan = res.plan;
    this.board = res.board;
    this.score += res.score;
    if (this.score > this.best) this.best = this.score;

    if (!this.won && hasReached(this.board, this.target)) {
      this.won = true;
    }

    const spawned = spawnRandom(this.board, this.rng);
    if (spawned) {
      this.board = spawned.board;
      this.lastSpawnIndex = spawned.index;
    } else {
      this.lastSpawnIndex = null;
    }

    this.over = isGameOver(this.board);
    return true;
  }

  // User chose to keep playing after reaching the target tile.
  continueAfterWin() {
    this.continued = true;
    this.won = false;
  }

  undo() {
    const snap = this.history.pop();
    if (!snap) return false;
    this.board = { rows: this.rows, cols: this.cols, cells: snap.board.slice() };
    this.score = snap.score;
    this.won = snap.won;
    this.continued = snap.continued;
    this.over = isGameOver(this.board);
    this.lastMovePlan = [];
    this.lastSpawnIndex = null;
    return true;
  }

  canUndo() {
    return this.history.length > 0;
  }

  // Serializable snapshot for persistence.
  serialize() {
    return {
      rows: this.rows,
      cols: this.cols,
      target: this.target,
      cells: this.board.cells,
      score: this.score,
      best: this.best,
      over: this.over,
      won: this.won,
      continued: this.continued,
      history: this.history,
    };
  }

  static deserialize(data) {
    const g = new Game({
      rows: data.rows,
      cols: data.cols,
      target: data.target || DEFAULT_TARGET,
    });
    g.board = { rows: data.rows, cols: data.cols, cells: Array.isArray(data.cells) ? data.cells : [] };
    g.score = data.score || 0;
    g.best = data.best || 0;
    g.over = !!data.over;
    g.won = !!data.won;
    g.continued = !!data.continued;
    g.history = Array.isArray(data.history) ? data.history : [];
    return g;
  }
}