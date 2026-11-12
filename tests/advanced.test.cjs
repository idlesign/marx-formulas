const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '..', 'models-advanced.js');
const context = {};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
const models = context.LAB_MODELS;
const get = suffix => models.find(model => model.id === `advanced-${suffix}`);
const defaults = model => Object.fromEntries(model.fields.map(field => [field.key, field.value]));
const compute = (suffix, overrides = {}) => {
  const model = get(suffix);
  assert.ok(model, suffix);
  return model.compute({ ...defaults(model), ...overrides });
};
const values = result => Object.fromEntries(result.metrics.map(metric => [metric.key, metric.value]));
const near = (actual, expected, label = '') => {
  assert.equal(typeof actual, 'number', label);
  assert.ok(Number.isFinite(actual), label);
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} differs from ${expected}`);
};
const expectMetrics = (suffix, expected, overrides) => {
  const result = compute(suffix, overrides);
  const actual = values(result);
  for (const [key, value] of Object.entries(expected)) {
    if (value === null) assert.equal(actual[key], null, `${suffix}.${key}`);
    else near(actual[key], value, `${suffix}.${key}`);
  }
  return result;
};
function allFinite(value, label) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), label);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) allFinite(item, `${label}.${key}`);
  }
}
function validResult(result, label) {
  assert.ok(result.metrics.length >= 2, `${label}: metrics`);
  assert.equal(new Set(result.metrics.map(metric => metric.key)).size, result.metrics.length);
  for (const metric of result.metrics) {
    assert.ok(metric.value === null || Number.isFinite(metric.value), `${label}.${metric.key}`);
    assert.equal(typeof metric.label, 'string');
    assert.equal(typeof metric.unit, 'string');
  }
  for (const bar of result.bars || []) assert.ok(Number.isFinite(bar.value) && bar.value >= 0, label);
  allFinite(result, label);
}

test('advanced script exposes only 18 uniquely named models with complete public contract', () => {
  assert.deepEqual(Object.keys(context), ['LAB_MODELS']);
  assert.equal(models.length, 18);
  assert.equal(new Set(models.map(model => model.id)).size, models.length);
  for (const model of models) {
    assert.ok(model.group >= 9 && model.group <= 14, model.id);
    for (const key of ['title', 'description', 'formula']) assert.ok(model[key].length > 0, `${model.id}.${key}`);
    assert.ok(model.formulaIds.length > 0);
    for (const id of [...model.formulaIds, ...model.relatedIds]) {
      assert.match(id, /^F\d{3}$/);
      assert.ok(Number(id.slice(1)) >= 1 && Number(id.slice(1)) <= 101);
    }
    assert.equal(new Set(model.fields.map(field => field.key)).size, model.fields.length);
    for (const field of model.fields) {
      for (const key of ['label', 'symbol', 'unit', 'hint']) assert.equal(typeof field[key], 'string');
      for (const key of ['min', 'max', 'step', 'value']) assert.ok(Number.isFinite(field[key]));
      assert.ok(field.min <= field.value && field.value <= field.max && field.step > 0);
    }
    const result = model.compute(defaults(model));
    assert.ok(model.fields.some(field => field.key === model.plot.x), `${model.id}: plot x`);
    assert.ok(result.metrics.some(metric => metric.key === model.plot.y), `${model.id}: plot y`);
    assert.ok(model.presets.length > 0);
    for (const preset of model.presets) {
      assert.ok(preset.label.length > 0);
      assert.deepEqual(Object.keys(preset.values).sort(), Object.keys(defaults(model)).sort());
    }
    validResult(result, model.id);
  }
});

test('mass may rise while the profit rate falls; turnover is an explicit separate factor', () => {
  expectMetrics('profit-comparison', { profitA: 20, profitB: 30, rateA: 20, rateB: 15, massChange: 10, rateChange: -5 });
  const result = expectMetrics('profit-comparison', { profitB: 40, rateB: 40 }, { c1: 80, v1: 20, n1: 2 });
  assert.ok(result.warnings.some(message => message.includes('Оборот различается')));
  expectMetrics('profit-comparison', { profitA: 0, rateA: null, rateChange: null }, { c0: 0, v0: 0 });
  const noVariable = compute('profit-comparison', { v0: 0 });
  assert.ok(noVariable.warnings.length > 0);
  assert.equal(noVariable.table.rows.find(row => row[0] === 'Фактическая m/v, %')[1], null);
});

test('production prices use advanced K, not consumed k; aggregate values agree by construction', () => {
  const result = expectMetrics('production-prices', {
    rate: 30, rateOnCost1: 300 / 7, price1: 100, totalPrice: 332, totalValue: 332,
    aggregateGap: 0, wrongBaseGap: -9,
  });
  const rows = result.table.rows;
  near(rows.reduce((total, row) => total + row[5], 0), 90);
  near(rows.reduce((total, row) => total + row[7], 0), 0);
  expectMetrics('production-prices', { wrongBaseGap: 0, rateOnCost1: 30 }, { c1: 80, c2: 70, c3: 60 });
  const invalid = compute('production-prices', { K1: 20 });
  assert.ok(invalid.warnings.some(message => message.includes('K < c + v')));
  expectMetrics('production-prices', { rate: null, price1: null, totalPrice: null, aggregateGap: null }, { K1: 0, K2: 0, K3: 0 });
});

test('wage shift changes low and high composition production prices in opposite directions', () => {
  expectMetrics('wage-prices', { priceBefore: 120, priceAfter: 900 / 7, rateAfter: 100 / 7, surplusAfter: 37.5 });
  expectMetrics('wage-prices', { priceAfter: 816 / 7 }, { c: 92, v: 8 });
  const negative = expectMetrics('wage-prices', { surplusAfter: -25 }, { wageChange: 150 });
  assert.ok(negative.warnings.some(message => message.includes('отрицательный')));
  expectMetrics('wage-prices', { priceBefore: null, priceAfter: null, rateAfter: null }, { averageC: 0, averageV: 0 });
});

test('money-value changes use exact reciprocal and preserve the historical approximation error', () => {
  expectMetrics('money-reciprocal', {
    exactPrice: 1000 / 9, linearPrice: 110, priceError: -10 / 9,
    exactRate: 500 / 23, linearRate: 1100 / 51,
  });
  expectMetrics('money-reciprocal', { exactPrice: 1000 / 11, linearPrice: 90, priceError: -10 / 11 }, { moneyChange: 10 });
  const invalid = expectMetrics('money-reciprocal', { exactPrice: null, exactRate: null, priceError: null }, { moneyChange: -100 });
  assert.ok(invalid.warnings.length > 0);
  const badApproximation = expectMetrics('money-reciprocal', { exactPrice: 100 / 3, linearPrice: -100 }, { moneyChange: 200 });
  assert.ok(badApproximation.warnings.some(message => message.includes('Линейное')));
});

test('industrial and merchant profits partition the same surplus; expenses are separate', () => {
  expectMetrics('trade-distribution', { rate: 18, industryProfit: 162, tradingProfit: 18, retail: 1080, profitResidual: 0 });
  expectMetrics('trade-distribution', { rate: 120 / 7, industryProfit: 1080 / 7, tradingProfit: 180 / 7, retail: 1130, profitResidual: 0 }, { expenses: 50 });
  expectMetrics('trade-distribution', { rate: null, retail: null, profitResidual: null }, { industrial: 0, merchant: 0, expenses: 0 });
});

test('merchant turnover divides annual rate without compounding', () => {
  expectMetrics('trade-turnover', { markup: 3, profit: 15, oneSale: 103, annualSales: 515 });
  expectMetrics('trade-turnover', { markup: 15, profit: 15, oneSale: 115, annualSales: 115 }, { turns: 1 });
  const noTurnover = expectMetrics('trade-turnover', { markup: null, oneSale: null, annualSales: null }, { turns: 0 });
  assert.ok(noTurnover.warnings.length > 0);
});

test('capitalization distinguishes income from advance and preserves negative entrepreneurial residual', () => {
  expectMetrics('interest-capitalization', { interestSum: 50, entrepreneur: 100, capitalized: 2000, landPrice: 1000, profitRate: 20 });
  const zeroInterest = expectMetrics('interest-capitalization', { interestSum: 0, capitalized: null, landPrice: null }, { interest: 0 });
  assert.ok(zeroInterest.warnings.length > 0);
  const deficit = expectMetrics('interest-capitalization', { entrepreneur: -20 }, { surplus: 30, rent: 0 });
  assert.equal(deficit.bars.length, 0);
  assert.ok(deficit.warnings.length > 0);
  expectMetrics('interest-capitalization', { profitRate: null }, { capital: 0 });
});

test('four-land rent example reproduces 0, 60, 120, 180 and does not call individual prices labour values', () => {
  const result = expectMetrics('rent-lands', { totalRent: 360, rentD: 180, perAcre: 90, rentRate: 180, marketTotal: 600, individualTotal: 240 });
  assert.deepEqual(Array.from(result.table.rows, row => row[4]), [0, 60, 120, 180]);
  assert.equal(result.warnings.length, 0);
  const deficit = compute('rent-lands', { price: 45 });
  near(deficit.table.rows[0][4], -15);
  assert.ok(deficit.warnings.length > 0);
  expectMetrics('rent-lands', { perAcre: null }, { area: 0 });
  expectMetrics('rent-lands', { rentRate: null }, { capital: 0 });
  assert.ok(compute('rent-lands', { qA: 5 }).warnings.some(message => message.includes('наименее')));
});

test('sequential land investments expose the second investment deficit independently', () => {
  expectMetrics('rent-investments', { firstRent: 3, additionalRent: 1.5, rent: 4.5, rentRate: 90 });
  const result = expectMetrics('rent-investments', { additionalRent: -1.5, rent: 1.5 }, { q2: 0.5 });
  assert.ok(result.warnings.length > 0);
  expectMetrics('rent-investments', { rentRate: null }, { K1: 0, K2: 0 });
});

test('absolute rent is restricted to nonnegative value-price gap and admissible capture share', () => {
  expectMetrics('absolute-rent', { surplus: 20, value: 120, productionPrice: 110, gap: 10, rent: 10, salePrice: 120 });
  expectMetrics('absolute-rent', { gap: 0, rent: 0 }, { c: 80, v: 20 });
  expectMetrics('absolute-rent', { gap: -5, rent: null, salePrice: null }, { c: 90, v: 10 });
  expectMetrics('absolute-rent', { rent: 5, salePrice: 115 }, { capture: 50 });
  for (const capture of [-1, 101]) {
    const result = expectMetrics('absolute-rent', { rent: null, salePrice: null }, { capture });
    assert.ok(result.warnings.length > 0);
  }
});

test('simple reproduction keeps means and consumption imbalances signed and opposite', () => {
  const balanced = expectMetrics('simple-reproduction', { meansGap: 0, consumptionGap: 0, grossProduct: 9000, newValue: 3000 });
  assert.equal(balanced.warnings.length, 0);
  const unbalanced = expectMetrics('simple-reproduction', { meansGap: -500, consumptionGap: 500 }, { c2: 2500 });
  assert.equal(unbalanced.warnings.length, 2);
  expectMetrics('simple-reproduction', { meansGap: 0, consumptionGap: 0, grossProduct: 0, newValue: 0 },
    { c1: 0, v1: 0, m1: 0, c2: 0, v2: 0, m2: 0 });
});

test('expanded reproduction reproduces the first agreed step, not independently arbitrary accumulation', () => {
  const result = expectMetrics('expanded-reproduction', { meansGap: 0, consumptionGap: 0, exchangeGap: 0, capitalNext: 7900, outputNext: 9800 });
  const rows = result.table.rows;
  near(rows[0][1], 500); near(rows[0][2], 400); near(rows[0][3], 100);
  near(rows[1][1], 600); near(rows[1][2], 100); near(rows[1][3], 50);
  assert.equal(result.warnings.length, 0);
  const unbalanced = expectMetrics('expanded-reproduction', { meansGap: -150, consumptionGap: 150, exchangeGap: -150, outputNext: null }, { acc2: 50 });
  assert.ok(unbalanced.warnings.length >= 2);
  for (const key of ['acc1', 'acc2', 'constant1', 'constant2']) {
    const invalid = expectMetrics('expanded-reproduction', { outputNext: null }, { [key]: 101 });
    assert.ok(invalid.warnings.some(message => message.includes('Доли вне')));
  }
  expectMetrics('expanded-reproduction', { outputNext: null }, { v1: 0 });
});

test('linear accumulation does not silently compound surplus or hide capital exhaustion', () => {
  expectMetrics('accumulation', { accumulation: 100, deltaC: 80, deltaV: 20, capitalEnd: 1500, equivalentPeriods: 10 });
  expectMetrics('accumulation', { accumulation: 0, capitalEnd: 1000 }, { consumption: 200 });
  const deficit = expectMetrics('accumulation', { accumulation: -300, capitalEnd: -500 }, { consumption: 500 });
  assert.ok(deficit.warnings.length >= 2);
  expectMetrics('accumulation', { equivalentPeriods: null }, { consumption: 0 });
});

test('compound growth and end-of-period annuity use exact geometric calculation', () => {
  expectMetrics('compound-growth', { final: 161.051, principal: 100, interestEarned: 61.051, growth: 1.61051 });
  expectMetrics('compound-growth', { final: 1257.78925355488, principal: 1000, interestEarned: 257.78925355488 }, { initial: 0, rate: 5, periods: 10, deposit: 100 });
  expectMetrics('compound-growth', { final: 1100, principal: 1100, interestEarned: 0, growth: 1 }, { rate: 0, periods: 10, deposit: 100 });
  expectMetrics('compound-growth', { final: 100, growth: 1 }, { periods: 0, deposit: 500 });
  near(values(compute('compound-growth', { initial: 0, rate: 1e-9, periods: 10, deposit: 100 })).final, 1000.000000045);
  assert.equal(get('compound-growth').fields.find(field => field.key === 'periods').integer, true);
  for (const overrides of [{ periods: 2.5 }, { periods: -1 }, { rate: -100 }]) {
    const result = expectMetrics('compound-growth', { final: null, interestEarned: null, growth: null }, overrides);
    assert.ok(result.warnings.length > 0);
  }
});

test('social deductions are explicit and accounting units agree across fields and metrics', () => {
  expectMetrics('social-funds', { deductions: 650, personal: 350, personalShare: 35 });
  const deficit = expectMetrics('social-funds', { personal: -150, personalShare: -30 }, { product: 500 });
  assert.ok(deficit.warnings.length > 0);
  assert.equal(deficit.bars.length, 0);
  expectMetrics('social-funds', { personalShare: null }, { product: 0 });
  assert.ok(get('social-funds').fields.every(field => field.unit === 'учётных ед.'));
});

test('labour receipts subtract common funds before calculating obtainable goods', () => {
  expectMetrics('labour-receipt', { receipt: 6, quantity: 3, commonShare: 25 });
  const deficit = expectMetrics('labour-receipt', { receipt: -2, quantity: null }, { labour: 4, commonLabour: 6 });
  assert.ok(deficit.warnings.length > 0);
  expectMetrics('labour-receipt', { quantity: null }, { unitLabour: 0 });
  expectMetrics('labour-receipt', { commonShare: null }, { labour: 0 });
});

test('Proudhon example applies both percentages to the same base without treating percent as currency', () => {
  expectMetrics('proudhon-percent', { capital: 1000000, gain: 4000000, loss: 330000, net: 3670000, perPerson: 3.67 });
  expectMetrics('proudhon-percent', { capital: 0, gain: 0, loss: 0, net: 0, perPerson: null }, { participants: 0 });
  const loss = expectMetrics('proudhon-percent', { net: -130, perPerson: -0.13 }, { participants: 1000, gainRate: 20 });
  assert.ok(loss.warnings.length > 0);
  assert.ok(compute('proudhon-percent', { participants: 1.5 }).warnings.some(message => message.includes('Дробное')));
});

test('criticized markup sum remains a currency sum, not a computed use value', () => {
  expectMetrics('markup-not-value', { price: 130, markup: 30, markupRate: 30 });
  expectMetrics('markup-not-value', { price: 30, markup: 30, markupRate: null }, { cost: 0 });
});

test('defaults, presets and deterministic mixed boundary samples are finite and never mutate inputs', () => {
  let seed = 1971;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const model of models) {
    const scenarios = [defaults(model), ...model.presets.map(preset => ({ ...preset.values }))];
    scenarios.push(Object.fromEntries(model.fields.map(field => [field.key, field.min])));
    scenarios.push(Object.fromEntries(model.fields.map(field => [field.key, field.max])));
    for (const field of model.fields) {
      scenarios.push({ ...defaults(model), [field.key]: field.min });
      scenarios.push({ ...defaults(model), [field.key]: field.max });
    }
    for (let i = 0; i < 30; i += 1) scenarios.push(Object.fromEntries(model.fields.map(field => {
      const value = field.min + random() * (field.max - field.min);
      return [field.key, field.integer ? Math.round(value) : value];
    })));
    for (const input of scenarios) {
      const snapshot = JSON.stringify(input);
      Object.freeze(input);
      const result = model.compute(input);
      validResult(result, model.id);
      assert.equal(JSON.stringify(input), snapshot, `${model.id}: mutated input`);
      assert.equal(JSON.stringify(model.compute(input)), JSON.stringify(result), `${model.id}: nondeterministic`);
    }
  }
});

test('missing, string, NaN and infinite inputs never become a plausible numerical result', () => {
  for (const model of models) {
    const key = model.fields[0].key;
    for (const invalid of [undefined, null, '100', NaN, Infinity, -Infinity]) {
      const input = { ...defaults(model), [key]: invalid };
      const result = model.compute(input);
      validResult(result, model.id);
      assert.ok(result.metrics.every(metric => metric.value === null));
      assert.ok(result.warnings.length > 0);
    }
    for (const input of [undefined, null, {}]) {
      const result = model.compute(input);
      validResult(result, model.id);
      assert.ok(result.warnings.length > 0);
    }
  }
});

test('out-of-range and extreme finite inputs are reported, not silently clamped', () => {
  const result = expectMetrics('markup-not-value', { price: 200130 }, { tradeMarkup: 200010 });
  assert.ok(result.warnings.some(message => message.includes('вне учебного диапазона')));
  for (const model of models) {
    const input = Object.fromEntries(model.fields.map(field => [field.key, Number.MAX_VALUE]));
    const extreme = model.compute(input);
    validResult(extreme, model.id);
    assert.ok(extreme.warnings.length > 0);
  }
});

test('advanced registration appends to earlier model scripts without overwriting their registry', () => {
  const sentinel = { id: 'existing' };
  const scope = { LAB_MODELS: [sentinel] };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), scope, { filename });
  assert.equal(scope.LAB_MODELS.length, 19);
  assert.equal(scope.LAB_MODELS[0], sentinel);
});
