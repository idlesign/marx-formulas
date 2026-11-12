/* Grundrisse, MEGA II/1.1, с. 249–254: учебная запись раннего варианта F040. */
(() => {
  'use strict';

  const fields = [
    { key: 'hours', label: 'Неизменный рабочий день', symbol: 'T', unit: 'ч', value: 8, min: 0.25, max: 24, step: 0.25, hint: 'День и общественно нормальная интенсивность не меняются. Восемь часов — наша нормировка долей дня, не цитата из рукописи.' },
    { key: 'necessary', label: 'Исходный необходимый труд', symbol: 't_n', unit: 'ч', value: 4, min: 0, max: 24, step: 0.001, hint: 'Время для воспроизводства прежней реальной корзины; не должно превышать исходный рабочий день.' },
    { key: 'multiplier', label: 'Множитель производительности', symbol: 'q', unit: 'раз', value: 2, min: 0.001, max: 1000, step: 0.001, hint: '2 означает удвоение, 1 — отсутствие изменения, 0,5 — уменьшение вдвое. Охвачен весь труд, определяющий стоимость корзины.' },
    { key: 'lambda', label: 'Денежное выражение часа труда', symbol: '\\lambda', unit: 'ден. ед./ч', value: 1, min: 0, max: 100, step: 0.1, hint: 'Фиксированный коэффициент общественно приведённого труда; при нуле денежные нормы 0/0 не определены.' }
  ];
  const metricDefinitions = [
    ['newNecessary', 'Новый необходимый труд', 'ч'],
    ['newSurplusHours', 'Новый прибавочный труд / дефицит времени', 'ч'],
    ['initialSurplusHours', 'Исходный прибавочный труд / дефицит', 'ч'],
    ['newSurplus', 'Новая прибавочная стоимость / дефицит', 'ден. ед.'],
    ['initialSurplus', 'Исходная прибавочная стоимость', 'ден. ед.'],
    ['newVariable', 'Новая стоимость прежней корзины', 'ден. ед.'],
    ['rate', 'Новая норма m₁/v₁', '%'],
    ['gain', 'Изменение денежного остатка m₁ − m₀', 'ден. ед.'],
    ['growthRate', 'Прирост m относительно исходного m₀', '%'],
    ['newShare', 'Доля нового прибавочного труда в дне', '%']
  ];
  const notes = [
    'Реконструкция раннего варианта F040: MEGA II/1.1, с. 249–254. Множитель производительности делит необходимый труд, а не умножает всю прибавочную стоимость.',
    'Фиксированы реальная потребительская корзина, длительность дня, интенсивность и денежное выражение приведённого труда. Изменение q охватывает весь труд, определяющий стоимость корзины, а не одну операцию или только непосредственный труд.',
    'Примеры Маркса заданы долями дня. Перевод в восьмичасовой день и λ = 1 — учебная нормировка. Здесь не моделируются перенесённая стоимость, цены производства и изменение реальной зарплаты.',
    'Доля прибавочного труда в целом дне, норма m/v и темп прироста (m₁ − m₀)/m₀ имеют разные знаменатели. Предельная доля 100% не устанавливает верхнюю границу нормы m/v.'
  ];
  const metrics = values => metricDefinitions.map(([key, label, unit]) => ({
    key, label, unit, value: Number.isFinite(values[key]) ? values[key] : null
  }));
  const model = {
    id: 'grundrisse-productivity-surplus', group: 6,
    title: 'Grundrisse: производительность и прирост прибавочного труда',
    description: 'Почему удвоение производительности не удваивает прибавочную стоимость: результат зависит от исходной необходимой доли дня.',
    formula: String.raw`t_{n,1}=t_n/q,\quad m_1=\lambda(T-t_n/q),\quad \Delta m=\lambda t_n(1-1/q)`,
    formulaIds: ['F040', 'F034', 'F035'], relatedIds: ['F002', 'F026', 'F041'],
    fields,
    presets: [
      { label: 'Необходимая половина дня, производительность ×2', values: { hours: 8, necessary: 4, multiplier: 2, lambda: 1 } },
      { label: 'Необходимая четверть дня, производительность ×2', values: { hours: 8, necessary: 2, multiplier: 2, lambda: 1 } },
      { label: 'Необходимая 1/16 дня, производительность ×2', values: { hours: 8, necessary: 0.5, multiplier: 2, lambda: 1 } },
      { label: 'Необходимая 1/1000 дня, производительность ×1000', values: { hours: 8, necessary: 0.008, multiplier: 1000, lambda: 1 } }
    ],
    compute(parameters) {
      const p = parameters || {};
      const invalid = fields.filter(field => !Number.isFinite(p[field.key]) || p[field.key] < field.min || p[field.key] > field.max);
      if (invalid.length) return {
        metrics: metrics({}), notes: [...notes],
        warnings: invalid.map(field => `${field.label}: нужно конечное число от ${field.min} до ${field.max}; ввод не заменён нулём и не ограничен автоматически.`)
      };

      const initialHours = p.hours - p.necessary;
      const newNecessary = p.necessary / p.multiplier;
      const newHours = p.hours - newNecessary;
      const validInitial = initialHours >= 0;
      const validNew = newHours >= 0;
      const initialSurplus = validInitial ? p.lambda * initialHours : null;
      // Отрицательный остаток сохраняется как дефицит, не выдаётся за положительную m.
      const newSurplus = validInitial ? p.lambda * newHours : null;
      const newVariable = validInitial ? p.lambda * newNecessary : null;
      const gain = validInitial ? newSurplus - initialSurplus : null;
      const rate = validInitial && validNew && newVariable > 0 ? 100 * newSurplus / newVariable : null;
      const growthRate = validInitial && validNew && initialSurplus > 0 ? 100 * gain / initialSurplus : null;
      const warnings = [];
      if (!validInitial) warnings.push('Исходный необходимый труд превышает рабочий день. Исходный сценарий недопустим: показан дефицит времени, денежные результаты и сравнение не рассчитываются.');
      if (!validNew) warnings.push('После изменения производительности необходимый труд превышает день. Отрицательный остаток — дефицит воспроизводства прежней корзины; норма прибавочной стоимости и её темп роста здесь не определяются.');
      if (p.necessary === 0) warnings.push('Нулевая необходимая работа — вырожденная граница: v = 0 и норма m/v не определена. Реальное воспроизводство работника этим не объясняется.');
      if (p.lambda === 0) warnings.push('При λ = 0 все денежные величины нулевые: m/v и относительный прирост денег являются 0/0, хотя временные доли остаются вычислимыми.');
      else if (initialSurplus === 0) warnings.push('Исходная прибавочная стоимость равна нулю: абсолютный прирост вычислим, но делить его на m₀ = 0 нельзя.');

      return {
        metrics: metrics({
          newNecessary, newSurplusHours: newHours, initialSurplusHours: initialHours,
          newSurplus, initialSurplus, newVariable, rate, gain, growthRate,
          newShare: validInitial && validNew ? 100 * newHours / p.hours : null
        }),
        bars: validInitial && validNew ? [
          { label: 'Новый необходимый труд', value: newNecessary, color: 'blue' },
          { label: 'Новый прибавочный труд', value: newHours, color: 'red' }
        ] : [],
        barUnit: 'ч',
        table: {
          columns: ['Отношение', 'До', 'После'],
          rows: [
            ['Необходимый труд, ч', p.necessary, newNecessary],
            ['Остаток дня, ч', initialHours, newHours],
            ['Стоимость корзины, ден. ед.', validInitial ? p.lambda * p.necessary : null, newVariable],
            ['Денежный остаток, ден. ед.', initialSurplus, newSurplus],
            ['Норма m/v, %', validInitial && p.lambda > 0 && p.necessary > 0 ? 100 * initialHours / p.necessary : null, rate]
          ]
        },
        notes: [...notes], warnings
      };
    },
    plot: { x: 'multiplier', y: 'newSurplus', label: 'Прибавочная стоимость или дефицит при изменении производительности' }
  };

  globalThis.LAB_MODELS = (globalThis.LAB_MODELS || []).concat([model]);
})();
