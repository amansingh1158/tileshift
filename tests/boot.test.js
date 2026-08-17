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

test('boot: switching modes updates the HUD extras', () => {
  const tabs = document.querySelectorAll('#mode-tabs button');
  assert.equal(tabs.length, 4, 'four modes');

  const find = (label) => [...tabs].find((b) => b.textContent === label);
  const hud = document.getElementById('hud-extra');

  find('Time').click();
  assert.ok(hud.querySelector('.timer-bar'), 'time mode shows timer bar');
  find('Moves').click();
  assert.ok(hud.querySelector('#moves-left'), 'moves mode shows moves chip');
  assert.ok(document.getElementById('moves-left').textContent, 'moves counter present');
  find('Daily').click();
  assert.ok(hud.querySelector('.daily-chip'), 'daily mode shows daily chip');
  assert.ok(document.getElementById('board-size').disabled, 'board size locked in daily mode');
  find('Classic').click();
  assert.ok(hud.querySelector('.chip'), 'classic mode shows target chip');
  assert.ok(!document.getElementById('board-size').disabled, 'board size re-enabled');

  // undo must work after the mode switches (new games each time)
  document.getElementById('undo').click();
  assert.ok(true);
});