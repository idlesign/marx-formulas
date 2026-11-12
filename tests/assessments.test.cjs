'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const stand = path.resolve(__dirname, '..');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(stand, 'catalog.js'), 'utf8'), context);
const catalog = context.FORMULA_CATALOG;
const byId = id => catalog.formulas.find(item => item.id === id);

test('all 101 formulas have a contextual explanation and explicit E0–E5 assessment', () => {
  assert.equal(catalog.formulas.length, 101);
  assert.equal(catalog.assessmentScale.length, 6);
  assert.match(catalog.assessmentMethod, /наиболее проблемному реально приведённому варианту/);
  for (const entry of catalog.formulas) {
    assert.ok(entry.context.length > 50, `${entry.id}: context`);
    assert.ok(entry.markdown.includes(`**Контекст:** ${entry.context}`), entry.id);
    const a = entry.assessment;
    assert.ok(Number.isInteger(a.level) && a.level >= 0 && a.level <= 5, entry.id);
    assert.ok(a.target.length > 5 && a.reason.length > 30, entry.id);
    assert.ok(entry.markdown.includes(`**Математическая сомнительность:** E${a.level}`), entry.id);
    assert.ok(entry.markdown.includes(`**Объект оценки:** ${a.target}`), entry.id);
    assert.ok(entry.markdown.includes(`**Основание оценки:** ${a.reason}`), entry.id);
  }
  assert.equal(new Set(catalog.formulas.map(entry => entry.context)).size, 101);
  assert.ok(catalog.translations.every(entry => !entry.assessment), 'Translation notes are not rated formulas');
});

test('ratings identify quoted opponents and local errors instead of blaming corrected formulas', () => {
  for (const id of ['F027', 'F028', 'F088', 'F100']) {
    assert.equal(byId(id).assessment.level, 5, id);
    assert.match(byId(id).assessment.target, /чуж|Смит|Прудон|критикуем|опровергаем/, id);
  }
  assert.equal(byId('F001').assessment.level, 0);
  assert.equal(byId('F063').assessment.level, 4);
  assert.match(byId('F007').assessment.reason, /цифровой копии/);
  assert.match(byId('F039').assessment.reason, /MEGA Text.*корректное/);
  assert.match(byId('F081').assessment.reason, /Происхождение.*не установлено/);
});

test('every nonzero rating has a visible attribution, explanation and formula-preview caption', () => {
  for (const entry of catalog.formulas) {
    const attribution = entry.assessment.attribution;
    if (entry.assessment.level > 0) assert.ok(attribution, `${entry.id}: an unqualified E rating is ambiguous`);
    if (!attribution) continue;
    for (const [field, label] of [
      ['label', 'Атрибуция оценки'],
      ['detail', 'Пояснение атрибуции'],
      ['preview', 'Подпись формулы в карточке'],
    ]) {
      assert.equal(typeof attribution[field], 'string', `${entry.id}: ${field}`);
      assert.ok(attribution[field].trim().length > 10, `${entry.id}: ${field} must identify what is rated`);
      assert.ok(entry.markdown.includes(`**${label}:** ${attribution[field]}`),
        `${entry.id}: ${field} must survive Markdown export`);
    }
  }
});

test('Engels reductio is distinguished from both his own arithmetic error and a literal opponent quotation', () => {
  for (const id of ['F027', 'F028']) {
    const a = byId(id).assessment;
    assert.equal(a.level, 5, id);
    assert.ok(a.attribution, id);
    assert.match(a.target, /опровергаем/, id);
    assert.match(a.attribution.label, /посылк|опровергаем|абсурд/i, id);
    assert.match(a.attribution.detail, /Энгельс/, id);
    assert.match(a.attribution.detail, /не[^.!?]*(?:ошиб|арифмет|расч[её]т)|(?:ошиб|арифмет|расч[её]т)[^.!?]*не/i, id);
    assert.match(a.attribution.preview, /опровергаем|абсурд|посылк/i, id);
  }
});

test('Smith and Proudhon errors do not label the correct displayed Marx formulas E5', () => {
  for (const [id, opponent] of [['F088', /Смит/], ['F100', /Прудон/]]) {
    const a = byId(id).assessment;
    assert.equal(a.level, 5, id);
    assert.ok(a.attribution, id);
    assert.match(a.attribution.label, opponent, id);
    assert.match(a.attribution.detail, /Маркс/, id);
    assert.match(a.attribution.detail + ' ' + a.attribution.preview, /E0/, id);
    assert.match(a.attribution.preview, /Маркс|исправл|верн|коррект/i, id);
  }
});

test('corrupted quotations are identified as source defects, not automatically as opponent mistakes', () => {
  for (const [id, opponent] of [['F032', /Сениор/], ['F058', /Вольф/], ['F070', /Шербюлье/]]) {
    const a = byId(id).assessment;
    assert.equal(a.level, 5, id);
    assert.ok(a.attribution, id);
    assert.match(a.attribution.label, /воспроизвед|дефект|вариант|текст|запис/i, id);
    assert.match(a.attribution.detail, opponent, id);
    assert.match(a.attribution.detail, /не\s|неизвест|неустанов|не установ|не доказ/i, id);
  }
});

test('other polemical and borrowed relations keep their specific attribution and existing rating', () => {
  for (const [id, level, author] of [
    ['F078', 0, /Прайс/],
    ['F089', 3, /Смит|Маркс/],
    ['F097', 0, /Кенэ/],
    ['F101', 3, /газет|стать/i],
  ]) {
    const a = byId(id).assessment;
    assert.equal(a.level, level, id);
    assert.ok(a.attribution, id);
    assert.match(`${a.attribution.label} ${a.attribution.detail}`, author, id);
  }
  const sequence = byId('F089').assessment.attribution;
  assert.match(`${sequence.detail} ${sequence.preview}`, /ряд|прогресси/i);
  assert.match(byId('F101').assessment.attribution.detail, /Маркс/);
  assert.equal(byId('F001').assessment.level, 0, 'An ordinary valid relation is not promoted to E5');
});

test('new evidence retains its distinct verification levels and correct arithmetic', () => {
  assert.match(byId('F007').markdown, /II\/2/);
  assert.match(byId('F036').markdown, /II\/3\.3/);
  assert.match(byId('F039').markdown, /II\/3\.2/);
  assert.match(byId('F045').markdown, /II\/3\.2/);
  assert.match(byId('F048').markdown, /306.*307/);
  assert.match(byId('F048').markdown, /8899/);
  assert.match(byId('F048').markdown, /8901/);
  assert.match(byId('F081').markdown, /III\/4/);
  assert.match(byId('F081').markdown, /реконструкц/);
  assert.match(byId('F040').markdown, /Grundrisse|1857–1858/);
  assert.match(byId('F046').markdown, /Gesammtcirculationszeit/);
  assert.match(byId('F078').markdown, /881/);
});
