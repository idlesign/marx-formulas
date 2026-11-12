const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const stand = path.resolve(__dirname, '..');
const context = {};
for (const filename of ['catalog.js', 'models-foundations.js', 'models-advanced.js', 'models-audit.js', 'models-grundrisse.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(stand, filename), 'utf8'), context, { filename });
}
const catalog = context.FORMULA_CATALOG;
const models = context.LAB_MODELS;
const formulaIds = new Set(catalog.formulas.map(formula => formula.id));
const groupIds = new Set(catalog.groups.map(group => group.id));
const defaults = model => Object.fromEntries(model.fields.map(field => [field.key, field.value]));
const local = value => JSON.parse(JSON.stringify(value));

function nonemptyString(value, message) {
  assert.equal(typeof value, 'string', message);
  assert.ok(value.trim(), message);
}

function allNumbersFinite(value, location) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${location}: ${value}`);
  } else if (typeof value === 'string') {
    assert.doesNotMatch(value, /\b(?:NaN|Infinity)\b/, `${location}: nonfinite value leaked into text`);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) allNumbersFinite(child, `${location}.${key}`);
  } else {
    assert.ok(value === null || typeof value === 'boolean', `${location}: unsupported result type`);
  }
}

function validateResult(model, result, label) {
  const where = `${model.id}: ${label}`;
  assert.ok(result && typeof result === 'object', where);
  allNumbersFinite(result, where);
  assert.ok(Array.isArray(result.metrics) && result.metrics.length >= 2, `${where}: metrics`);
  const keys = new Set();
  for (const metric of result.metrics) {
    nonemptyString(metric.key, `${where}: metric key`);
    nonemptyString(metric.label, `${where}: metric label`);
    assert.equal(typeof metric.unit, 'string', `${where}: metric unit`);
    assert.ok(!keys.has(metric.key), `${where}: duplicate metric ${metric.key}`);
    keys.add(metric.key);
    assert.ok(metric.value === null || Number.isFinite(metric.value), `${where}: ${metric.key}`);
  }
  assert.ok(keys.has(model.plot.y), `${where}: plot metric ${model.plot.y} is missing`);
  for (const key of ['warnings', 'notes', 'flow']) {
    if (result[key] === undefined) continue;
    assert.ok(Array.isArray(result[key]), `${where}: ${key} must be an array`);
    for (const item of result[key]) nonemptyString(item, `${where}: ${key}`);
  }
  if (result.bars !== undefined) {
    assert.ok(Array.isArray(result.bars), `${where}: bars`);
    if (result.bars.length) nonemptyString(result.barUnit, `${where}: bar unit`);
    for (const bar of result.bars) {
      nonemptyString(bar.label, `${where}: bar label`);
      assert.ok(Number.isFinite(bar.value) && bar.value >= 0, `${where}: negative/nonfinite bar`);
    }
  }
  if (result.table !== undefined) {
    assert.ok(Array.isArray(result.table.columns) && result.table.columns.length > 0, `${where}: columns`);
    for (const column of result.table.columns) nonemptyString(column, `${where}: column`);
    assert.ok(Array.isArray(result.table.rows), `${where}: rows`);
    for (const row of result.table.rows) {
      assert.ok(Array.isArray(row), `${where}: row`);
      assert.equal(row.length, result.table.columns.length, `${where}: table width`);
    }
  }
}

function evaluate(model, parameters, label) {
  const before = { ...parameters };
  const result = model.compute(parameters);
  assert.deepEqual(parameters, before, `${model.id}: compute mutated parameters (${label})`);
  validateResult(model, result, label);
  const repeated = model.compute(Object.freeze({ ...parameters }));
  validateResult(model, repeated, `${label}, frozen parameters`);
  assert.deepEqual(local(repeated), local(result), `${model.id}: compute is not deterministic (${label})`);
  return result;
}

function values(id, overrides = {}) {
  const model = models.find(item => item.id === id);
  assert.ok(model, `Missing model ${id}`);
  return Object.fromEntries(evaluate(model, { ...defaults(model), ...overrides }, 'source example')
    .metrics.map(metric => [metric.key, metric.value]));
}

function near(actual, expected, message) {
  assert.equal(typeof actual, 'number', message);
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${message}: expected ${expected}, got ${actual}`);
}

test('model IDs are unique and every model follows the shared browser contract', () => {
  assert.ok(Array.isArray(models) && models.length > 0);
  assert.equal(new Set(models.map(model => model.id)).size, models.length);
  for (const model of models) {
    for (const key of ['id', 'title', 'description', 'formula']) nonemptyString(model[key], `${model.id}: ${key}`);
    assert.ok(groupIds.has(model.group), `${model.id}: unknown group ${model.group}`);
    assert.equal(typeof model.compute, 'function', `${model.id}: compute`);
    assert.ok(Array.isArray(model.fields) && model.fields.length > 0, `${model.id}: fields`);
    const fieldKeys = new Set();
    for (const field of model.fields) {
      for (const key of ['key', 'label', 'symbol']) nonemptyString(field[key], `${model.id}: field ${key}`);
      assert.equal(typeof field.unit, 'string', `${model.id}: field unit`);
      assert.ok(!fieldKeys.has(field.key), `${model.id}: duplicate field ${field.key}`);
      fieldKeys.add(field.key);
      for (const key of ['value', 'min', 'max', 'step']) {
        assert.ok(Number.isFinite(field[key]), `${model.id}.${field.key}.${key}`);
      }
      assert.ok(field.min <= field.max && field.step > 0, `${model.id}.${field.key}: invalid range/step`);
      assert.ok(field.value >= field.min && field.value <= field.max, `${model.id}.${field.key}: default outside range`);
      if (field.integer) assert.ok(Number.isInteger(field.value), `${model.id}.${field.key}: integer default`);
    }
    assert.ok(model.plot && fieldKeys.has(model.plot.x), `${model.id}: plot x`);
    nonemptyString(model.plot.y, `${model.id}: plot y`);
    nonemptyString(model.plot.label, `${model.id}: plot label`);
    assert.ok(Array.isArray(model.presets) && model.presets.length > 0, `${model.id}: presets`);
    for (const preset of model.presets) {
      nonemptyString(preset.label, `${model.id}: preset label`);
      assert.ok(preset.values && typeof preset.values === 'object', `${model.id}: preset values`);
      for (const [key, value] of Object.entries(preset.values)) {
        const field = model.fields.find(item => item.key === key);
        assert.ok(field, `${model.id}: preset references unknown field ${key}`);
        assert.ok(Number.isFinite(value) && value >= field.min && value <= field.max,
          `${model.id}: preset value ${key} outside declared range`);
      }
    }
  }
});

test('all formula references exist and all 101 catalog entries have an interactive or related model', () => {
  const covered = new Set();
  for (const model of models) {
    assert.ok(Array.isArray(model.formulaIds) && model.formulaIds.length > 0, `${model.id}: formulaIds`);
    assert.ok(Array.isArray(model.relatedIds), `${model.id}: relatedIds`);
    for (const references of [model.formulaIds, model.relatedIds]) {
      assert.equal(new Set(references).size, references.length, `${model.id}: duplicate formula references`);
      for (const id of references) {
        assert.ok(formulaIds.has(id), `${model.id}: unknown catalog formula ${id}`);
        covered.add(id);
      }
    }
  }
  assert.deepEqual(Array.from(formulaIds).filter(id => !covered.has(id)), [], 'Uncovered formulas');
  assert.equal(covered.size, 101);
  assert.deepEqual(Array.from(groupIds).filter(id => !models.some(model => model.group === id)), [], 'Groups without models');
});

for (const model of models) {
  test(`${model.id}: defaults and every preset are finite, deterministic and do not mutate input`, () => {
    evaluate(model, defaults(model), 'defaults');
    for (const preset of model.presets) {
      evaluate(model, { ...defaults(model), ...preset.values }, preset.label);
    }
  });

  test(`${model.id}: boundary and graph probes return finite values or explicit null`, () => {
    const base = defaults(model);
    evaluate(model, Object.fromEntries(model.fields.map(field => [field.key, field.min])), 'all minima');
    evaluate(model, Object.fromEntries(model.fields.map(field => [field.key, field.max])), 'all maxima');
    for (const field of model.fields) {
      const probes = new Set([field.min, field.max]);
      if (field.min <= 0 && field.max >= 0) probes.add(0);
      for (const value of probes) evaluate(model, { ...base, [field.key]: value }, `${field.key} = ${value}`);
    }
    const axis = model.fields.find(field => field.key === model.plot.x);
    for (let index = 0; index <= 20; index += 1) {
      let value = axis.min + (axis.max - axis.min) * index / 20;
      if (axis.integer) value = Math.round(value);
      evaluate(model, { ...base, [axis.key]: value }, `graph ${axis.key} = ${value}`);
    }
  });
}

test('F007/F034/F035/F036: equivalent, surplus rate and surplus share remain distinct', () => {
  near(values('composite-equivalent').equivalent, 5 / 6, 'F007 printed 1/2 cotton');
  near(values('composite-equivalent', { cotton: 1.5 }).equivalent, 1, 'F007 corrected 3/2 cotton');
  const day = values('working-day');
  near(day.rate, 100, 'F034 m/v expressed in percent');
  near(day.share, 50, 'F035 m/(v+m) expressed in percent');
  near(day.mass, 300, 'F037 mass over 100 identical workers');
  const first = values('unit-surplus-error');
  const second = values('unit-surplus-error', { surplus: 8, output: 5600 / 3 });
  near(first.correct, 3 / 5, 'F036 correct pence per pound');
  near(second.correct, 36 / 35, 'F036 second correct pence per pound');
  near(second.correct / first.correct, 12 / 7, 'F036 increase is not twofold');
});

test('F047/F049/F050: turnover, fund accumulation and physical stock retain different units', () => {
  near(values('depreciation-turnover').average, 1.08, 'F047 weighted value turnover');
  const fund = values('sinking-fund');
  near(fund.fund, 100 * (1.05 ** 10 - 1) / 0.05, 'F049 end-of-year deposits');
  near(fund.sourceError, fund.fund - (1252 + 11 / 20), 'F049 shillings are not decimal pounds');
  const stock = values('physical-expansion');
  near(stock.active, 1000 * 1.1 ** 10 - 1000, 'F050 original cohort retires');
  near(stock.residual, 1000, 'F050 residual value is not the physical count');
  near(stock.average, 1000 * (1.1 ** 10 - 1), 'F050 ten observations, not eleven');
});

test('F063/F064/F060: production prices use the advance K and inverse money changes are exact', () => {
  const prices = values('advanced-production-prices');
  near(prices.rate, 30, 'F061 common profit rate');
  near(prices.price1, 70 + 0.3 * 100, 'F063 price k + rK');
  near(prices.wrongBaseGap, 70 * 1.3 - 100, 'F063 incorrect k(1+r) differs when k != K');
  near(prices.aggregateGap, 0, 'F064 equality in the untransformed-input illustration');
  const money = values('advanced-money-reciprocal');
  near(money.exactPrice, 100 / 0.9, 'F060 exact inverse price');
  near(money.linearPrice, 110, 'F060 separately labelled linear approximation');
});

test('F073/F075/F076: profits redistribute once and turnover does not compound the advance', () => {
  const trade = values('advanced-trade-distribution');
  near(trade.rate, 18, 'F073 common profit rate');
  near(trade.industryProfit + trade.tradingProfit, 180, 'F073 total surplus is conserved');
  near(trade.retail, 1080, 'F073 profit not added twice');
  near(values('advanced-trade-distribution', { expenses: 50 }).retail, 1130, 'F075 expenses reimbursed separately');
  const turnover = values('advanced-trade-turnover');
  near(turnover.markup, 3, 'F076 15% / 5');
  near(turnover.annualSales, 515, 'F076 five separate sales of 103');
});

test('F085/F090/F096: source examples reproduce rent and both interdepartment balances', () => {
  near(values('advanced-absolute-rent').rent, 10, 'F085 letter of 1862');
  const simple = values('advanced-simple-reproduction');
  near(simple.meansGap, 0, 'F090 means of production balance');
  near(simple.consumptionGap, 0, 'F090 consumption balance');
  near(simple.grossProduct, 9000, 'F090 gross value');
  const expanded = values('advanced-expanded-reproduction');
  near(expanded.capitalNext, 7900, 'F096 next advance');
  near(expanded.outputNext, 9800, 'F096 next gross output');
  near(expanded.meansGap, 0, 'F095 means balance');
  near(expanded.consumptionGap, 0, 'F095 consumption balance');
  const broken = values('advanced-expanded-reproduction', { acc2: 50 });
  assert.notEqual(broken.meansGap, 0);
  assert.equal(broken.outputNext, null, 'Unbalanced plan must not be presented as realized next output');
});

test('F098/F099/F100: deficits stay visible, labour receipts exclude common deductions', () => {
  near(values('advanced-social-funds', { product: 500 }).personal, -150, 'F098 negative personal fund');
  const receipt = values('advanced-labour-receipt');
  near(receipt.receipt, 6, 'F099 eight hours less two');
  near(receipt.quantity, 3, 'F099 three units at two hours');
  const dispute = values('advanced-proudhon-percent');
  near(dispute.net, 3670000, 'F100 corrected social total');
  near(dispute.perPerson, 3.67, 'F100 amount per participant');
});
