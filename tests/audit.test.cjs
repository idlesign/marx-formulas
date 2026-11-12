'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'models-audit.js'), 'utf8'), context);
const models = context.LAB_MODELS;
const get = (id) => {
  const model = models.find((item) => item.id === id);
  assert.ok(model, id);
  return model;
};
const input = (id, overrides = {}) => ({
  ...Object.fromEntries(get(id).fields.map((field) => [field.key, field.value])), ...overrides
});
const result = (id, overrides = {}) => get(id).compute(input(id, overrides));
const metric = (output, key) => {
  const item = output.metrics.find((entry) => entry.key === key);
  assert.ok(item, key);
  return item.value;
};
const near = (actual, expected) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
};
const finite = (value) => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
};
const depreciation = 'audit-depreciation-repairs';
const rent = 'audit-rent-units';

test('audit models declare actual formula links, controls, presets and plot metrics', () => {
  assert.equal(models.length, 2);
  assert.deepEqual(Array.from(get(depreciation).formulaIds), ['F048']);
  assert.deepEqual(Array.from(get(rent).formulaIds), ['F081']);
  assert.equal(get(depreciation).group, 8);
  assert.equal(get(rent).group, 11);
  for (const model of models) {
    const output = result(model.id);
    assert.ok(output.metrics.length >= 2);
    assert.ok(model.presets.length > 0);
    assert.ok(model.fields.some((field) => field.key === model.plot.x));
    assert.ok(output.metrics.some((entry) => entry.key === model.plot.y));
    assert.equal(new Set(model.fields.map((field) => field.key)).size, model.fields.length);
    finite(output);
  }
});

test('F048 capitalizes first repair in the original-cost base, not residual balance', () => {
  const output = result(depreciation);
  near(metric(output, 'depreciation1'), 750);
  near(metric(output, 'balance1'), 9350);
  near(metric(output, 'base2'), 10100);
  near(metric(output, 'depreciation2'), 757.5);
  near(metric(output, 'beforeRepair2'), 8592.5);
  near(metric(output, 'balance2'), 8899);
  assert.notEqual(metric(output, 'depreciation2'), 9350 * 0.075);
});

test('F048 IA repair variant gives 8900 only after correcting the intermediate subtraction', () => {
  const output = result(depreciation, { repair2: 307.5 });
  near(metric(output, 'beforeRepair2'), 8592.5);
  near(metric(output, 'balance2'), 8900);
  const [russian, ia] = output.table.rows;
  assert.deepEqual(Array.from(russian.slice(1)), [306.5, 8593.5, 8592.5, 8900, 8900, 8899]);
  assert.deepEqual(Array.from(ia.slice(1)), [307.5, 8593.5, 8592.5, 8900, 8901, 8900]);
});

test('historical comparison stays fixed and is explicitly separate from parameterized computation', () => {
  const base = result(depreciation);
  const changed = result(depreciation, { initial: 2000, rate: 12, repair1: 20, repair2: 50 });
  assert.equal(JSON.stringify(base.table), JSON.stringify(changed.table));
  assert.ok(changed.notes.some((note) => note.includes('не меняется вместе с полями')));
  near(metric(changed, 'base2'), 2020);
  near(metric(changed, 'balance2'), 1587.6);
});

test('F048 exact linear term 13⅓ is explicitly conditional and not a reconstructed historical reading', () => {
  const output = result(depreciation);
  near(metric(output, 'linearYears'), 40 / 3);
  assert.ok(output.notes.some((note) => note.includes('без добавлений')));
  assert.ok(output.notes.some((note) => note.includes('не приписываются автору')));
});

test('F048 no-repair method uses the same original base twice', () => {
  const output = result(depreciation, { repair1: 0, repair2: 0 });
  near(metric(output, 'base2'), 10000);
  near(metric(output, 'depreciation2'), 750);
  near(metric(output, 'balance2'), 8500);
});

test('F048 zero rate and zero initial base make conditional term undefined', () => {
  for (const changes of [{ rate: 0 }, { initial: 0 }]) {
    const output = result(depreciation, changes);
    assert.equal(metric(output, 'linearYears'), null);
    assert.ok(output.warnings.length > 0);
    finite(output);
  }
  near(metric(result(depreciation, { rate: 0 }), 'balance2'), 10406.5);
});

test('F048 over-depreciation is warned about, not silently clipped', () => {
  const output = result(depreciation, { rate: 100, repair1: 0, repair2: 0 });
  near(metric(output, 'beforeRepair2'), -10000);
  near(metric(output, 'balance2'), -10000);
  assert.ok(output.warnings.some((warning) => warning.includes('превышает имеющийся баланс')));
});

test('F081 literal bushels and price per quarter require conversion before multiplying', () => {
  const output = result(rent);
  near(metric(output, 'literalRevenue0'), 17.5);
  near(metric(output, 'literalRevenue1'), 18.75);
  near(metric(output, 'literalRent0'), -112.5);
  near(metric(output, 'literalRent1'), -111.25);
  near(metric(output, 'literalChange'), 1.25);
  assert.ok(output.warnings.some((warning) => warning.includes('дефицит')));
});

test('F081 two explicit unit corrections reproduce 10→20 but remain distinct interpretations', () => {
  const output = result(rent);
  near(metric(output, 'alignedRent0'), 10);
  near(metric(output, 'alignedRent1'), 20);
  near(metric(output, 'alignedChange'), 10);
  const [, priceCorrection, yieldCorrection] = output.table.rows;
  assert.equal(priceCorrection[1], 'бушели');
  assert.equal(priceCorrection[2], 'шиллинги за бушель');
  assert.equal(yieldCorrection[1], 'квартеры');
  assert.equal(yieldCorrection[2], 'шиллинги за квартер');
  assert.deepEqual(Array.from(priceCorrection.slice(3)), Array.from(yieldCorrection.slice(3)));
  assert.ok(output.notes.some((note) => note.includes('Ни одна не выбрана')));
});

test('F081 worst land produces zero only after either explicit unit correction', () => {
  const output = result(rent, { yield0: 26, yield1: 26, price0: 5, price1: 5 });
  near(metric(output, 'literalRevenue1'), 16.25);
  near(metric(output, 'literalRent1'), -113.75);
  near(metric(output, 'alignedRent1'), 0);
});

test('F081 falling price without increased yield lowers both residuals', () => {
  const output = result(rent, { yield1: 20 });
  near(metric(output, 'literalChange'), -5);
  near(metric(output, 'alignedChange'), -40);
});

test('F081 fixed monetary costs are never divided by the grain conversion factor', () => {
  const output = result(rent, { yield0: 0, yield1: 0 });
  near(metric(output, 'literalRent0'), -130);
  near(metric(output, 'literalRent1'), -130);
  near(metric(output, 'alignedRent0'), -130);
  near(metric(output, 'alignedRent1'), -130);
});

for (const model of models) {
  test(`${model.id}: all presets and individual boundaries give finite outputs`, () => {
    for (const preset of model.presets) finite(result(model.id, preset.values));
    for (const field of model.fields) {
      for (const value of [field.min, field.max]) {
        const output = result(model.id, { [field.key]: value });
        finite(output);
        for (const entry of output.metrics) assert.ok(entry.value === null || Number.isFinite(entry.value));
      }
    }
    finite(model.compute(Object.fromEntries(model.fields.map((field) => [field.key, field.min]))));
    finite(model.compute(Object.fromEntries(model.fields.map((field) => [field.key, field.max]))));
  });

  test(`${model.id}: malformed and out-of-domain input is rejected, never normalized silently`, () => {
    for (const field of model.fields) {
      for (const value of [NaN, Infinity, -Infinity, undefined, '7', field.min - 1, field.max + 1]) {
        const output = result(model.id, { [field.key]: value });
        finite(output);
        assert.ok(output.warnings.length > 0);
        assert.ok(output.metrics.every((entry) => entry.value === null));
      }
    }
  });

  test(`${model.id}: compute is pure and source cautions remain explicit`, () => {
    const values = Object.freeze(input(model.id));
    const before = JSON.stringify(values);
    const first = model.compute(values);
    const second = model.compute(values);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(JSON.stringify(values), before);
    assert.ok(first.notes.some((note) => note.includes('OCR')));
    assert.ok(first.notes.some((note) => note.includes('аппарат')));
  });
}
