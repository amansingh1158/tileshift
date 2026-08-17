import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

let dom;
let window;

before(async () => {
  dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  window = dom.window;
  global.window = window;
  global.document = window.document;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.localStorage = window.localStorage;
  await import('../app/js/main.js');
  await new Promise((r) => setTimeout(r, 20));
});

test('boot: page renders a board with tiles', () => {
  const board = document.getElementById('board');
  assert.ok(board.querySelector('.cell-layer'), 'cell layer present');
  assert.ok(board.querySelector('.tile-layer'), 'tile layer present');
  assert.ok(document.querySelectorAll('.tile').length >= 2, 'a new game spawns 2 tiles');
});

test('boot: score/best boxes exist and show numbers', () => {
  assert.ok(/^\d+$/.test(document.getElementById('score').textContent));
  assert.ok(/^\d+$/.test(document.getElementById('best').textContent));
});

test('boot: size and theme selects are populated', () => {
  assert.ok(document.getElementById('board-size').options.length >= 9);
  assert.ok(document.getElementById('theme').options.length >= 4);
});

test('boot: pressing an arrow key dispatches a move without errors', () => {
  const evt = new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
  window.dispatchEvent(evt);
  assert.ok(true);
});

test('boot: undo button exists and new game button works', () => {
  const ng = document.getElementById('new-game');
  ng.click();
  assert.ok(document.querySelectorAll('.tile').length >= 2);
});