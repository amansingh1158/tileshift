// DOM board view: renders the grid, animates slides/merges/spawns,
// and handles layout maths. Zero game logic here — it only reads the engine.

const PAD = 8;
const MOVE_MS = 140;

export const THEMES = {
  tileshift: {
    label: 'TileShift',
    body: { bg: '#0f172a', text: '#e2e8f0', muted: '#94a3b8' },
    boardBg: '#1e293b',
    emptyCell: '#334155',
    palette: {
      2: '#0e7490', 4: '#0d9488', 8: '#0891b2', 16: '#06b6d4',
      32: '#22d3ee', 64: '#38bdf8', 128: '#818cf8', 256: '#a78bfa',
      512: '#c084fc', 1024: '#e879f9', 2048: '#fbbf24',
    },
    textMap: { 32: '#083344', 64: '#082f49', 2048: '#78350f' },
  },
  classic: {
    label: 'Retro',
    body: { bg: '#faf8ef', text: '#776e65', muted: '#8f8781' },
    boardBg: '#bbada0',
    emptyCell: '#cdc1b4',
    palette: {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
    },
    textMap: { 2: '#776e65', 4: '#776e65' },
  },
  dark: {
    label: 'Dark',
    body: { bg: '#191922', text: '#e8e6f0', muted: '#8a8794' },
    boardBg: '#38353f',
    emptyCell: '#4a4654',
    palette: {
      2: '#55515f', 4: '#635f6e', 8: '#8c6f4a', 16: '#9a5c3f',
      32: '#a84f35', 64: '#b23f2e', 128: '#b79a3d', 256: '#c4a52c',
      512: '#cfae1e', 1024: '#d8b41a', 2048: '#e0bd14',
    },
    textMap: {},
  },
  ocean: {
    label: 'Ocean',
    body: { bg: '#eef6fb', text: '#1f4e66', muted: '#5b7f92' },
    boardBg: '#a8c6d8',
    emptyCell: '#c4dceb',
    palette: {
      2: '#e0f2fb', 4: '#c8e8f7', 8: '#9fd6ef', 16: '#71c2e6',
      32: '#4aaadb', 64: '#2c94cd', 128: '#63c3a5', 256: '#4fb795',
      512: '#3ca985', 1024: '#2f9a7a', 2048: '#1f8c6f',
    },
    textMap: { 2: '#1f4e66', 4: '#1f4e66' },
  },
  candy: {
    label: 'Candy',
    body: { bg: '#fff5f7', text: '#7c4a5a', muted: '#b08797' },
    boardBg: '#e8b9c4',
    emptyCell: '#f5d7de',
    palette: {
      2: '#ffe8ee', 4: '#ffd3de', 8: '#f9b8c6', 16: '#f29baa',
      32: '#ea7e90', 64: '#e0637a', 128: '#f4c07a', 256: '#f0b25e',
      512: '#eba44a', 1024: '#e5943c', 2048: '#df852e',
    },
    textMap: { 2: '#7c4a5a', 4: '#7c4a5a' },
  },
};

function applyThemeCss(name) {
  const t = THEMES[name] || THEMES.classic;
  const root = document.documentElement;
  root.style.setProperty('--bg', t.body.bg);
  root.style.setProperty('--text', t.body.text);
  root.style.setProperty('--muted', t.body.muted);
  root.style.setProperty('--board-bg', t.boardBg);
  root.style.setProperty('--cell-bg', t.emptyCell);
}

export class BoardView {
  constructor(rootEl) {
    this.root = rootEl;
    this.theme = 'tileshift';
    this.rows = 4;
    this.cols = 4;
    this.size = 0;
    this.gap = 0;
    this.tiles = new Map(); // cellIndex -> tile element

    this.cellLayer = document.createElement('div');
    this.cellLayer.className = 'cell-layer';
    this.tileLayer = document.createElement('div');
    this.tileLayer.className = 'tile-layer';
    this.root.append(this.cellLayer, this.tileLayer);

    this._buildCells();
    this._layout();

    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(rootEl);
  }

  setTheme(name) {
    this.theme = name;
    applyThemeCss(name);
  }

  setSize(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.tiles.clear();
    this.tileLayer.innerHTML = '';
    this._buildCells();
    this._layout();
  }

  _buildCells() {
    this.cellLayer.innerHTML = '';
    this.cellLayer.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
    this.cellLayer.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.rows * this.cols; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      frag.appendChild(c);
    }
    this.cellLayer.appendChild(frag);
  }

  _layout() {
    const w = this.root.clientWidth;
    if (!w) return;
    this.gap = Math.max(4, Math.round(w * 0.012));
    this.size = (w - 2 * PAD - (this.cols - 1) * this.gap) / this.cols;
    const h = 2 * PAD + this.rows * this.size + (this.rows - 1) * this.gap;
    this.root.style.height = `${h}px`;
    this.cellLayer.style.gap = `${this.gap}px`;
    this.cellLayer.style.padding = `${PAD}px`;
    for (const [idx, t] of this.tiles) {
      t.el.style.width = `${this.size}px`;
      t.el.style.height = `${this.size}px`;
      t.el.style.transform = this._transform(idx);
      this._setFont(t.el, t.value);
    }
  }

  _pos(idx) {
    const r = Math.floor(idx / this.cols);
    const c = idx % this.cols;
    return { x: PAD + c * (this.size + this.gap), y: PAD + r * (this.size + this.gap) };
  }

  _transform(idx) {
    const { x, y } = this._pos(idx);
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  _tileColor(value) {
    const t = THEMES[this.theme] || THEMES.classic;
    return value > 2048 ? '#3c3a32' : t.palette[value] || '#3c3a32';
  }

  _tileTextColor(value) {
    const t = THEMES[this.theme] || THEMES.classic;
    return t.textMap[value] || '#ffffff';
  }

  _setFont(el, value) {
    const digits = String(value).length;
    const divisor = digits <= 2 ? 3 : digits === 3 ? 3.05 : digits === 4 ? 3.45 : digits === 5 ? 3.9 : 4.4;
    el._inner.style.fontSize = `${Math.max(12, this.size / divisor).toFixed(1)}px`;
  }

  _createTile(value, idx, spawn = false) {
    const el = document.createElement('div');
    el.className = 'tile';
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    el._inner = inner;
    el.style.width = `${this.size}px`;
    el.style.height = `${this.size}px`;
    el.style.transform = this._transform(idx);
    this._styleTile(el, value);
    if (spawn) inner.classList.add('tile-spawn');
    el.appendChild(inner);
    return el;
  }

  _styleTile(el, value) {
    const inner = el._inner;
    inner.textContent = value;
    inner.style.backgroundColor = this._tileColor(value);
    inner.style.color = this._tileTextColor(value);
    this._setFont(el, value);
  }

  // Full, immediate re-render from engine state (init, new game, undo, resize).
  render(game, { spawnAll = false } = {}) {
    this.tileLayer.innerHTML = '';
    this.tiles.clear();
    const frag = document.createDocumentFragment();
    game.board.cells.forEach((value, idx) => {
      if (value === 0) return;
      const el = this._createTile(value, idx, spawnAll);
      frag.appendChild(el);
      this.tiles.set(idx, { el, value });
    });
    this.tileLayer.appendChild(frag);
  }

  // Incremental render driven by the engine's move plan + spawn index.
  applyMove(game, spawnIndex) {
    const plan = game.lastMovePlan || [];
    for (const p of plan) {
      if (p.merged) {
        // Surviving tile: move to the merge cell, inherit the doubled value, pop.
        const survivor = this.tiles.get(p.survivor);
        if (survivor) {
          survivor.el.style.transform = this._transform(p.to);
          survivor.value = p.value;
          this._styleTile(survivor.el, p.value);
          const inner = survivor.el._inner;
          inner.classList.remove('tile-spawn');
          inner.classList.remove('tile-merge');
          void inner.offsetWidth; // restart CSS animation
          inner.classList.add('tile-merge');
          this.tiles.delete(p.survivor);
          this.tiles.set(p.to, survivor);
        }
        // Consumed tile: slide into the merge cell, then disappear.
        const consumed = this.tiles.get(p.from);
        if (consumed) {
          consumed.el.style.transform = this._transform(p.to);
          const consumedEl = consumed.el;
          setTimeout(() => consumedEl.remove(), MOVE_MS + 40);
          this.tiles.delete(p.from);
        }
        continue;
      }
      const rec = this.tiles.get(p.from);
      if (!rec) continue;
      rec.el.style.transform = this._transform(p.to);
      this.tiles.delete(p.from);
      this.tiles.set(p.to, { el: rec.el, value: p.value });
    }

    // Safety pass: drop any tiles whose cells are now empty.
    for (const [idx, rec] of [...this.tiles]) {
      if (game.board.cells[idx] === 0) {
        rec.el.remove();
        this.tiles.delete(idx);
      }
    }

    if (spawnIndex != null && game.board.cells[spawnIndex] !== 0) {
      const el = this._createTile(game.board.cells[spawnIndex], spawnIndex, true);
      this.tileLayer.appendChild(el);
      this.tiles.set(spawnIndex, { el, value: game.board.cells[spawnIndex] });
    }
  }
}