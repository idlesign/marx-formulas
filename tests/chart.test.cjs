'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const stand = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(stand, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(stand, 'app.js'), 'utf8');

// Only the DOM surface used by the laboratory; calculations and event handlers are real.
function laboratory(width = 700, definitions) {
  const ids = new Map();
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.listeners = new Map();
      this.style = {};
      this.dataset = {};
      this.value = '';
      this.className = '';
      this.clientWidth = width;
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
        remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
        toggle: (name, enabled) => {
          const present = enabled ?? !this.classList.contains(name);
          this.classList[present ? 'add' : 'remove'](name);
          return present;
        },
      };
    }
    set id(value) { ids.set(value, this); }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(''); }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelectorAll(selector) {
      return this.children.flatMap(child => {
        const matches = selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector;
        return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
      });
    }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) new Element('div').id = match[1];
  const document = {
    activeElement: null,
    getElementById: id => ids.get(id),
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
    addEventListener() {},
  };
  const context = {
    document, location: { hash: '' }, localStorage: { getItem: () => null },
    window: { addEventListener() {} }, setTimeout() {}, clearTimeout() {},
  };
  if (definitions) context.LAB_MODELS = definitions;
  else for (const file of ['models-foundations.js', 'models-advanced.js', 'models-audit.js', 'models-grundrisse.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(stand, file), 'utf8'), context, { filename: file });
  }
  // Source cards are unrelated to chart rendering; keep the fixture focused on the lab.
  context.FORMULA_CATALOG = {
    formulas: [], translations: [],
    groups: Array.from({ length: 14 }, (_, index) => ({ id: index + 1, title: `Тема ${index + 1}` })),
  };
  vm.runInNewContext(app, context, { filename: 'app.js' });
  return {
    models: context.LAB_MODELS,
    get: id => ids.get(id),
    change(id, value, event = 'change') {
      const node = ids.get(id);
      node.value = String(value);
      node.listeners.get(event)();
    },
  };
}

const axisLabel = item => `${item.label}${item.unit ? `, ${item.unit}` : ''}`;

for (const width of [260, 700]) {
  test(`all 41 models label both axes with names and units at chart width ${width}`, () => {
    const lab = laboratory(width);
    assert.equal(lab.models.length, 41);
    for (const model of lab.models) {
      lab.change('model-picker', model.id);
      const values = Object.fromEntries(model.fields.map(field => [field.key, field.value]));
      const field = model.fields.find(item => item.key === model.plot.x);
      const metric = model.compute(values).metrics.find(item => item.key === model.plot.y);
      const chart = lab.get('chart');
      assert.equal(chart.querySelectorAll('.chart-axis-x')[0].textContent, `${axisLabel(field)} →`, model.id);
      assert.equal(chart.querySelectorAll('.chart-axis-y')[0].textContent, `↑ ${axisLabel(metric)}`, model.id);
      const image = chart.querySelectorAll('svg')[0];
      assert.ok(image.attributes['aria-label'].includes(`Ось X: ${axisLabel(field)}.`), model.id);
      assert.ok(image.attributes['aria-label'].includes(`Ось Y: ${axisLabel(metric)}.`), model.id);
      assert.equal(chart.querySelectorAll('.axis-line').length, 1, model.id);
    }
  });
}

test('changing either axis updates its label without leaving stale titles', () => {
  const lab = laboratory();
  const model = lab.models[0];
  lab.change('model-picker', model.id);
  const field = model.fields.find(item => item.key !== model.plot.x);
  const values = Object.fromEntries(model.fields.map(item => [item.key, item.value]));
  const metric = model.compute(values).metrics.find(item => item.key !== model.plot.y);
  lab.change('chart-x', field.key);
  lab.change('chart-y', metric.key);
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-x').length, 1);
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-y').length, 1);
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-x')[0].textContent, `${axisLabel(field)} →`);
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-y')[0].textContent, `↑ ${axisLabel(metric)}`);
  lab.change(`input-${field.key}`, '', 'input');
  assert.equal(lab.get('chart').children.length, 0, 'Invalid inputs must also clear axis labels');
});

test('unitless axes have no trailing comma and undefined results clear the graph', () => {
  const model = {
    id: 'unitless', group: 1, title: 'Безразмерные величины', description: '', formula: '', formulaIds: [], presets: [],
    fields: [{ key: 'x', label: 'Коэффициент', unit: '', value: 1, min: 0, max: 2, step: 0.1 }],
    plot: { x: 'x', y: 'ratio' },
    compute: () => ({ metrics: [{ key: 'ratio', label: 'Отношение', unit: '', value: 1 }] }),
  };
  const lab = laboratory(260, [model]);
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-x')[0].textContent, 'Коэффициент →');
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-y')[0].textContent, '↑ Отношение');
  model.compute = () => ({ metrics: [{ key: 'ratio', label: 'Отношение', unit: '', value: null }] });
  lab.change('chart-y', 'ratio');
  assert.equal(lab.get('chart').querySelectorAll('.chart-axis-title').length, 0);
  assert.equal(lab.get('chart').querySelectorAll('svg').length, 0);
});
