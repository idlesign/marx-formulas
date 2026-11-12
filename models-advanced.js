/* Учебные параметризации. Исторические формулы и оговорки — в 0formulas.md. */
(() => {
  'use strict';

  const money = 'ден. ед.';
  const finite = Number.isFinite;
  const field = (key, label, symbol, unit, value, min, max, step, hint) =>
    ({ key, label, symbol, unit, value, min, max, step, hint });
  const cash = (key, label, symbol, value, hint, max = 100000) =>
    field(key, label, symbol, money, value, 0, max, 1, hint);
  const percent = (key, label, symbol, value, hint, min = 0, max = 100) =>
    field(key, label, symbol, '%', value, min, max, 1, hint);
  const metric = (key, label, value, unit = money, hint = '') =>
    ({ key, label, value: finite(value) ? value : null, unit, hint });
  const ratio = (a, b) => finite(a) && finite(b) && b > 0 ? a / b : null;
  const pct = (a, b) => {
    const result = ratio(a, b);
    return result === null ? null : result * 100;
  };
  const sum = values => values.reduce((a, b) => a + b, 0);
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const nonnegativeBars = rows => rows.every(row => finite(row.value) && row.value >= 0) ? rows : [];
  const bar = (label, value, color) => ({ label, value, color });
  const fmt = value => finite(value) ? String(Number(value.toPrecision(9))) : 'не определено';
  const warnBalance = (warnings, gap, label) => {
    if (!close(gap, 0)) warnings.push(`${label}: ${fmt(gap)} ${money}. Знак сохранён; баланс не замыкается автоматически.`);
  };

  // Все возвращаемые числа конечны; переполнение и нечисловой ввод не дают ложного нуля.
  function model(spec) {
    const calculate = spec.compute;
    return {
      ...spec,
      compute(parameters) {
        const p = parameters || {};
        const bad = spec.fields.filter(item => !finite(p[item.key]));
        if (bad.length) {
          return {
            metrics: [metric(spec.plot.y, 'Результат не определён', null), metric('validation', 'Проверка входных данных', null, '')],
            warnings: [`Нужны конечные числовые значения: ${bad.map(item => item.label).join(', ')}.`],
            notes: ['Пустые, NaN и бесконечные значения не заменяются нулём.']
          };
        }
        const warnings = spec.fields
          .filter(item => p[item.key] < item.min || p[item.key] > item.max)
          .map(item => `${item.label}: значение вне учебного диапазона [${item.min}; ${item.max}]; оно не было ограничено автоматически.`);
        const result = calculate({ ...p });
        result.warnings = warnings.concat(result.warnings || []);
        let overflow = false;
        function clean(value) {
          if (typeof value === 'number') {
            if (!finite(value)) { overflow = true; return null; }
            return value;
          }
          if (Array.isArray(value)) return value.map(clean);
          if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
          return value;
        }
        const cleaned = clean(result);
        if (overflow) cleaned.warnings.push('Числовое переполнение: соответствующий результат не определён в машинной арифметике.');
        return cleaned;
      }
    };
  }

  const models = [
    model({
      id: 'advanced-profit-comparison', group: 9,
      title: 'Два капитала: масса и норма прибыли',
      description: 'Сравните состав капитала, эксплуатацию и число оборотов. Рост массы прибыли не обязательно означает рост нормы.',
      formula: String.raw`m_i=e_i v_i,\quad M_i=n_i m_i,\quad p_i'=M_i/(c_i+v_i)`,
      formulaIds: ['F053', 'F054', 'F055', 'F056', 'F057', 'F067', 'F068'], relatedIds: ['F058', 'F071'],
      fields: [
        cash('c0', 'Постоянный капитал A', 'c_A', 80, 'Авансированный запас; не износ за период.'),
        cash('v0', 'Переменный капитал A', 'v_A', 20, 'Аванс на один оборот рабочей силы.'),
        percent('e0', 'Норма прибавочной стоимости A', 'e_A', 100, '100 означает m/v = 1 за оборот.', 0, 500),
        field('n0', 'Оборотов A за год', 'n_A', 'раз/год', 1, 0, 20, 0.1, 'Одинаковые условия каждого оборота; допускается часть оборота.'),
        cash('c1', 'Постоянный капитал B', 'c_B', 170, 'Авансированный запас второго капитала.'),
        cash('v1', 'Переменный капитал B', 'v_B', 30, 'Аванс на один оборот.'),
        percent('e1', 'Норма прибавочной стоимости B', 'e_B', 100, 'Норма за один оборот, не годовая норма.', 0, 500),
        field('n1', 'Оборотов B за год', 'n_B', 'раз/год', 1, 0, 20, 0.1, 'Годовая прибыль делится на аванс, а не на сумму всех выплат.')
      ],
      presets: [
        { label: 'Масса растёт, норма падает', values: { c0: 80, v0: 20, e0: 100, n0: 1, c1: 170, v1: 30, e1: 100, n1: 1 } },
        { label: 'Два оборота вместо одного', values: { c0: 80, v0: 20, e0: 100, n0: 1, c1: 80, v1: 20, e1: 100, n1: 2 } }
      ],
      compute(p) {
        const K0 = p.c0 + p.v0, K1 = p.c1 + p.v1;
        const m0 = p.v0 * p.e0 / 100, m1 = p.v1 * p.e1 / 100;
        const M0 = m0 * p.n0, M1 = m1 * p.n1;
        const r0 = pct(M0, K0), r1 = pct(M1, K1);
        const warnings = [];
        if (K0 <= 0 || K1 <= 0) warnings.push('При нулевом или отрицательном авансированном капитале норма прибыли не определена.');
        if (p.v0 <= 0 || p.v1 <= 0) warnings.push('При v = 0 заданную норму m/v нельзя наблюдать: m = 0 в этой параметризации, но 0/0 не определено.');
        if (p.n0 !== p.n1) warnings.push('Оборот различается: эффект строения капитала нельзя выделить из годовых норм без учёта n.');
        return {
          metrics: [metric('profitA', 'Годовая масса A', M0), metric('profitB', 'Годовая масса B', M1), metric('rateA', 'Годовая норма A', r0, '%'), metric('rateB', 'Годовая норма B', r1, '%'), metric('massChange', 'Изменение массы B − A', M1 - M0), metric('rateChange', 'Изменение нормы B − A', r0 === null || r1 === null ? null : r1 - r0, 'п. п.')],
          table: { columns: ['Величина', 'A', 'B'], rows: [['Аванс K', K0, K1], ['m одного оборота', m0, m1], ['Фактическая m/v, %', pct(m0, p.v0), pct(m1, p.v1)], ['c/v', ratio(p.c0, p.v0), ratio(p.c1, p.v1)]] },
          bars: nonnegativeBars([bar('Годовая масса A', M0, 'blue'), bar('Годовая масса B', M1, 'red')]), barUnit: money,
          notes: ['До перераспределения между отраслями прибыль отождествлена с произведённой прибавочной стоимостью.', 'Это два заданных состояния, не доказательство исторически неизбежного падения нормы прибыли.'], warnings
        };
      },
      plot: { x: 'c1', y: 'rateB', label: 'Норма B при изменении её постоянного капитала' }
    }),

    model({
      id: 'advanced-production-prices', group: 9,
      title: 'Три отрасли и цены производства',
      description: 'Прибыль распределяется на аванс K, а не на потреблённые издержки k. Входы сохраняют прежнюю оценку.',
      formula: String.raw`\bar p'=\frac{\sum m_i}{\sum K_i},\quad m_i=e v_i,\quad P_i=c_i+v_i+\bar p'K_i`,
      formulaIds: ['F061', 'F062', 'F063', 'F064', 'F069'], relatedIds: ['F065', 'F070'],
      fields: [
        ...[1, 2, 3].flatMap((i) => [
          cash(`c${i}`, `Перенесённая стоимость c${i}`, `c_${i}`, [50, 51, 51][i - 1], 'Потреблённый постоянный капитал за один оборот; не полный запас машин.'),
          cash(`v${i}`, `Зарплатный аванс v${i}`, `v_${i}`, [20, 30, 40][i - 1], 'За период переменный капитал делает ровно один оборот.'),
          cash(`K${i}`, `Весь аванс K${i}`, `K_${i}`, 100, 'Включает запас основного капитала и v. Для этого однооборотного примера K ≥ c + v.')
        ]),
        percent('e', 'Общая норма прибавочной стоимости', 'e', 100, 'Одинакова во всех трёх отраслях.', 0, 500)
      ],
      presets: [
        { label: 'Три отрасли с частичным износом', values: { c1: 50, v1: 20, K1: 100, c2: 51, v2: 30, K2: 100, c3: 51, v3: 40, K3: 100, e: 100 } },
        { label: 'Полное потребление авансов', values: { c1: 80, v1: 20, K1: 100, c2: 70, v2: 30, K2: 100, c3: 60, v3: 40, K3: 100, e: 100 } }
      ],
      compute(p) {
        const sectors = [1, 2, 3].map(i => ({ i, c: p[`c${i}`], v: p[`v${i}`], K: p[`K${i}`] }));
        const totalM = sum(sectors.map(s => s.v * p.e / 100)), totalK = sum(sectors.map(s => s.K));
        const r = ratio(totalM, totalK), totalCost = sum(sectors.map(s => s.c + s.v));
        const warnings = [];
        sectors.forEach(s => {
          if (s.K < s.c + s.v) warnings.push(`Отрасль ${s.i}: K < c + v. Это нарушает однооборотную предпосылку; ниже лишь арифметическое перераспределение, не допустимый пример данной модели.`);
          if (s.K <= 0) warnings.push(`Отрасль ${s.i}: индивидуальная норма прибыли на K не определена.`);
        });
        if (r === null) warnings.push('Сумма авансов должна быть положительной. Общая норма и цены производства не определены.');
        const totalPrice = r === null ? null : totalCost + r * totalK;
        const totalValue = totalCost + totalM;
        const price1 = r === null ? null : p.c1 + p.v1 + r * p.K1;
        const short1 = r === null ? null : (p.c1 + p.v1) * (1 + r);
        return {
          metrics: [metric('rate', 'Общая норма прибыли', r === null ? null : r * 100, '%'), metric('rateOnCost1', 'Прибыль отрасли 1 / её издержки k', r === null ? null : pct(r * p.K1, p.c1 + p.v1), '%'), metric('price1', 'Цена выпуска отрасли 1', price1), metric('totalPrice', 'Сумма цен производства', totalPrice), metric('totalValue', 'Сумма стоимостей', totalValue), metric('aggregateGap', 'Сумма цен − сумма стоимостей', totalPrice === null ? null : totalPrice - totalValue), metric('wrongBaseGap', 'Ошибка k + rk для отрасли 1', price1 === null ? null : short1 - price1)],
          table: { columns: ['Отрасль', 'k', 'K', 'm', 'W', 'Распределённая прибыль', 'P', 'P − W'], rows: sectors.map(s => {
            const k = s.c + s.v, m = s.v * p.e / 100, profit = r === null ? null : r * s.K;
            return [s.i, k, s.K, m, k + m, profit, profit === null ? null : k + profit, profit === null ? null : profit - m];
          }) },
          notes: ['Три отрасли — учебная выборка, не перепечатка пятиотраслевой таблицы Маркса.', 'Равенства сумм выполнены по построению при прежних оценках затрат. Одновременное преобразование цен всех межотраслевых входов здесь НЕ решается.', 'Отрицательное P − W означает перераспределение, а не уничтожение стоимости.'], warnings
        };
      },
      plot: { x: 'K1', y: 'price1', label: 'Цена отрасли 1 при изменении её аванса' }
    }),

    model({
      id: 'advanced-wage-prices', group: 9,
      title: 'Зарплата и цены производства',
      description: 'Новый труд фиксирован; зарплата перераспределяет его между v и m. Норма задаётся представительным средним капиталом.',
      formula: String.raw`\bar p'_*=\frac{e\bar v-\delta\bar v}{\bar c+(1+\delta)\bar v},\quad P_*=[c+(1+\delta)v](1+\bar p'_*)`,
      formulaIds: ['F059', 'F066'], relatedIds: ['F061', 'F063'],
      fields: [
        cash('averageC', 'Постоянный капитал среднего строения', '\\bar c', 80, 'Представительный общественный капитал; весь потребляется за период.'),
        cash('averageV', 'Переменный капитал среднего строения', '\\bar v', 20, 'Его новая стоимость до сдвига равна v(1+e).'),
        percent('e', 'Исходная норма прибавочной стоимости', 'e', 100, 'Общая норма эксплуатации до изменения зарплаты.', 0, 500),
        cash('c', 'Постоянный капитал выбранной отрасли', 'c', 50, 'В этой модели потреблённый и авансированный капитал совпадают.'),
        cash('v', 'Переменный капитал выбранной отрасли', 'v', 50, 'Цена продукции рассчитана на весь этот аванс.'),
        percent('wageChange', 'Изменение зарплаты', '\\delta', 25, 'Процент относительно прежней зарплаты; новая стоимость остаётся прежней.', -100, 300)
      ],
      presets: [
        { label: 'Низкое строение, зарплата +25%', values: { averageC: 80, averageV: 20, e: 100, c: 50, v: 50, wageChange: 25 } },
        { label: 'Высокое строение, зарплата +25%', values: { averageC: 80, averageV: 20, e: 100, c: 92, v: 8, wageChange: 25 } }
      ],
      compute(p) {
        const d = p.wageChange / 100, averageM = p.averageV * p.e / 100;
        const r0 = ratio(averageM, p.averageC + p.averageV);
        const v1 = p.v * (1 + d), m1 = p.v * p.e / 100 - d * p.v;
        const r1 = ratio(averageM - d * p.averageV, p.averageC + p.averageV * (1 + d));
        const price0 = r0 === null ? null : (p.c + p.v) * (1 + r0);
        const price1 = r1 === null ? null : (p.c + v1) * (1 + r1);
        const warnings = [];
        if (d < -1) warnings.push('Падение зарплаты больше 100% даёт отрицательную зарплату: экономический сценарий недопустим.');
        if (m1 < 0 || averageM - d * p.averageV < 0) warnings.push('Зарплата превышает новую стоимость; отрицательный остаток показан как убыток, а не как положительная прибавочная стоимость.');
        if (r0 === null || r1 === null) warnings.push('Норма на нулевой или отрицательный капитал не определена.');
        return {
          metrics: [metric('priceBefore', 'Цена до сдвига', price0), metric('priceAfter', 'Цена после сдвига', price1), metric('priceChange', 'Изменение цены', price0 === null || price1 === null ? null : price1 - price0), metric('rateAfter', 'Новая общая норма', r1 === null ? null : 100 * r1, '%'), metric('surplusAfter', 'Отраслевой остаток m после зарплаты', m1)],
          table: { columns: ['Показатель', 'До', 'После'], rows: [['Зарплата отрасли', p.v, v1], ['Новая стоимость отрасли', p.v * (1 + p.e / 100), v1 + m1], ['Общая норма, %', r0 === null ? null : 100 * r0, r1 === null ? null : 100 * r1]] },
          notes: ['Оценки средств производства и производительность фиксированы; весь капитал совершает один оборот.', 'Выбранная отрасль — отдельный пример на фоне заданного среднего строения; она не переопределяет это среднее.'], warnings
        };
      },
      plot: { x: 'wageChange', y: 'priceAfter', label: 'Цена выбранной отрасли при сдвиге зарплаты' }
    }),

    model({
      id: 'advanced-money-reciprocal', group: 9,
      title: 'Ошибка симметричных процентов: 1868 год',
      description: 'Точная обратная пропорция отличается от линейного приближения. Показаны оба результата, без исправления исходника исподволь.',
      formula: String.raw`P_1/P_0=1/(1+\delta_g),\quad P_{\rm лин}/P_0=1-\delta_g`,
      formulaIds: ['F060'], relatedIds: ['F059'],
      fields: [
        percent('moneyChange', 'Изменение стоимости денежного металла', '\\delta_g', -10, 'При −10% новая стоимость денежной единицы составляет 0,9 прежней.', -100, 200),
        cash('price', 'Исходная денежная цена', 'P_0', 100, 'Трудовая стоимость товара в сравнении неизменна.'),
        cash('c', 'Постоянный капитал, оставленный в прежней сумме', 'c', 400, 'Для сравнения прибыли воспроизводим особую предпосылку письма: денежное c не переоценивается.'),
        cash('v', 'Исходный переменный капитал', 'v', 100, 'В точном варианте умножается на обратный коэффициент.'),
        cash('m', 'Исходная прибавочная стоимость', 'm', 100, 'Меняется вместе с v; эксплуатация при v > 0 остаётся прежней.')
      ],
      presets: [{ label: 'Письмо: стоимость денег −10%', values: { moneyChange: -10, price: 100, c: 400, v: 100, m: 100 } }, { label: 'Стоимость денег +10%', values: { moneyChange: 10, price: 100, c: 400, v: 100, m: 100 } }],
      compute(p) {
        const d = p.moneyChange / 100, factor = ratio(1, 1 + d), linear = 1 - d;
        const exactPrice = factor === null ? null : p.price * factor;
        const linearPrice = p.price * linear;
        const exactRate = factor === null ? null : pct(p.m * factor, p.c + p.v * factor);
        const linearRate = pct(p.m * linear, p.c + p.v * linear);
        const warnings = [];
        if (factor === null) warnings.push('Стоимость денежной единицы должна быть положительной: при падении на 100% и более обратная цена не определена.');
        if (linear <= 0) warnings.push('Линейное приближение даёт нулевую/отрицательную цену и непригодно для этого сдвига.');
        return {
          metrics: [metric('exactPrice', 'Точная новая цена', exactPrice), metric('linearPrice', 'Линейное приближение из письма', linearPrice), metric('priceError', 'Приближение − точный результат', exactPrice === null ? null : linearPrice - exactPrice), metric('exactRate', 'Норма прибыли с точным коэффициентом', exactRate, '%'), metric('linearRate', 'Норма с линейным коэффициентом', linearRate, '%')],
          table: { columns: ['Сравнение', 'Точный расчёт', 'Линейный'], rows: [['Множитель цен', factor, linear], ['Изменение цены, %', factor === null ? null : 100 * (factor - 1), -p.moneyChange]] },
          notes: ['В письме 22.04.1868 названы симметричные ±10%; точное правило — обратная пропорция.', 'Для исходных 400c + 100v + 100m линейный вариант даёт 110/510 = 21,568627…%, а не напечатанные в MEGA 21,58%.', 'При одинаковой переоценке ВСЕХ c, v и m норма прибыли не менялась бы. Здесь c намеренно сохраняется: это дополнительная предпосылка, не чистый эффект денежного масштаба.'], warnings
        };
      },
      plot: { x: 'moneyChange', y: 'priceError', label: 'Ошибка линейной замены обратной пропорции' }
    }),

    model({
      id: 'advanced-trade-distribution', group: 10,
      title: 'Промышленный и торговый капиталы',
      description: 'Прежняя прибавочная стоимость распределяется между промышленностью и торговлей; отдельно возмещаются торговые издержки.',
      formula: String.raw`r=\frac m{K_{\rm пр}+K_{\rm торг}+b},\quad h=r(K_{\rm торг}+b)`,
      formulaIds: ['F073', 'F074', 'F075'], relatedIds: ['F072'],
      fields: [
        cash('industrial', 'Промышленный аванс', 'K_{пр}', 900, 'Упрощение: весь промышленный аванс входит в издержки годового продукта.'),
        cash('merchant', 'Торговый денежный аванс', 'K_{торг}', 100, 'Обособившийся капитал для обращения.'),
        cash('surplus', 'Общая произведённая прибавочная стоимость', 'm', 180, 'Чистая торговля не создаёт дополнительного m в этой модели.'),
        cash('expenses', 'Дополнительные торговые издержки', 'b', 0, 'Дополнительный аванс на чистое обращение, возмещаемый в цене; пример главы XVII.')
      ],
      presets: [{ label: '900 + 100, прибавочная стоимость 180', values: { industrial: 900, merchant: 100, surplus: 180, expenses: 0 } }, { label: 'Плюс 50 торговых издержек', values: { industrial: 900, merchant: 100, surplus: 180, expenses: 50 } }],
      compute(p) {
        const total = p.industrial + p.merchant + p.expenses, r = ratio(p.surplus, total);
        const industryProfit = r === null ? null : r * p.industrial;
        const tradingProfit = r === null ? null : r * (p.merchant + p.expenses);
        const wholesale = industryProfit === null ? null : p.industrial + industryProfit;
        const retail = wholesale === null ? null : wholesale + p.expenses + tradingProfit;
        return {
          metrics: [metric('rate', 'Общая норма прибыли', r === null ? null : 100 * r, '%'), metric('industryProfit', 'Промышленная прибыль', industryProfit), metric('tradingProfit', 'Торговая прибыль', tradingProfit), metric('retail', 'Итоговая цена годовой массы', retail), metric('profitResidual', 'Распределённая прибыль − m', r === null ? null : industryProfit + tradingProfit - p.surplus)],
          flow: [`Производство: издержки ${fmt(p.industrial)}, m ${fmt(p.surplus)}`, `Продажа купцу: ${fmt(wholesale)}`, `Возмещение b: ${fmt(p.expenses)}`, `Торговая прибыль: ${fmt(tradingProfit)}`, `Продажа: ${fmt(retail)}`],
          notes: ['Дополнительное b показано отдельно, не выдано за вновь созданную торговлей прибавочную стоимость.', 'Оборот торгового аванса здесь не моделируется; для наценки на отдельную закупку используйте соседнюю лабораторию оборота.'],
          warnings: r === null ? ['При нулевом общем авансе норма и распределение по капиталам не определены.'] : []
        };
      },
      plot: { x: 'merchant', y: 'rate', label: 'Общая норма при выделении торгового капитала' }
    }),

    model({
      id: 'advanced-trade-turnover', group: 10,
      title: 'Годовая прибыль и наценка одного оборота',
      description: 'Один и тот же аванс используется повторно; годовая прибыль распределяется по закупкам без реинвестирования прибыли.',
      formula: String.raw`\mu=r/n,\quad h=Kr,\quad S=nK+h`,
      formulaIds: ['F076'], relatedIds: ['F075', 'F078'],
      fields: [
        cash('capital', 'Торговый аванс', 'K', 100, 'Покупная стоимость одной равной партии.'),
        percent('rate', 'Годовая норма прибыли', 'r', 15, 'Это процент на один аванс, не на сумму всех покупок.', 0, 200),
        field('turns', 'Оборотов за год', 'n', 'раз/год', 5, 0, 30, 0.25, 'При n = 0 наценка одного оборота не определена.')
      ],
      presets: [{ label: 'Пять закупок по 100, 15% годовых', values: { capital: 100, rate: 15, turns: 5 } }, { label: 'Один оборот', values: { capital: 100, rate: 15, turns: 1 } }],
      compute(p) {
        const markup = ratio(p.rate, p.turns), profit = p.capital * p.rate / 100;
        const sale = markup === null ? null : p.capital * (1 + markup / 100);
        return {
          metrics: [metric('markup', 'Наценка одной закупки', markup, '%'), metric('profit', 'Целевая годовая прибыль', profit), metric('oneSale', 'Продажа одной партии', sale), metric('annualSales', 'Годовые продажи', p.turns > 0 ? p.turns * p.capital + profit : null)],
          table: { columns: ['Поток', 'Сумма'], rows: [['Годовые закупки', p.turns * p.capital], ['Годовые продажи', p.turns > 0 ? p.turns * p.capital + profit : null]] },
          notes: ['Никакого начисления сложных процентов внутри года: прибыль не увеличивает следующую закупку.'],
          warnings: p.turns <= 0 ? ['Без положительного оборота положительная годовая прибыль не может быть реализована в этой схеме.'] : []
        };
      },
      plot: { x: 'turns', y: 'markup', label: 'Наценка обратно пропорциональна обороту' }
    }),

    model({
      id: 'advanced-interest-capitalization', group: 10,
      title: 'Процент, предпринимательский остаток и капитализация',
      description: 'Разделите прибыль, а затем отличите действительный аванс от цены бессрочного права на доход.',
      formula: String.raw`z=iK,\quad \Pi=m-R-z,\quad K_{\rm фикт}=Y/i,\quad P_{\rm земли}=R/i`,
      formulaIds: ['F072', 'F077', 'F079'], relatedIds: ['F078'],
      fields: [
        cash('capital', 'Действительный аванс', 'K', 1000, 'База начисления процента и общей нормы прибыли.'),
        cash('surplus', 'Общая прибыль до деления', 'm', 200, 'Общий доход собственников; отдельной отрасли после перераспределения не приписывается равенство её прибыли её m.'),
        percent('interest', 'Годовая ставка процента', 'i', 5, 'Ноль допустим для суммы процента, но не для Y/i.', 0, 100),
        cash('rent', 'Годовая земельная рента', 'R', 50, 'Часть общей прибыли в выбранном разложении.'),
        cash('income', 'Постоянный годовой доход для капитализации', 'Y', 100, 'Отдельный бессрочный доход; не прибавляется второй раз к m.')
      ],
      presets: [{ label: 'Доход 100 при ставке 5%', values: { capital: 1000, surplus: 200, interest: 5, rent: 50, income: 100 } }, { label: 'Процент превышает прибыль', values: { capital: 1000, surplus: 30, interest: 5, rent: 0, income: 100 } }],
      compute(p) {
        const i = p.interest / 100, interest = p.capital * i, entrepreneur = p.surplus - p.rent - interest;
        const warnings = [];
        if (i <= 0) warnings.push('При i ≤ 0 бессрочная капитализация Y/i не определена; отсутствие процента не означает нулевую цену права.');
        if (entrepreneur < 0) warnings.push('Процент и рента превышают прибыль: предпринимательский остаток отрицателен. Положительный обычный доход здесь невозможен.');
        return {
          metrics: [metric('interestSum', 'Годовой процент', interest), metric('entrepreneur', 'Предпринимательский остаток', entrepreneur), metric('capitalized', 'Капитализированный отдельный доход Y', ratio(p.income, i)), metric('landPrice', 'Капитализированная рента', ratio(p.rent, i)), metric('profitRate', 'Общая прибыль / аванс', pct(p.surplus, p.capital), '%')],
          bars: nonnegativeBars([bar('Процент', interest, 'blue'), bar('Рента', p.rent, 'gold'), bar('Предпринимательский остаток', entrepreneur, 'red')]), barUnit: money,
          notes: ['Отрицательный остаток не рисуется положительным сегментом диаграммы; он остаётся в показателях.', 'Y/i предполагает бессрочный неизменный доход и ставку; это цена права на доход, не доказанная трудовая стоимость имущества.'], warnings
        };
      },
      plot: { x: 'interest', y: 'capitalized', label: 'Капитализация фиксированного дохода при разной ставке' }
    }),

    model({
      id: 'advanced-rent-lands', group: 11,
      title: 'Четыре земли: дифференциальная рента I',
      description: 'Общая рыночная цена, равные затраты и разные урожаи. Отрицательный остаток — дефицит, а не скрытая нулевая рента.',
      formula: String.raw`R_i=pQ_i-k-rK,\quad S_{\rm рын}=p\sum Q_i,\quad S_{\rm инд}=4(k+rK)`,
      formulaIds: ['F080', 'F081', 'F082', 'F086'], relatedIds: ['F084'],
      fields: [
        field('price', 'Рыночная цена единицы урожая', 'p', 'ден. ед./квартер', 60, 0, 300, 1, 'Одна и та же цена для продукции всех четырёх земель.'),
        cash('cost', 'Потреблённые затраты каждого участка', 'k', 50, 'Издержки одного годового урожая.'),
        cash('capital', 'Аванс каждого участка', 'K', 50, 'Может превышать годовые издержки из-за долговечных средств.'),
        percent('rate', 'Средняя норма прибыли', 'r', 20, 'Нормальная прибыль рассчитывается на K.', 0, 100),
        ...['A', 'B', 'C', 'D'].map((letter, i) => field(`q${letter}`, `Урожай участка ${letter}`, `Q_${letter}`, 'квартер', i + 1, 0, 20, 0.25, 'Урожай целого участка за тот же период.')),
        field('area', 'Площадь каждого участка', 'A', 'акр', 1, 0, 20, 0.25, 'Для ренты на акр; нулевая площадь даёт неопределённую норму на площадь.')
      ],
      presets: [{ label: 'Маркс: урожаи 1, 2, 3, 4', values: { price: 60, cost: 50, capital: 50, rate: 20, qA: 1, qB: 2, qC: 3, qD: 4, area: 1 } }, { label: 'Цена падает до 45', values: { price: 45, cost: 50, capital: 50, rate: 20, qA: 1, qB: 2, qC: 3, qD: 4, area: 1 } }],
      compute(p) {
        const letters = ['A', 'B', 'C', 'D'], normal = p.capital * p.rate / 100, production = p.cost + normal;
        const rows = letters.map(letter => ({ letter, q: p[`q${letter}`], rent: p.price * p[`q${letter}`] - production }));
        const totalRent = sum(rows.map(row => row.rent)), totalQ = sum(rows.map(row => row.q));
        const warnings = [];
        if (!close(rows[0].rent, 0)) warnings.push('Участок A не имеет нулевого остатка: предпосылка чистой дифференциальной ренты с безрентной худшей землёй не выполнена.');
        if (rows.some(row => row.rent < 0)) warnings.push('Есть участок с выручкой ниже издержек плюс нормальная прибыль. Его отрицательный остаток показан; возделывание всех участков не является равновесием.');
        if (p.qA > Math.min(...rows.map(row => row.q))) warnings.push('A не является наименее урожайным участком при равных вложениях.');
        if (p.area <= 0) warnings.push('Рента с акра при нулевой площади не определена.');
        if (p.capital < p.cost) warnings.push('K < k: это требует нескольких оборотов, которые в однооборотной иллюстрации отдельно не заданы.');
        return {
          metrics: [metric('totalRent', 'Суммарный остаток над нормальной прибылью', totalRent), metric('rentD', 'Остаток участка D', rows[3].rent), metric('perAcre', 'Средний остаток с акра', ratio(totalRent, 4 * p.area), 'ден. ед./акр'), metric('rentRate', 'Сумма остатков / сумма авансов', pct(totalRent, 4 * p.capital), '%'), metric('marketTotal', 'Рыночная сумма продукции', p.price * totalQ), metric('individualTotal', 'Сумма индивидуальных цен производства', 4 * production)],
          table: { columns: ['Земля', 'Урожай', 'Выручка', 'Цена производства всей массы', 'Остаток', 'Рента в продукте'], rows: rows.map(row => [row.letter, row.q, p.price * row.q, production, row.rent, ratio(row.rent, p.price)]) },
          notes: ['Все участки имеют равные капиталы и издержки. Рента — присвоенный собственником положительный остаток; при отрицательном остатке термин «рента» неприменим.', 'Сумма индивидуальных цен производства не объявляется суммой трудовых стоимостей.'], warnings
        };
      },
      plot: { x: 'price', y: 'totalRent', label: 'Суммарная рента или дефицит при изменении цены' }
    }),

    model({
      id: 'advanced-rent-investments', group: 11,
      title: 'Один участок: дифференциальная рента II',
      description: 'Сравните первоначальное и добавочное вложения. Урожай второго вложения может быть меньше, больше или равен первому.',
      formula: String.raw`R=p(Q_1+Q_2)-(K_1+K_2)(1+r)`,
      formulaIds: ['F083', 'F082'], relatedIds: ['F080'],
      fields: [
        field('price', 'Регулирующая цена', 'p', 'ден. ед./квартер', 3, 0, 30, 0.1, 'Общая цена для продукции обеих последовательных затрат.'),
        percent('rate', 'Средняя норма прибыли', 'r', 20, 'Каждое вложение здесь полностью потребляется за один период.', 0, 100),
        field('K1', 'Первоначальное вложение', 'K_1', money, 2.5, 0, 100, 0.1, 'Упрощение k₁ = K₁.'),
        field('q1', 'Его урожай', 'Q_1', 'квартер', 2, 0, 50, 0.1, 'Первоначальный урожай.'),
        field('K2', 'Дополнительное вложение', 'K_2', money, 2.5, 0, 100, 0.1, 'Упрощение k₂ = K₂; может быть нулевым.'),
        field('q2', 'Добавочный урожай', 'Q_2', 'квартер', 1.5, 0, 50, 0.1, 'Именно прибавка урожая, не новый суммарный урожай.')
      ],
      presets: [{ label: 'Падающая отдача: 2 и 1,5 квартера', values: { price: 3, rate: 20, K1: 2.5, q1: 2, K2: 2.5, q2: 1.5 } }, { label: 'Добавочный урожай не окупает вложение', values: { price: 3, rate: 20, K1: 2.5, q1: 2, K2: 2.5, q2: 0.5 } }],
      compute(p) {
        const r = p.rate / 100, first = p.price * p.q1 - p.K1 * (1 + r), additional = p.price * p.q2 - p.K2 * (1 + r);
        const warnings = [];
        if (additional < 0) warnings.push('Добавочное вложение не приносит нормальной прибыли; его отрицательный остаток не скрыт успешностью первого вложения.');
        if ((p.K1 === 0 && p.q1 > 0) || (p.K2 === 0 && p.q2 > 0)) warnings.push('Положительный урожай при нулевом вложении требует внешнего объяснения: производственная функция здесь не задана.');
        return {
          metrics: [metric('rent', 'Совокупный остаток', first + additional), metric('additionalRent', 'Остаток добавочного вложения', additional), metric('firstRent', 'Остаток первоначального вложения', first), metric('rentRate', 'Остаток / суммарный аванс', pct(first + additional, p.K1 + p.K2), '%')],
          table: { columns: ['Вложение', 'Урожай на единицу капитала', 'Выручка', 'Издержки + нормальная прибыль'], rows: [['Первое', ratio(p.q1, p.K1), p.price * p.q1, p.K1 * (1 + r)], ['Второе', ratio(p.q2, p.K2), p.price * p.q2, p.K2 * (1 + r)]] },
          notes: ['Модель двух вложений на одном участке; цена задана извне, а не выведена из спроса.', 'Износ и оборот не выделены: все вложения считаются издержками периода.'], warnings
        };
      },
      plot: { x: 'q2', y: 'additionalRent', label: 'Добавочная рента или дефицит по урожаю второго вложения' }
    }),

    model({
      id: 'advanced-absolute-rent', group: 11,
      title: 'Абсолютная рента и предел стоимостного избытка',
      description: 'Отделите стоимость продукта от его цены производства и долю избытка, присваиваемую землевладельцем.',
      formula: String.raw`W=c+v+ev,\quad P^{\rm пр}=c+v+rK,\quad G=W-P^{\rm пр},\quad R=\alpha G`,
      formulaIds: ['F084', 'F085'], relatedIds: ['F080'],
      fields: [
        cash('c', 'Потреблённый постоянный капитал', 'c', 60, 'Вошедшая в продукт стоимость средств производства.'),
        cash('v', 'Переменный капитал', 'v', 40, 'Один оборот за период.'),
        cash('capital', 'Весь аванс', 'K', 100, 'Для этой однооборотной модели K ≥ c + v.'),
        percent('e', 'Норма прибавочной стоимости', 'e', 50, 'm = ev; ввод в процентах.', 0, 500),
        percent('rate', 'Общая норма прибыли', 'r', 10, 'Средняя прибыль на аванс, не на урожай.', 0, 100),
        percent('capture', 'Присваиваемая доля избытка', '\\alpha', 100, '100% соответствует продаже по стоимости и присвоению всей разности.')
      ],
      presets: [{ label: 'Письмо 1862: рента 10', values: { c: 60, v: 40, capital: 100, e: 50, rate: 10, capture: 100 } }, { label: 'Избыток исчезает', values: { c: 80, v: 20, capital: 100, e: 50, rate: 10, capture: 100 } }],
      compute(p) {
        const m = p.v * p.e / 100, value = p.c + p.v + m, production = p.c + p.v + p.capital * p.rate / 100;
        const gap = value - production, validCapture = p.capture >= 0 && p.capture <= 100;
        const rent = gap >= 0 && validCapture ? gap * p.capture / 100 : null;
        const warnings = [];
        if (gap < 0) warnings.push('Стоимость ниже цены производства. Положительная абсолютная рента из данного избытка невозможна; разность показана отрицательной.');
        if (!validCapture) warnings.push('Доля присвоения вне 0–100% выходит за рассматриваемый немонопольный предел. Рента не определена.');
        if (p.capital < p.c + p.v) warnings.push('K < c + v не согласуется с одним оборотом и полным включением v в аванс.');
        return {
          metrics: [metric('surplus', 'Произведённая прибавочная стоимость', m), metric('value', 'Стоимость продукта', value), metric('productionPrice', 'Цена производства', production), metric('gap', 'Стоимость − цена производства', gap), metric('rent', 'Абсолютная рента в заданных пределах', rent), metric('salePrice', 'Цена с присвоенной рентой', rent === null ? null : production + rent)],
          notes: ['Монопольные цены сверх стоимости не моделируются.', 'Низкое строение земледельческого капитала — заданное условие примера, не универсальный исторический факт.'], warnings
        };
      },
      plot: { x: 'v', y: 'gap', label: 'Запас для абсолютной ренты при изменении переменного капитала' }
    }),

    model({
      id: 'advanced-simple-reproduction', group: 12,
      title: 'Простое воспроизводство: два подразделения',
      description: 'Проверьте не только общую сумму стоимости, но и соответствие средств производства и предметов потребления их потребностям.',
      formula: String.raw`I(v+m)=IIc,\quad G_{\rm сп}=W_I-c_I-c_{II},\quad G_{\rm пп}=W_{II}-v_I-v_{II}-m_I-m_{II}`,
      formulaIds: ['F088', 'F090', 'F091'], relatedIds: ['F089', 'F092', 'F093', 'F097'],
      fields: [
        cash('c1', 'I: постоянный капитал', 'c_I', 4000, 'I производит только средства производства.'),
        cash('v1', 'I: переменный капитал', 'v_I', 1000, 'Доход работников полностью расходуется на предметы потребления.'),
        cash('m1', 'I: прибавочная стоимость', 'm_I', 1000, 'Вся потребляется; накопление отсутствует.'),
        cash('c2', 'II: постоянный капитал', 'c_{II}', 2000, 'II производит только предметы потребления.'),
        cash('v2', 'II: переменный капитал', 'v_{II}', 500, 'Доход работников II.'),
        cash('m2', 'II: прибавочная стоимость', 'm_{II}', 500, 'Вся потребляется капиталистами II.')
      ],
      presets: [{ label: '6000 средств + 3000 потребления', values: { c1: 4000, v1: 1000, m1: 1000, c2: 2000, v2: 500, m2: 500 } }, { label: 'Дефицит средств производства', values: { c1: 4000, v1: 1000, m1: 1000, c2: 2500, v2: 500, m2: 500 } }],
      compute(p) {
        const w1 = p.c1 + p.v1 + p.m1, w2 = p.c2 + p.v2 + p.m2;
        const meansGap = w1 - p.c1 - p.c2, consumptionGap = w2 - p.v1 - p.v2 - p.m1 - p.m2;
        const warnings = [];
        warnBalance(warnings, meansGap, 'Средства производства: выпуск − потребность');
        warnBalance(warnings, consumptionGap, 'Предметы потребления: выпуск − потребность');
        return {
          metrics: [metric('meansGap', 'Средства: избыток (+) / дефицит (−)', meansGap), metric('consumptionGap', 'Потребление: избыток (+) / дефицит (−)', consumptionGap), metric('grossProduct', 'Валовая стоимость обоих продуктов', w1 + w2), metric('newValue', 'Новая стоимость v + m', p.v1 + p.v2 + p.m1 + p.m2)],
          table: { columns: ['Продукция', 'Выпуск', 'Потребность', 'Остаток'], rows: [['Средства производства', w1, p.c1 + p.c2, meansGap], ['Предметы потребления', w2, p.v1 + p.v2 + p.m1 + p.m2, consumptionGap]] },
          flow: [`I передаёт II средства на ${fmt(p.c2)}`, `Доходы I требуют предметов потребления на ${fmt(p.v1 + p.m1)}`, `Разница требований: ${fmt(meansGap)}`],
          notes: ['Стоимостное равенство — необходимый баланс в этих агрегатах, но не гарантия нужного ассортимента и своевременного обмена.', 'Продукция каждого подразделения имеет заданную натуральную функцию; денежный остаток сам по себе не превращает пищу в станки.', 'Деление II на необходимые средства и роскошь (F093) здесь не рассчитывается: его отдельный баланс доступен только в справочном тексте.'], warnings
        };
      },
      plot: { x: 'c2', y: 'meansGap', label: 'Дефицит средств при росте потребности подразделения II' }
    }),

    model({
      id: 'advanced-expanded-reproduction', group: 12,
      title: 'Расширенное воспроизводство: проверка накопления',
      description: 'Задайте решения обоих подразделений независимо. Стенд не подгоняет второе решение под первое и показывает несовпадение потоков.',
      formula: String.raw`m_i=k_i+\Delta c_i+\Delta v_i,\quad v_I+k_I+\Delta v_I=c_{II}+\Delta c_{II}`,
      formulaIds: ['F095', 'F096', 'F087'], relatedIds: ['F090', 'F094'],
      fields: [
        cash('c1', 'I: прежний постоянный капитал', 'c_I', 4000, 'Средства производства в текущем выпуске.'),
        cash('v1', 'I: прежний переменный капитал', 'v_I', 1000, 'Предыдущая структура используется также для условного расчёта следующего m/v.'),
        cash('m1', 'I: текущая прибавочная стоимость', 'm_I', 1000, 'Распределяется между потреблением и накоплением.'),
        cash('c2', 'II: прежний постоянный капитал', 'c_{II}', 1500, 'Средства производства для подразделения II.'),
        cash('v2', 'II: прежний переменный капитал', 'v_{II}', 750, 'Стоимость рабочей силы II.'),
        cash('m2', 'II: текущая прибавочная стоимость', 'm_{II}', 750, 'Распределяется независимо от решения I.'),
        percent('acc1', 'I: доля m на накопление', 'a_I', 50, 'Остаток m идёт в личное потребление.'),
        percent('constant1', 'I: доля накопления на Δc', 's_I', 80, 'Остальная доля накопления покупает дополнительную рабочую силу.'),
        percent('acc2', 'II: доля m на накопление', 'a_{II}', 20, 'Не корректируется автоматически при изменении I.'),
        percent('constant2', 'II: доля накопления на Δc', 's_{II}', 100 * 2 / 3, 'В первом примере Δc:Δv = 2:1.')
      ],
      presets: [{ label: 'Первый согласованный шаг Маркса', values: { c1: 4000, v1: 1000, m1: 1000, c2: 1500, v2: 750, m2: 750, acc1: 50, constant1: 80, acc2: 20, constant2: 100 * 2 / 3 } }, { label: 'Оба накапливают половину m', values: { c1: 4000, v1: 1000, m1: 1000, c2: 1500, v2: 750, m2: 750, acc1: 50, constant1: 80, acc2: 50, constant2: 100 * 2 / 3 } }],
      compute(p) {
        const a1 = p.m1 * p.acc1 / 100, a2 = p.m2 * p.acc2 / 100;
        const dc1 = a1 * p.constant1 / 100, dc2 = a2 * p.constant2 / 100;
        const dv1 = a1 - dc1, dv2 = a2 - dc2, k1 = p.m1 - a1, k2 = p.m2 - a2;
        const w1 = p.c1 + p.v1 + p.m1, w2 = p.c2 + p.v2 + p.m2;
        const needs1 = p.c1 + p.c2 + dc1 + dc2;
        const needs2 = p.v1 + p.v2 + dv1 + dv2 + k1 + k2;
        const meansGap = w1 - needs1, consumptionGap = w2 - needs2;
        const exchangeGap = p.v1 + k1 + dv1 - p.c2 - dc2;
        const nextM1 = p.v1 > 0 ? (p.v1 + dv1) * p.m1 / p.v1 : null;
        const nextM2 = p.v2 > 0 ? (p.v2 + dv2) * p.m2 / p.v2 : null;
        const balanced = close(meansGap, 0) && close(consumptionGap, 0);
        const validShares = ['acc1', 'acc2', 'constant1', 'constant2'].every(key => p[key] >= 0 && p[key] <= 100);
        const nextPotential = nextM1 === null || nextM2 === null ? null : p.c1 + dc1 + p.v1 + dv1 + nextM1 + p.c2 + dc2 + p.v2 + dv2 + nextM2;
        const warnings = [];
        warnBalance(warnings, meansGap, 'Средства производства: выпуск − потребность');
        warnBalance(warnings, consumptionGap, 'Предметы потребления: выпуск − потребность');
        if (!validShares) warnings.push('Доли вне 0–100% дают недопустимое распределение. Следующий цикл не считается осуществимым.');
        if (nextM1 === null || nextM2 === null) warnings.push('При прежнем v = 0 нельзя восстановить норму m/v для следующего цикла.');
        return {
          metrics: [metric('meansGap', 'Средства: избыток (+) / дефицит (−)', meansGap), metric('consumptionGap', 'Потребление: избыток (+) / дефицит (−)', consumptionGap), metric('exchangeGap', 'Межподразделенческий баланс', exchangeGap), metric('capitalNext', 'Запланированный аванс следующего цикла', p.c1 + p.v1 + p.c2 + p.v2 + a1 + a2), metric('outputNext', 'Следующий выпуск при выполненных балансах', balanced && validShares ? nextPotential : null)],
          table: { columns: ['Подразделение', 'Потребление k', 'Δc', 'Δv', 'Новый c', 'Новый v'], rows: [['I', k1, dc1, dv1, p.c1 + dc1, p.v1 + dv1], ['II', k2, dc2, dv2, p.c2 + dc2, p.v2 + dv2]] },
          notes: ['Дополнительная рабочая сила потребляет средства существования из текущего продукта; её стоимость не берётся из ничего.', 'Следующий выпуск дополнительно предполагает прежние нормы m/v, неизменные стоимости и возможность нужной техники. Даже нулевой агрегатный остаток не доказывает реальное рыночное равновесие.', 'При дефицитах показан план капитала, но «следующий выпуск» не выдан за осуществлённый.'], warnings
        };
      },
      plot: { x: 'acc2', y: 'meansGap', label: 'Что нарушает независимое увеличение накопления во II' }
    }),

    model({
      id: 'advanced-accumulation', group: 12,
      title: 'Потребление прибыли и накопление',
      description: 'Разложите прибавочную стоимость и сопоставьте накопление с условным сроком потребления эквивалента исходного капитала.',
      formula: String.raw`m=k+a,\quad \Delta c=sa,\quad \Delta v=(1-s)a,\quad N=K_0/k`,
      formulaIds: ['F087'], relatedIds: ['F095', 'F078'],
      fields: [
        cash('initial', 'Первоначальный капитал', 'K_0', 1000, 'База сравнения потреблённого дохода; сам капитал не обязательно расходуется.'),
        cash('surplus', 'Прибавочная стоимость за период', 'm', 200, 'В этой учебной траектории фиксирована каждый период.'),
        cash('consumption', 'Личное потребление за период', 'k', 100, 'При k > m возникает дефицит, не положительное накопление.'),
        percent('constantShare', 'Доля накопления в постоянный капитал', 's', 80, 'Остаток идёт в переменный капитал.'),
        field('periods', 'Число периодов', 'T', 'период', 5, 0, 100, 1, 'Линейная проекция при неизменных m и k, без автоматической прибыли на прирост.')
      ],
      presets: [{ label: '100 накопления в год', values: { initial: 1000, surplus: 200, consumption: 100, constantShare: 80, periods: 5 } }, { label: 'Вся прибавочная стоимость потребляется', values: { initial: 1000, surplus: 200, consumption: 200, constantShare: 80, periods: 5 } }],
      compute(p) {
        const a = p.surplus - p.consumption, dc = a * p.constantShare / 100, dv = a - dc;
        const endpoint = p.initial + p.periods * a, warnings = [];
        if (a < 0) warnings.push('Личное потребление превышает прибавочную стоимость: отрицательное накопление означает потребность в расходовании капитала или долге.');
        if (endpoint < 0) warnings.push('Линейный план исчерпал исходный капитал и требует внешнего финансирования; отрицательный остаток сохранён.');
        if (p.consumption <= 0) warnings.push('При нулевом потреблении срок K₀/k не определён.');
        return {
          metrics: [metric('accumulation', 'Накопление за период', a), metric('deltaC', 'Изменение постоянной части', dc), metric('deltaV', 'Изменение переменной части', dv), metric('capitalEnd', 'Капитал по линейному плану', endpoint), metric('equivalentPeriods', 'Срок потребления эквивалента K₀', ratio(p.initial, p.consumption), 'период')],
          notes: ['K₀/k — срок, за который потреблён доход, равный первоначальному капиталу; это не бухгалтерская амортизация и не доказательство исчезновения его физических средств.', 'Изменение нормы прибыли из-за накопления не моделируется; для сложного роста есть отдельная модель.'], warnings
        };
      },
      plot: { x: 'consumption', y: 'accumulation', label: 'Накопление как остаток после личного потребления' }
    }),

    model({
      id: 'advanced-compound-growth', group: 10,
      title: 'Сложные проценты и ежегодные взносы',
      description: 'Геометрический расчёт обязательств не равен доказанному закону роста реального производства.',
      formula: String.raw`S=K_0(1+i)^T+d\frac{(1+i)^T-1}{i}`, formulaIds: ['F078', 'F049'], relatedIds: ['F087'],
      fields: [
        cash('initial', 'Начальная сумма', 'K_0', 100, 'Первоначальный вклад до первого начисления процентов.'),
        percent('rate', 'Процент за период', 'i', 10, 'Постоянная ставка; при нуле используется точный предел K₀ + dT.', -100, 100),
        { ...field('periods', 'Число периодов', 'T', 'период', 5, 0, 100, 1, 'Для годовых взносов требуется целое число периодов.'), integer: true },
        cash('deposit', 'Взнос в конце каждого периода', 'd', 0, 'Новый взнос не получает процент в год своего внесения.')
      ],
      presets: [{ label: '100 при 10% за 5 лет', values: { initial: 100, rate: 10, periods: 5, deposit: 0 } }, { label: 'Амортизационный фонд: 100 ежегодно', values: { initial: 0, rate: 5, periods: 10, deposit: 100 } }],
      compute(p) {
        const i = p.rate / 100, valid = i > -1 && p.periods >= 0 && Number.isInteger(p.periods);
        const growth = valid ? Math.pow(1 + i, p.periods) : null;
        const annuity = !valid ? null : i === 0 ? p.periods : Math.expm1(p.periods * Math.log1p(i)) / i;
        const end = !valid ? null : p.initial * growth + p.deposit * annuity;
        const principal = p.initial + p.deposit * p.periods;
        const warnings = [];
        if (!valid) warnings.push('Для этой дискретной модели T — неотрицательное целое, ставка должна быть больше −100%. При нарушении результат не определён.');
        if (end !== null && !finite(end)) warnings.push('Конечная сумма превышает представимый числовой диапазон.');
        return {
          metrics: [metric('final', 'Конечная сумма', end), metric('principal', 'Внесённые собственные средства', principal), metric('interestEarned', 'Начисленный доход или убыток', end === null ? null : end - principal), metric('growth', 'Множитель первоначального вклада', growth, 'раз')],
          notes: ['Все проценты реинвестируются; ставка, возможность займа и своевременное исполнение платежей предполагаются, а не доказываются.', 'Для фонда 100 ежегодно при 5% за 10 лет точный итог 1257,789253…; исторический ошибочный итог 1252 фунта 11 шиллингов не используется как вычислительное правило.'], warnings
        };
      },
      plot: { x: 'periods', y: 'final', label: 'Геометрическая сумма при целых периодах' }
    }),

    model({
      id: 'advanced-social-funds', group: 13,
      title: 'Общественный продукт и фонды',
      description: 'Все вычеты показаны явно. Отрицательный фонд личного потребления означает несовместимый план, а не автоматически исправленный остаток.',
      formula: String.raw`B=Q-R-E-S-A-H-U`, formulaIds: ['F098'], relatedIds: ['F099', 'F088'],
      fields: [
        cash('product', 'Совокупный общественный продукт', 'Q', 1000, 'Условная единая учётная мера, не сумма несовместимых физических товаров.'),
        cash('replacement', 'Возмещение средств производства', 'R', 300, 'Не является личным доходом производителя.'),
        cash('expansion', 'Расширение производства', 'E', 100, 'Фонд добавочных средств производства.'),
        cash('reserve', 'Резерв и страхование', 'S', 50, 'Покрытие случайностей и нарушений воспроизводства.'),
        cash('administration', 'Общие издержки управления', 'A', 50, 'Не относятся непосредственно к производству.'),
        cash('commonNeeds', 'Общие потребности', 'H', 100, 'Например, образование и здравоохранение.'),
        cash('support', 'Поддержка нетрудоспособных', 'U', 50, 'Общественная поддержка вне индивидуального трудового начисления.')
      ].map(item => ({ ...item, unit: 'учётных ед.' })),
      presets: [{ label: 'Сбалансированный фонд 350', values: { product: 1000, replacement: 300, expansion: 100, reserve: 50, administration: 50, commonNeeds: 100, support: 50 } }, { label: 'Вычеты превышают продукт', values: { product: 500, replacement: 300, expansion: 100, reserve: 50, administration: 50, commonNeeds: 100, support: 50 } }],
      compute(p) {
        const deductions = p.replacement + p.expansion + p.reserve + p.administration + p.commonNeeds + p.support;
        const personal = p.product - deductions;
        return {
          metrics: [metric('personal', 'Фонд личного потребления', personal, 'учётных ед.'), metric('deductions', 'Все вычеты', deductions, 'учётных ед.'), metric('personalShare', 'Доля личного фонда', pct(personal, p.product), '%')],
          bars: nonnegativeBars([bar('Воспроизводство, расширение, резерв', p.replacement + p.expansion + p.reserve, 'blue'), bar('Общие нужды и поддержка', p.administration + p.commonNeeds + p.support, 'gold'), bar('Личный фонд', personal, 'red')]), barUnit: 'учётных ед.',
          notes: ['Числа — учебный план, не предложенные Марксом нормативы распределения.', 'Единая учётная мера здесь не доказывает существование товарного обмена при непосредственно общественном производстве.'],
          warnings: personal < 0 ? ['Вычеты больше продукта. План содержит дефицит личного фонда; диаграмма положительного распределения не строится.'] : []
        };
      },
      plot: { x: 'commonNeeds', y: 'personal', label: 'Личный фонд при изменении общего фонда потребностей' }
    }),

    model({
      id: 'advanced-labour-receipt', group: 13,
      title: 'Трудовая квитанция и общественный вычет',
      description: 'Квитанция соответствует труду после вычета в общие фонды, а не всей массе валового продукта.',
      formula: String.raw`b=l-f,\quad q=b/\tau,\quad \tau q=b`, formulaIds: ['F099'], relatedIds: ['F098'],
      fields: [
        field('labour', 'Общественно учитываемый вклад', 'l', 'ч', 8, 0, 1000, 0.5, 'Уже приведённый трудовой вклад; механизм редукции не моделируется.'),
        field('commonLabour', 'Часть труда в пользу общих фондов', 'f', 'ч', 2, 0, 1000, 0.5, 'Заданный вычет, не автоматически выведенная справедливая доля.'),
        field('unitLabour', 'Учтённый труд на единицу блага', '\\tau', 'ч/шт.', 2, 0, 100, 0.25, 'Общественная трудовая оценка одного однородного блага.')
      ],
      presets: [{ label: '8 часов минус 2: три блага по 2 часа', values: { labour: 8, commonLabour: 2, unitLabour: 2 } }, { label: 'Вычет больше вклада', values: { labour: 4, commonLabour: 6, unitLabour: 2 } }],
      compute(p) {
        const receipt = p.labour - p.commonLabour;
        const quantity = receipt >= 0 ? ratio(receipt, p.unitLabour) : null;
        const warnings = [];
        if (receipt < 0) warnings.push('Вычет превышает вклад: отрицательный остаток показан, но отрицательное количество выдаваемых благ не считается квитанцией.');
        if (p.unitLabour <= 0) warnings.push('При нулевой трудовой оценке единицы количество благ из этой формулы не определено.');
        return {
          metrics: [metric('receipt', 'Остаток трудового вклада', receipt, 'ч'), metric('quantity', 'Количество благ по квитанции', quantity, 'шт.'), metric('commonShare', 'Доля общих фондов во вкладе', pct(p.commonLabour, p.labour), '%')],
          flow: [`Учтено ${fmt(p.labour)} ч`, `Общий фонд ${fmt(p.commonLabour)} ч`, `Остаток ${fmt(receipt)} ч`, `Выдача ${fmt(quantity)} шт.`],
          notes: ['Непосредственный трудовой учёт не отождествляется здесь с товарной стоимостью и рыночной ценой.', 'Дробные количества означают делимое однородное благо; для неделимых предметов необходима дополнительная процедура.'], warnings
        };
      },
      plot: { x: 'commonLabour', y: 'receipt', label: 'Трудовой остаток при изменении общественного вычета' }
    }),

    model({
      id: 'advanced-proudhon-percent', group: 14,
      title: 'Прудон: процент, сумма и число участников',
      description: 'Обе процентные суммы считаются на одну явно указанную базу. Скорость перевозки не превращается автоматически в прибыль.',
      formula: String.raw`K=Na,\quad G=K g,\quad L=K\ell,\quad R=G-L`, formulaIds: ['F100'], relatedIds: ['F101'],
      fields: [
        field('participants', 'Число участников', 'N', 'чел.', 1000000, 0, 10000000, 1, 'Целое число; доля на человека не определена при нуле.'),
        field('contribution', 'Вклад одного участника', 'a', 'франков/чел.', 1, 0, 1000, 0.1, 'Из него формируется общая база процентов.'),
        percent('gainRate', 'Принятая прибыль на капитал', 'g', 400, '400% означает четыре исходных капитала прибыли, а не итоговый капитал 4K.', 0, 1000),
        percent('lossRate', 'Потеря на ту же базу', '\\ell', 33, '33% — не 33 франка с каждого франка.', 0, 1000)
      ],
      presets: [{ label: 'Маркс: 4 млн − 330 тыс.', values: { participants: 1000000, contribution: 1, gainRate: 400, lossRate: 33 } }, { label: 'Потеря больше прибыли', values: { participants: 1000, contribution: 1, gainRate: 20, lossRate: 33 } }],
      compute(p) {
        const capital = p.participants * p.contribution, gain = capital * p.gainRate / 100, loss = capital * p.lossRate / 100;
        const net = gain - loss, warnings = [];
        if (p.participants <= 0) warnings.push('При нуле участников деление на человека не определено.');
        if (!Number.isInteger(p.participants)) warnings.push('Дробное число участников не соответствует буквальному примеру с людьми.');
        if (net < 0) warnings.push('Потери превышают прибыль: чистый результат отрицателен.');
        return {
          metrics: [metric('capital', 'Общественный капитал', capital, 'франков'), metric('gain', 'Прибыль', gain, 'франков'), metric('loss', 'Потеря', loss, 'франков'), metric('net', 'Чистый результат', net, 'франков'), metric('perPerson', 'Чистый результат на человека', ratio(net, p.participants), 'франков/чел.')],
          notes: ['Это исправленный полемический расчёт. Параметр 400% — допущение спора, а не закон производительности транспорта.', 'Чистый результат здесь не включает возврат первоначального капитала; итог с капиталом был бы K + G − L.'], warnings
        };
      },
      plot: { x: 'lossRate', y: 'net', label: 'Общественный итог при изменении процента потерь' }
    }),

    model({
      id: 'advanced-markup-not-value', group: 14,
      title: 'Сумма надбавок — не мера потребительной стоимости',
      description: 'Вычисляется только денежная сумма чужой полемической схемы; она не получает автоматически название стоимости или полезности.',
      formula: String.raw`P=a+b+c`, formulaIds: ['F101'], relatedIds: ['F063', 'F075'],
      fields: [
        cash('cost', 'Фабричные издержки', 'a', 100, 'В источнике ошибочно названы всей действительной стоимостью.'),
        cash('factoryMarkup', 'Фабричная надбавка суммой', 'b', 20, 'Денежная сумма, НЕ процент.'),
        cash('tradeMarkup', 'Торговые надбавки суммой', 'c', 10, 'Здесь c — надбавка, не постоянный капитал.')
      ],
      presets: [{ label: '100 + 20 + 10', values: { cost: 100, factoryMarkup: 20, tradeMarkup: 10 } }, { label: 'Нулевые надбавки', values: { cost: 100, factoryMarkup: 0, tradeMarkup: 0 } }],
      compute(p) {
        const markup = p.factoryMarkup + p.tradeMarkup;
        return {
          metrics: [metric('price', 'Денежная сумма издержек и надбавок', p.cost + markup), metric('markup', 'Сумма надбавок', markup), metric('markupRate', 'Надбавки / издержки', pct(markup, p.cost), '%')],
          bars: nonnegativeBars([bar('Издержки', p.cost, 'blue'), bar('Фабричная надбавка', p.factoryMarkup, 'red'), bar('Торговая надбавка', p.tradeMarkup, 'gold')]), barUnit: money,
          notes: ['Формула цитируется Марксом для критики чужой статьи. Денежная продажная сумма не тождественна качественной потребительной стоимости.', 'Происхождение прибыли, трудовая стоимость и достижимость такой цены этим сложением не объясняются.'],
          warnings: p.cost <= 0 ? ['Процент надбавки на нулевые издержки не определён; сама денежная сумма остаётся вычислимой.'] : []
        };
      },
      plot: { x: 'tradeMarkup', y: 'price', label: 'Денежная сумма при изменении торговой надбавки' }
    })
  ];

  globalThis.LAB_MODELS = (globalThis.LAB_MODELS || []).concat(models);
})();
