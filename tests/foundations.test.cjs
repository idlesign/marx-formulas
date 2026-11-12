'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'models-foundations.js'), 'utf8'), context);
const models = context.LAB_MODELS;
const get = (id) => {
  const model = models.find((entry) => entry.id === id);
  assert.ok(model, `Unknown model: ${id}`);
  return model;
};
const inputs = (id, overrides = {}) => Object.assign(
  Object.fromEntries(get(id).fields.map((field) => [field.key, field.value])), overrides
);
const calculate = (id, overrides = {}) => get(id).compute(inputs(id, overrides));
const metric = (result, key) => {
  const item = result.metrics.find((entry) => entry.key === key);
  assert.ok(item, `Missing metric: ${key}`);
  return item.value;
};
const near = (actual, expected, tolerance = 1e-9) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`);
};
const noNonFinite = (value, trail = '') => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Non-finite output at ${trail}`);
  else if (Array.isArray(value)) value.forEach((item, index) => noNonFinite(item, `${trail}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => noNonFinite(item, `${trail}.${key}`));
};
const verifyResult = (result) => {
  noNonFinite(result);
  assert.ok(result.metrics.length >= 2);
  result.metrics.forEach((entry) => assert.ok(entry.value === null || Number.isFinite(entry.value)));
  (result.bars || []).forEach((entry) => assert.ok(entry.value >= 0));
};

test('20 standalone models, complete fields, plot keys, presets and F001–F053 coverage', () => {
  assert.equal(models.length, 20);
  assert.equal(new Set(models.map((model) => model.id)).size, models.length);
  const covered = new Set();
  for (const model of models) {
    assert.ok(model.group >= 1 && model.group <= 8);
    assert.ok(model.title && model.description && model.formula);
    assert.ok(model.formulaIds.length > 0);
    for (const id of [...model.formulaIds, ...model.relatedIds]) {
      assert.match(id, /^F\d{3}$/);
      assert.ok(Number(id.slice(1)) >= 1 && Number(id.slice(1)) <= 53);
      covered.add(id);
    }
    for (const field of model.fields) {
      assert.ok(field.key && field.label && field.symbol && field.unit && field.hint);
      assert.ok(Number.isFinite(field.value) && field.value >= field.min && field.value <= field.max);
      assert.ok(field.min < field.max && field.step > 0);
    }
    assert.ok(model.fields.some((field) => field.key === model.plot.x));
    assert.ok(calculate(model.id).metrics.some((entry) => entry.key === model.plot.y));
    assert.ok(model.presets.length >= 1);
    for (const preset of model.presets) {
      assert.ok(preset.label);
      assert.ok(Object.keys(preset.values).every((key) => model.fields.some((field) => field.key === key)));
      verifyResult(calculate(model.id, preset.values));
    }
  }
  for (let number = 1; number <= 53; number += 1) assert.ok(covered.has(`F${String(number).padStart(3, '0')}`));
});

test('defaults, endpoint combinations and invalid fields never emit NaN or Infinity and never mutate inputs', () => {
  for (const model of models) {
    const variants = [inputs(model.id)];
    for (const bound of ['min', 'max']) {
      variants.push(Object.fromEntries(model.fields.map((f) => [f.key, f[bound]])));
      for (const field of model.fields) variants.push(inputs(model.id, { [field.key]: field[bound] }));
    }
    for (const p of variants) {
      const snapshot = JSON.stringify(p);
      Object.freeze(p);
      verifyResult(model.compute(p));
      assert.equal(JSON.stringify(p), snapshot);
    }
    for (const invalid of [NaN, Infinity, -Infinity, undefined, '12']) {
      const result = calculate(model.id, { [model.fields[0].key]: invalid });
      verifyResult(result);
      assert.ok(result.warnings.length > 0);
      assert.ok(result.metrics.every((entry) => entry.value === null));
    }
  }
});

test('productivity changes added value per unit, not total new value; complexity multiplies hours', () => {
  const base = calculate('labor-productivity');
  near(metric(base, 'simple'), 12);
  near(metric(base, 'fresh'), 6);
  near(metric(base, 'unit'), 0.5);
  const double = calculate('labor-productivity', { output: 24, material: 2 });
  near(metric(double, 'fresh'), 6);
  near(metric(double, 'unit'), 2.25);
  near(metric(calculate('labor-productivity', { hours: 8, complexity: 3, lambda: 1 }), 'simple'), 24);
  assert.equal(metric(calculate('labor-productivity', { output: 0 }), 'unit'), null);
  assert.equal(metric(calculate('labor-productivity', { hours: 0 }), 'productivity'), null);
});

test('relative value has the four change cases and zero-denominator protection', () => {
  near(metric(calculate('relative-value'), 'old'), 1);
  for (const [factorA, factorB, expected] of [[2, 1, 2], [1, 2, 0.5], [2, 2, 1], [3, 2, 1.5]]) {
    near(metric(calculate('relative-value', { factorA, factorB }), 'next'), expected);
  }
  assert.equal(metric(calculate('relative-value', { valueB: 0 }), 'old'), null);
  assert.equal(metric(calculate('relative-value', { factorB: 0 }), 'next'), null);
  assert.equal(metric(calculate('relative-value', { valueA: 0 }), 'relativeFactor'), null);
});

test('composite equivalent exposes 5/6 and corrects the calico coefficient to 3/2', () => {
  const incorrect = calculate('composite-equivalent');
  near(metric(incorrect, 'equivalent'), 5 / 6);
  near(metric(incorrect, 'gap'), -1 / 6);
  near(metric(incorrect, 'requiredCotton'), 1.5);
  assert.ok(incorrect.warnings.length > 0);
  const correct = calculate('composite-equivalent', { cotton: 1.5 });
  near(metric(correct, 'equivalent'), 1);
  assert.equal(correct.warnings.length, 0);
  const excessive = calculate('composite-equivalent', { tea: 2 });
  assert.ok(metric(excessive, 'requiredCotton') < 0);
});

test('money supply calculation is sum of prices over turnovers', () => {
  near(metric(calculate('money-circulation'), 'sales'), 8);
  near(metric(calculate('money-circulation'), 'money'), 2);
  near(metric(calculate('money-circulation', { velocity: 8 }), 'money'), 1);
  assert.equal(metric(calculate('money-circulation', { velocity: 0 }), 'money'), null);
  near(metric(calculate('money-circulation', { quantityA: 0, quantityB: 0 }), 'money'), 0);
});

test('paper emission ×15 divides gold per sign by 15 and multiplies prices by 15', () => {
  const result = calculate('paper-signs');
  near(metric(result, 'gold0'), 1);
  near(metric(result, 'gold1'), 1 / 15);
  near(metric(result, 'factor'), 15);
  near(metric(result, 'price'), 15);
  assert.equal(metric(calculate('paper-signs', { notes0: 0 }), 'price'), null);
  assert.equal(metric(calculate('paper-signs', { notes1: 0 }), 'gold1'), null);
  assert.equal(metric(calculate('paper-signs', { gold: 0 }), 'price'), null);
});

test('metal parity distinguishes mass and value ratios', () => {
  const result = calculate('metal-ratio');
  near(metric(result, 'valueRatio'), 1 / 17.5);
  near(metric(result, 'marketSilver'), 17.5);
  near(metric(result, 'legalSilver'), 15.5);
  near(metric(result, 'gap'), 2);
  assert.equal(metric(calculate('metal-ratio', { market: 0 }), 'valueRatio'), null);
});

test('capital circuit conserves money between reinvestment and consumption', () => {
  for (const accumulation of [0, 25, 50, 100]) {
    const result = calculate('capital-circuit', { accumulation });
    near(metric(result, 'advance'), 500);
    near(metric(result, 'returned'), 590);
    near(metric(result, 'next'), 500 + 90 * accumulation / 100);
    near(metric(result, 'next') + metric(result, 'consumption'), metric(result, 'returned'));
    assert.ok(result.flow.length >= 5);
  }
  near(metric(calculate('capital-circuit', { surplus: 0 }), 'returned'), 500);
});

test('annualized basket and partial price reduction use common value units', () => {
  const result = calculate('labor-basket');
  near(metric(result, 'annual'), 1133);
  near(metric(result, 'daily'), 1133 / 365);
  near(metric(result, 'reduction'), 15);
  near(metric(result, 'newDaily'), (1133 / 365) * 0.85);
  near(metric(calculate('labor-basket', { share: 100, priceFall: 100 }), 'newDaily'), 0);
});

test('wage forms convert shillings to pence and retain different denominators', () => {
  const result = calculate('wage-forms');
  near(metric(result, 'hourlyPence'), 3);
  near(metric(result, 'piecePence'), 1.5);
  near(metric(result, 'wage'), 3);
  near(metric(result, 'real'), 1);
  near(metric(result, 'relative'), 1);
  near(metric(calculate('wage-forms', { normalOutput: 48 }), 'piecePence'), 0.75);
  near(metric(calculate('wage-forms', { actualHours: 6 }), 'wage'), 1.5);
  assert.equal(metric(calculate('wage-forms', { normalHours: 0 }), 'wage'), null);
  assert.equal(metric(calculate('wage-forms', { normalOutput: 0 }), 'piecePence'), null);
  assert.equal(metric(calculate('wage-forms', { basketPrice: 0 }), 'real'), null);
  assert.equal(metric(calculate('wage-forms', { surplus: 0 }), 'relative'), null);
});

test('shortening lifetime 30 to 10 years triples the daily requirement', () => {
  const result = calculate('labor-lifetime');
  near(metric(result, 'oldDaily'), 1);
  near(metric(result, 'newDaily'), 3);
  near(metric(result, 'shortfall'), 200 / 3);
  assert.equal(metric(calculate('labor-lifetime', { years1: 0 }), 'newDaily'), null);
  assert.equal(metric(calculate('labor-lifetime', { lifetimeValue: 0 }), 'shortfall'), null);
});

test('product decomposition is conserved; negative residual is not hidden in bars', () => {
  const result = calculate('product-components');
  near(metric(result, 'value'), 30);
  near(metric(result, 'cost'), 27);
  near(metric(result, 'fresh'), 6);
  near(metric(result, 'constantShare'), 16);
  near(metric(result, 'variableShare'), 2);
  near(metric(result, 'surplusShare'), 2);
  const noCapital = calculate('product-components', { constant: 0 });
  near(metric(noCapital, 'value'), 6);
  const zero = calculate('product-components', { constant: 0, variable: 0, surplus: 0 });
  assert.equal(metric(zero, 'constantShare'), null);
  const loss = calculate('product-components', { surplus: -4 });
  near(metric(loss, 'fresh'), -1);
  assert.equal(loss.bars.length, 0);
  assert.ok(loss.warnings.length > 0);
});

test('normal waste transfers its cost; unit profit falls at fixed total profit', () => {
  const result = calculate('waste-and-unit-profit');
  near(metric(result, 'transferred'), 115);
  near(metric(result, 'unitRaw'), 1.15);
  near(metric(result, 'waste'), 15);
  near(metric(result, 'unitProfit'), 1);
  near(metric(calculate('waste-and-unit-profit', { output: 10000, raw: 10000 }), 'unitProfit'), 0.01);
  assert.equal(metric(calculate('waste-and-unit-profit', { output: 0 }), 'unitProfit'), null);
  near(metric(calculate('waste-and-unit-profit', { totalProfit: -100 }), 'unitProfit'), -1);
});

test('working-day rates are 100% versus 50%, masses include monetary capital', () => {
  const result = calculate('working-day');
  near(metric(result, 'wage'), 3);
  near(metric(result, 'surplus'), 3);
  near(metric(result, 'rate'), 100);
  near(metric(result, 'share'), 50);
  near(metric(result, 'mass'), 300);
  near(metric(result, 'variableTotal'), 300);
  const shortenedNecessary = calculate('working-day', { necessary: 4 });
  near(metric(shortenedNecessary, 'wage') + metric(shortenedNecessary, 'surplus'), 6);
  near(metric(shortenedNecessary, 'rate'), 200);
  const deficit = calculate('working-day', { hours: 4, necessary: 6 });
  near(metric(deficit, 'surplus'), -1);
  assert.equal(deficit.bars.length, 0);
  assert.ok(deficit.warnings.length > 0);
  assert.equal(metric(calculate('working-day', { necessary: 0 }), 'rate'), null);
  assert.equal(metric(calculate('working-day', { lambda: 0 }), 'rate'), null);
  assert.equal(metric(calculate('working-day', { hours: 0 }), 'share'), null);
});

test('yarn denominator error gives 18/25 instead of 3/5; corrected ratio is 12/7', () => {
  const first = calculate('unit-surplus-error');
  const second = calculate('unit-surplus-error', { surplus: 8, output: 5600 / 3 });
  near(metric(first, 'freshUnit'), 18 / 5);
  near(metric(first, 'correct'), 3 / 5);
  near(metric(first, 'wrong'), 18 / 25);
  near(metric(first, 'recovered'), 4);
  near(metric(second, 'correct'), 36 / 35);
  near(metric(second, 'wrong'), 36 / 25);
  near(metric(second, 'correct') / metric(first, 'correct'), 12 / 7);
  near(metric(second, 'recovered'), 8);
  assert.equal(metric(calculate('unit-surplus-error', { variable: 0 }), 'wrong'), null);
  assert.equal(metric(calculate('unit-surplus-error', { output: 0 }), 'correct'), null);
});

test('extra surplus reproduces the 24 × 10-pence example and preserves negative differences', () => {
  const result = calculate('extra-surplus');
  near(metric(result, 'revenue'), 20);
  near(metric(result, 'fresh'), 8);
  near(metric(result, 'surplus'), 3);
  near(metric(result, 'baseline'), 1);
  near(metric(result, 'extra'), 2);
  near(metric(calculate('extra-surplus', { price: 12 }), 'extra'), 6);
  const lower = calculate('extra-surplus', { price: 8 });
  near(metric(lower, 'extra'), -2);
  assert.ok(lower.warnings.length > 0);
});

test('machine criteria allow ΔW < 0 with Δk = 0 and calculate the corrected table rate', () => {
  const result = calculate('machine-criteria');
  near(metric(result, 'value0'), 22);
  near(metric(result, 'value1'), 21);
  near(metric(result, 'valueChange'), -1);
  near(metric(result, 'costChange'), 0);
  const table = calculate('machine-criteria', get('machine-criteria').presets[1].values);
  near(metric(table, 'rate0'), 100 * 150 / 650);
  near(metric(table, 'rate1'), 24 + 6 / 31);
  const zero = calculate('machine-criteria', { wear0: 0, raw: 0, wage0: 0 });
  assert.equal(metric(zero, 'rate0'), null);
});

test('turnover distinguishes the annual rate to v from the rate to K', () => {
  const result = calculate('turnover-year');
  near(metric(result, 'count'), 10);
  near(metric(result, 'initial'), 800);
  near(metric(result, 'extra'), 200);
  near(metric(result, 'capital'), 1000);
  near(metric(result, 'annualMass'), 5000);
  near(metric(result, 'annualRate'), 1000);
  near(metric(result, 'annualProfitRate'), 500);
  const fraction = calculate('turnover-year', get('turnover-year').presets[1].values);
  near(metric(fraction, 'count'), 10 / 11);
  near(metric(fraction, 'annualRate'), 1000 / 11);
  assert.equal(metric(calculate('turnover-year', { production: 0, circulation: 0 }), 'annualMass'), null);
  assert.equal(metric(calculate('turnover-year', { variable: 0 }), 'annualRate'), null);
  assert.equal(metric(calculate('turnover-year', { variable: 2000 }), 'annualProfitRate'), null);
});

test('heterogeneous turnover uses value weights and separates depreciation methods', () => {
  const result = calculate('depreciation-turnover');
  near(metric(result, 'wear'), 8000);
  near(metric(result, 'flow'), 108000);
  near(metric(result, 'average'), 1.08);
  near(metric(result, 'linearResidual'), 64000);
  near(metric(result, 'decliningResidual'), 64800);
  const letter = calculate('depreciation-turnover', get('depreciation-turnover').presets[1].values);
  near(metric(letter, 'linearResidual'), 800);
  near(metric(letter, 'decliningResidual'), 810);
  assert.equal(metric(calculate('depreciation-turnover', { fixed: 0, circulating: 0 }), 'average'), null);
  assert.equal(metric(calculate('depreciation-turnover', { elapsed: 11 }), 'linearResidual'), null);
});

test('sinking fund uses end-of-year deposits and correctly handles zero interest and zero years', () => {
  const result = calculate('sinking-fund');
  near(metric(result, 'fund'), 100 * (1.05 ** 10 - 1) / 0.05);
  near(metric(result, 'fund'), 1257.789253554883);
  near(metric(result, 'sourceError'), 1257.789253554883 - 1252.55);
  near(metric(calculate('sinking-fund', { interest: 0 }), 'fund'), 1000);
  near(metric(calculate('sinking-fund', { years: 0 }), 'fund'), 0);
  assert.equal(metric(calculate('sinking-fund', { years: 1.5 }), 'fund'), null);
  assert.equal(metric(result, 'fund'), metric(result, 'deposits') + metric(result, 'interestIncome'));
});

test('physical park expands while residual value remains constant; first cohort retires at L', () => {
  const result = calculate('physical-expansion');
  near(metric(result, 'gross'), 1000 * 1.1 ** 10);
  near(metric(result, 'active'), 1000 * 1.1 ** 10 - 1000);
  near(metric(result, 'residual'), 1000);
  near(metric(result, 'average'), 1000 * (1.1 ** 10 - 1));
  near(metric(result, 'retired'), 1000);
  for (const years of [0, 1, 5, 9, 10]) {
    const scenario = calculate('physical-expansion', { years });
    near(metric(scenario, 'residual'), 1000);
    near(metric(scenario, 'active'), 1000 * 1.1 ** years - (years === 10 ? 1000 : 0));
  }
  assert.equal(metric(calculate('physical-expansion', { years: 0 }), 'average'), null);
  assert.equal(metric(calculate('physical-expansion', { years: 11 }), 'active'), null);
  assert.equal(metric(calculate('physical-expansion', { years: 1.5 }), 'active'), null);
  near(metric(calculate('physical-expansion', { initial: 0 }), 'residual'), 0);
});
