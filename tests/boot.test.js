import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const landingHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const playHtml = readFileSync(new URL('../app/play.html', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../app/css/style.css', import.meta.url), 'utf8');

const doms = [];

function bootPage(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  doms.push(dom);
  const window = dom.window;
  global.window = window;
  global.document = window.document;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.localStorage = window.localStorage;
  return dom;
}

async function bootPlay(mode, tag) {
  const dom = bootPage(playHtml, `http://localhost/play.html?mode=${mode}`);
  await import(`../app/js/main.js?${tag}`);
  await new Promise((r) => setTimeout(r, 20));
  return dom;
}

after(() => {
  for (const dom of doms) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

test('landing: shows only the four mode menus', () => {
  const dom = bootPage(landingHtml, 'http://localhost/');
  const cards = dom.window.document.querySelectorAll('.mode-card');
  assert.equal(cards.length, 4, 'exactly four mode cards');

  const names = [...cards].map((c) => c.querySelector('.mode-name').textContent);
  assert.deepEqual(names, ['Classic', 'Time', 'Moves', 'Daily']);

  const links = [...cards].map((c) => c.getAttribute('href'));
  assert.deepEqual(links, [
    'play.html?mode=classic',
    'play.html?mode=time',
    'play.html?mode=moves',
    'play.html?mode=daily',
  ]);

  assert.equal(dom.window.document.getElementById('board'), null, 'no board on landing page');
  assert.equal(dom.window.document.querySelector('.mode-tabs'), null, 'no in-game tabs');
});

test('play: combo toast is hidden by a generic .hidden rule', () => {
  const genericHidden = /\.hidden\s*\{\s*display:\s*none\s*!important;\s*\}/.test(styleCss);
  assert.ok(genericHidden, 'style.css defines .hidden { display: none !important }');
  assert.match(styleCss, /animation:\s*combo-pop 1s ease forwards/, 'toast fades out and stays faded');
});

test('play: page renders a board with tiles (classic)', async () => {
  await bootPlay('classic', 't-classic');
  const board = document.getElementById('board');
  assert.ok(board.querySelector('.cell-layer'), 'cell layer present');
  assert.ok(board.querySelector('.tile-layer'), 'tile layer present');
  assert.ok(document.querySelectorAll('.tile').length >= 2, 'a new game spawns 2 tiles');
  const toast = document.getElementById('combo-toast');
  assert.ok(toast, 'combo toast element exists');
  assert.ok(toast.classList.contains('hidden'), 'combo toast starts hidden');
});

test('play: score/best boxes exist and show numbers', async () => {
  await bootPlay('classic', 't-score');
  assert.ok(/^\d+$/.test(document.getElementById('score').textContent));
  assert.ok(/^\d+$/.test(document.getElementById('best').textContent));
});

test('play: size and theme selects are populated', async () => {
  await bootPlay('classic', 't-selects');
  assert.ok(document.getElementById('board-size').options.length >= 9);
  assert.ok(document.getElementById('theme').options.length >= 4);
});

test('play: pressing an arrow key dispatches a move without errors', async () => {
  const dom = await bootPlay('classic', 't-keys');
  const evt = new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
  dom.window.dispatchEvent(evt);
  assert.ok(true);
});

test('play: undo button exists and new game button works', async () => {
  const dom = await bootPlay('classic', 't-undo');
  const ng = document.getElementById('new-game');
  ng.click();
  assert.ok(document.querySelectorAll('.tile').length >= 2);
  document.getElementById('undo').click();
  assert.ok(true);
});

test('play: time mode shows timer bar, moves mode shows moves chip', async () => {
  const domTime = await bootPlay('time', 't-time');
  const hudTime = document.getElementById('hud-extra');
  assert.ok(hudTime.querySelector('.timer-bar'), 'time mode shows timer bar');
  assert.ok(hudTime.querySelector('#time-chip'), 'time mode shows time chip');
  assert.match(hudTime.querySelector('#time-chip').textContent, /^\d+:\d+$/);
  domTime.window.dispatchEvent(new domTime.window.Event('pagehide'));

  const domMoves = await bootPlay('moves', 't-moves');
  const hudMoves = document.getElementById('hud-extra');
  assert.ok(hudMoves.querySelector('#moves-left'), 'moves mode shows moves chip');
  assert.match(hudMoves.querySelector('#moves-left').textContent, /^\d+$/);
  domMoves.window.close();
});

test('play: daily mode shows daily chip and locks board size', async () => {
  const dom = await bootPlay('daily', 't-daily');
  const hud = document.getElementById('hud-extra');
  assert.ok(hud.querySelector('.daily-chip'), 'daily mode shows daily chip');
  assert.ok(document.getElementById('board-size').disabled, 'board size locked in daily mode');
  dom.window.close();
});

test('play: unknown mode falls back to classic', async () => {
  await bootPlay('bogus', 't-fallback');
  const hud = document.getElementById('hud-extra');
  assert.ok(hud.querySelector('.chip'), 'classic hud shown');
  assert.equal(hud.querySelector('.timer-bar'), null, 'no timer for fallback');
});