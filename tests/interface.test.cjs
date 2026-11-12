'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('interface keeps a compact descriptive heading, not promotional banners', () => {
  assert.match(html, /<h1>Формулы трудовой теории стоимости<\/h1>/);
  for (const removed of ['ОТ ТЕКСТА — К ЧИСЛАМ', 'Прослеживайте связи', 'Меняйте условия.', 'ПО МАРКСУ И ЭНГЕЛЬСУ', 'тома-файла', 'edition-label', 'welcome-note']) {
    assert.ok(!html.includes(removed), `Removed decoration returned: ${removed}`);
  }
  assert.match(html, /Условия применимости/);
  assert.match(html, /Источники|источниках/);
});

test('all literal DOM IDs used by the application exist exactly once', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
  for (const match of app.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(ids.includes(match[1]), `Missing element: ${match[1]}`);
  }
});

test('all script and stylesheet dependencies are bundled locally', () => {
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
    const file = match[1];
    if (file.startsWith('data:')) continue;
    assert.ok(!/^(?:https?:)?\/\//.test(file), `Remote dependency: ${file}`);
    assert.ok(fs.existsSync(path.join(root, file)), `Missing dependency: ${file}`);
  }
});

test('footer does not send an already-running page to the launch instructions', () => {
  assert.doesNotMatch(html, /Инструкция по работе и запуску|href="README\.md"/);
  assert.match(html, /id="footer-about"/);
});
