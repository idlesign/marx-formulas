const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '..', 'models-grundrisse.js');
const context = {};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
const [model] = context.LAB_MODELS;
const defaults = Object.fromEntries(model.fields.map(field => [field.key, field.value]));
const run = overrides => model.compute({ ...defaults, ...overrides });
const values = result => Object.fromEntries(result.metrics.map(metric => [metric.key, metric.value]));
const near = (actual, expected) => {
  assert.equal(typeof actual, 'number');
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
};
const check = (overrides, expected) => {
  const result = run(overrides), actual = values(result);
  for (const [key, value] of Object.entries(expected)) {
    if (value === null) assert.equal(actual[key], null, key);
    else near(actual[key], value);
  }
  return result;
};
function finiteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree);
}

test('Grundrisse is a standalone classic model script with shared contract', () => {
  assert.deepEqual(Object.keys(context), ['LAB_MODELS']);
  assert.equal(context.LAB_MODELS.length, 1);
  assert.equal(model.id, 'grundrisse-productivity-surplus');
  assert.equal(model.group, 6);
  assert.ok(model.formulaIds.includes('F040'));
  assert.ok(model.fields.some(field => field.key === model.plot.x));
  assert.ok(run().metrics.some(metric => metric.key === model.plot.y));
  assert.equal(new Set(run().metrics.map(metric => metric.key)).size, run().metrics.length);
  assert.equal(model.presets.length, 4);
});

test('half-day source example raises surplus from one half to three quarters, not twice', () => {
  const result = check({}, { newNecessary: 2, initialSurplusHours: 4, newSurplusHours: 6, initialSurplus: 4, newSurplus: 6, newVariable: 2, rate: 300, gain: 2, growthRate: 50, newShare: 75 });
  assert.equal(result.warnings.length, 0);
  near(result.bars.reduce((sum, bar) => sum + bar.value, 0), 8);
});

test('quarter-day and one-sixteenth source examples use their own initial surplus denominator', () => {
  check({ necessary: 2 }, { newNecessary: 1, newSurplusHours: 7, initialSurplus: 6, newSurplus: 7, gain: 1, growthRate: 100 / 6, rate: 700, newShare: 87.5 });
  check({ necessary: 0.5 }, { newNecessary: 0.25, newSurplus: 7.75, initialSurplus: 7.5, gain: 0.25, growthRate: 100 / 30, rate: 3100 });
});

test('one-thousandth example retains tiny necessary time and 999/1000000 day increment', () => {
  const result = values(check({ necessary: 0.008, multiplier: 1000 }, {
    newNecessary: 0.000008, initialSurplus: 7.992, newSurplus: 7.999992,
    gain: 0.007992, growthRate: 0.1, rate: 99999900, newShare: 99.9999
  }));
  near(result.gain / 8, 999 / 1000000);
});

test('no productivity change leaves surplus unchanged; permissible slowdown gives negative growth', () => {
  check({ multiplier: 1 }, { newSurplus: 4, gain: 0, growthRate: 0, rate: 100 });
  check({ necessary: 2, multiplier: 0.5 }, { newNecessary: 4, newSurplus: 4, initialSurplus: 6, gain: -2, growthRate: -100 / 3, rate: 100 });
});

test('changing monetary expression scales amounts but not time or valid ratios', () => {
  check({ lambda: 5 }, { newNecessary: 2, newSurplus: 30, initialSurplus: 20, newVariable: 10, gain: 10, rate: 300, growthRate: 50 });
  const zero = check({ lambda: 0 }, { newSurplus: 0, initialSurplus: 0, newVariable: 0, gain: 0, rate: null, growthRate: null, newShare: 75 });
  assert.ok(zero.warnings.length > 0);
});

test('zero initial surplus does not generate an infinite relative growth rate', () => {
  const result = check({ necessary: 8 }, { initialSurplus: 0, newSurplus: 4, gain: 4, growthRate: null, rate: 100 });
  assert.ok(result.warnings.some(warning => warning.includes('m₀ = 0')));
});

test('zero necessary labour leaves no defined m/v ratio even with positive surplus', () => {
  const result = check({ necessary: 0 }, { newNecessary: 0, newSurplus: 8, gain: 0, growthRate: 0, rate: null, newShare: 100 });
  assert.ok(result.warnings.length > 0);
});

test('insufficient new working day preserves deficit and does not assert a valid surplus rate', () => {
  const result = check({ necessary: 6, multiplier: 0.5 }, {
    newNecessary: 12, newSurplusHours: -4, initialSurplus: 2,
    newSurplus: -4, newVariable: 12, gain: -6, rate: null, growthRate: null, newShare: null
  });
  assert.equal(result.bars.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('дефицит')));
});

test('invalid initial time allocation is not rehabilitated silently by later productivity growth', () => {
  const result = check({ necessary: 12, multiplier: 2 }, {
    initialSurplusHours: -4, newNecessary: 6, newSurplusHours: 2,
    initialSurplus: null, newSurplus: null, newVariable: null,
    gain: null, rate: null, growthRate: null, newShare: null
  });
  assert.equal(result.bars.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes('Исходный сценарий недопустим')));
});

test('nonfinite, missing and out-of-range values return explicit null without silent clamps', () => {
  for (const key of Object.keys(defaults)) {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, '2', -1, Number.MAX_VALUE]) {
      const result = run({ [key]: value });
      assert.ok(result.metrics.every(metric => metric.value === null), `${key}: ${value}`);
      assert.ok(result.warnings.length > 0);
      finiteTree(result);
    }
  }
  for (const overrides of [{ hours: 0 }, { multiplier: 0 }]) {
    assert.ok(run(overrides).metrics.every(metric => metric.value === null));
  }
  for (const parameters of [undefined, null, {}]) {
    assert.ok(model.compute(parameters).metrics.every(metric => metric.value === null));
  }
});

test('presets, boundaries and graph sweeps are finite, deterministic and do not mutate inputs', () => {
  const scenarios = model.presets.map(preset => ({ ...preset.values }));
  for (const field of model.fields) {
    for (let n = 0; n <= 50; n += 1) {
      scenarios.push({ ...defaults, [field.key]: field.min + (field.max - field.min) * n / 50 });
    }
  }
  for (const input of scenarios) {
    const snapshot = JSON.stringify(input);
    const result = model.compute(Object.freeze(input));
    finiteTree(result);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(JSON.stringify(model.compute(input)), JSON.stringify(result));
    assert.ok(result.metrics.some(metric => metric.key === model.plot.y));
    for (const bar of result.bars || []) assert.ok(bar.value >= 0);
  }
});

test('additional model appends without overwriting previous registry', () => {
  const previous = { id: 'previous' }, scope = { LAB_MODELS: [previous] };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), scope, { filename });
  assert.equal(scope.LAB_MODELS[0], previous);
  assert.equal(scope.LAB_MODELS.length, 2);
});
