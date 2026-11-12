/* Арифметический аудит воспроизведений писем; происхождение разночтений не установлено. */
(function () {
  'use strict';

  const field = (key, label, symbol, unit, value, min, max, step, hint) =>
    ({ key, label, symbol, unit, value, min, max, step, hint });
  const metric = (key, label, value, unit, hint = '') =>
    ({ key, label, value: Number.isFinite(value) ? value : null, unit, hint });
  const shown = (value) => Number.isFinite(value) ? Number(value.toFixed(6)) : 'не определено';
  const checked = (definition) => {
    const calculate = definition.compute;
    return {
      ...definition,
      compute(p) {
        const errors = definition.fields.filter((f) =>
          !Number.isFinite(p[f.key]) || p[f.key] < f.min || p[f.key] > f.max);
        if (errors.length) {
          const defaults = Object.fromEntries(definition.fields.map((f) => [f.key, f.value]));
          const example = calculate(defaults);
          return {
            metrics: example.metrics.map((item) => ({ ...item, value: null })),
            notes: example.notes,
            warnings: errors.map((f) => `${f.label}: требуется конечное число от ${f.min} до ${f.max}.`)
          };
        }
        return calculate(p);
      }
    };
  };

  const models = [
    checked({
      id: 'audit-depreciation-repairs', group: 8,
      title: 'Два года износа: ремонт и разночтение 306/307',
      description: 'Пересчитайте таблицу письма 4 марта 1858 года. Капитализированный ремонт расширяет базу следующего списания; исторические строки показаны отдельно.',
      formula: String.raw`F_1=F_0(1-\delta)+R_1,\quad d_2=\delta(F_0+R_1),\quad F_2=F_1-d_2+R_2`,
      formulaIds: ['F048'], relatedIds: [],
      fields: [
        field('initial', 'Первоначальная стоимость', 'F₀', 'ф. ст.', 10000, 0, 1000000, 100, 'База первого списания; £1 = 20 шиллингов.'),
        field('rate', 'Годовое списание', 'δ', '%', 7.5, 0, 100, 0.5, 'Процент от первоначальной стоимости с добавлением ранее капитализированных ремонтов, а не от остатка.'),
        field('repair1', 'Ремонт первого года', 'R₁', 'ф. ст.', 100, 0, 100000, 0.5, 'Добавляется к балансу после первого списания и к базе второго списания.'),
        field('repair2', 'Ремонт второго года', 'R₂', 'ф. ст.', 306.5, 0, 100000, 0.5, '306,5 = £306 10 шилл. в русском PDF; 307,5 — в цифровой IA-реконструкции MEGA² III/9.')
      ],
      presets: [
        { label: 'Русский PDF: второй ремонт £306 10s', values: { initial: 10000, rate: 7.5, repair1: 100, repair2: 306.5 } },
        { label: 'IA-воспроизведение: второй ремонт £307 10s', values: { initial: 10000, rate: 7.5, repair1: 100, repair2: 307.5 } },
        { label: 'Неизменная база, без ремонта', values: { initial: 10000, rate: 7.5, repair1: 0, repair2: 0 } }
      ],
      compute(p) {
        const rate = p.rate / 100;
        const depreciation1 = rate * p.initial;
        const balance1 = p.initial - depreciation1 + p.repair1;
        const base2 = p.initial + p.repair1;
        const depreciation2 = rate * base2;
        const beforeRepair2 = balance1 - depreciation2;
        const balance2 = beforeRepair2 + p.repair2;
        return {
          metrics: [
            metric('depreciation1', 'Списание первого года', depreciation1, 'ф. ст.'),
            metric('balance1', 'Баланс после первого ремонта', balance1, 'ф. ст.'),
            metric('base2', 'База второго списания', base2, 'ф. ст.', 'Первоначальная стоимость плюс первый ремонт; это не остаточная балансовая стоимость.'),
            metric('depreciation2', 'Списание второго года', depreciation2, 'ф. ст.'),
            metric('beforeRepair2', 'Остаток до второго ремонта', beforeRepair2, 'ф. ст.'),
            metric('balance2', 'Баланс после второго ремонта', balance2, 'ф. ст.'),
            metric('linearYears', 'Условный линейный срок без добавлений', rate > 0 && p.initial > 0 ? 1 / rate : null, 'лет', 'Только для положительной неизменной первоначальной базы; не срок исчерпания баланса с ремонтами.')
          ],
          flow: [
            `£${shown(p.initial)} − £${shown(depreciation1)} + £${shown(p.repair1)} = £${shown(balance1)}`,
            `Второе списание: ${shown(p.rate)}% × £${shown(base2)} = £${shown(depreciation2)}`,
            `£${shown(balance1)} − £${shown(depreciation2)} + £${shown(p.repair2)} = £${shown(balance2)}`
          ],
          table: {
            columns: ['Фиксированный исторический вариант', 'Ремонт 2, £', 'Воспроизведённый остаток, £', 'Верный остаток, £', 'Воспроизведённый итог, £', 'Сумма последних строк, £', 'Полный верный пересчёт, £'],
            rows: [
              ['Русский т. 29, с. 239; онлайн-транскрипция MECW 40', 306.5, 8593.5, 8592.5, 8900, 8593.5 + 306.5, 9350 - 757.5 + 306.5],
              ['Цифровое TEXT-воспроизведение MEGA² III/9, с. 90, IA', 307.5, 8593.5, 8592.5, 8900, 8593.5 + 307.5, 9350 - 757.5 + 307.5]
            ]
          },
          notes: [
            'Современная символизация двух шагов таблицы, а не буквальная авторская формула. Метод с остаточной базой — другой расчёт, не исправление арифметики этих строк.',
            'Таблица исторических разночтений фиксирована: она не меняется вместе с полями. Все её суммы переведены в десятичные фунты: 10 шиллингов = £0,5, а не £0,10.',
            'При исходных данных 9350 − 757,5 = 8592,5. Русские последние строки складываются в 8900, но полный пересчёт даёт 8899; IA-строки складываются в 8901, а полный пересчёт даёт 8900.',
            'Ни 306,5, ни 307,5 не объявляется доказанным авторским чтением. Просмотрена цифровая текстовая реконструкция MEGA, не надёжный растровый скан; upstream OCR не исключён, автограф и аппарат не проверены.',
            '13⅓ года при 7,5% — точная арифметика неизменной базы без добавлений. Разночтения 13, 13½ и повреждённое 13Vi в IA не приписываются автору.'
          ],
          warnings: [
            ...(rate === 0 ? ['При нулевом списании конечный срок возмещения не определён.'] : []),
            ...(p.initial === 0 ? ['При нулевой первоначальной стоимости условный срок её списания не определён.'] : []),
            ...(beforeRepair2 < 0 ? ['Второе списание превышает имеющийся баланс до ремонта. Отрицательный остаток сохранён; простая двухшаговая схема здесь не является допустимой бухгалтерской оценкой без дополнительных правил.'] : [])
          ]
        };
      },
      plot: { x: 'repair2', y: 'balance2', label: 'Второй ремонт и арифметически согласованный итог' }
    }),
    checked({
      id: 'audit-rent-units', group: 11,
      title: 'Рента: квартер или бушель?',
      description: 'Сопоставьте буквальное чтение единиц письма 7 января 1851 года с двумя разными исправлениями. Одинаковые числа не доказывают одинаковый физический смысл.',
      formula: String.raw`R_{букв}=qP/8-k,\qquad R_{единицы\ согласованы}=qP-k,\qquad1\;quarter=8\;bushels`,
      formulaIds: ['F081'], relatedIds: [],
      fields: [
        field('yield0', 'Первоначальный урожай: число', 'q₀', 'буш. / кварт.', 20, 0, 10000, 1, 'В буквальном тексте и первом исправлении — бушели; во втором исправлении это же число означает квартеры.'),
        field('yield1', 'Новый урожай: число', 'q₁', 'буш. / кварт.', 30, 0, 10000, 1, 'Две поправки отличаются физической величиной урожая, хотя дают одинаковый численный результат.'),
        field('price0', 'Первоначальная цена: число', 'P₀', 'шилл./кварт. или буш.', 7, 0, 1000, 0.5, 'Буквально — за квартер; в первой поправке — за бушель.'),
        field('price1', 'Новая цена: число', 'P₁', 'шилл./кварт. или буш.', 5, 0, 1000, 0.5, 'Во второй поправке цена остаётся ценой за квартер, но урожай переобозначен в квартерах.'),
        field('cost', 'Издержки, включая обычную прибыль', 'k', 'шилл.', 130, 0, 10000000, 1, 'Одинаковая денежная сумма для обоих состояний; не делится на восемь при переводе мер зерна.')
      ],
      presets: [
        { label: 'Лучший участок: 20 × 7 → 30 × 5', values: { yield0: 20, yield1: 30, price0: 7, price1: 5, cost: 130 } },
        { label: 'Худший участок: 26 × 5', values: { yield0: 26, yield1: 26, price0: 5, price1: 5, cost: 130 } },
        { label: 'Цена падает, урожай не растёт', values: { yield0: 20, yield1: 20, price0: 7, price1: 5, cost: 130 } }
      ],
      compute(p) {
        const literalRevenue0 = p.yield0 * p.price0 / 8;
        const literalRevenue1 = p.yield1 * p.price1 / 8;
        const alignedRevenue0 = p.yield0 * p.price0;
        const alignedRevenue1 = p.yield1 * p.price1;
        const literalRent0 = literalRevenue0 - p.cost;
        const literalRent1 = literalRevenue1 - p.cost;
        const alignedRent0 = alignedRevenue0 - p.cost;
        const alignedRent1 = alignedRevenue1 - p.cost;
        return {
          metrics: [
            metric('literalRevenue0', 'Буквальные единицы: выручка до', literalRevenue0, 'шилл.'),
            metric('literalRevenue1', 'Буквальные единицы: выручка после', literalRevenue1, 'шилл.'),
            metric('literalRent0', 'Буквальные единицы: остаток до', literalRent0, 'шилл.', 'Отрицательный остаток — дефицит относительно издержек с обычной прибылью, не положительная рента.'),
            metric('literalRent1', 'Буквальные единицы: остаток после', literalRent1, 'шилл.'),
            metric('literalChange', 'Изменение буквального остатка', literalRent1 - literalRent0, 'шилл.'),
            metric('alignedRent0', 'Каждая из двух явных поправок: остаток до', alignedRent0, 'шилл.'),
            metric('alignedRent1', 'Каждая из двух явных поправок: остаток после', alignedRent1, 'шилл.'),
            metric('alignedChange', 'Изменение остатка при каждой поправке', alignedRent1 - alignedRent0, 'шилл.')
          ],
          table: {
            columns: ['Интерпретация', 'Урожай q', 'Цена P', 'Выручка до, шилл.', 'Выручка после, шилл.', 'Остаток до, шилл.', 'Остаток после, шилл.'],
            rows: [
              ['Буквальные единицы: qP/8 − k', 'бушели', 'шиллинги за квартер', literalRevenue0, literalRevenue1, literalRent0, literalRent1],
              ['Поправка 1: меняем единицу цены, qP − k', 'бушели', 'шиллинги за бушель', alignedRevenue0, alignedRevenue1, alignedRent0, alignedRent1],
              ['Поправка 2: меняем единицу урожая, qP − k', 'квартеры', 'шиллинги за квартер', alignedRevenue0, alignedRevenue1, alignedRent0, alignedRent1]
            ]
          },
          notes: [
            'Современная запись числового примера. Один квартер равен восьми бушелям; при цене за квартер урожай в бушелях сначала делится на восемь.',
            'Обе поправки восстанавливают числа письма, но означают разные урожаи и разные цены. Ни одна не выбрана как доказанное авторское намерение; скрытой нормализации единиц нет.',
            'Смешение Qr/Quarter и Bush/bushel прочитано в цифровом TEXT-воспроизведении MEGA² III/4, с. 9 / PDF 21, а также в других публикациях. Upstream OCR не исключён; спорные единицы автографа надёжно не прочитаны, критический аппарат не проверен.',
            'При фиксированных издержках остаток растёт тогда и только тогда, когда растёт выручка. Падение цены само по себе не запрещает роста ренты при достаточном увеличении урожая.'
          ],
          warnings: [
            ...(literalRent0 < 0 || literalRent1 < 0 ? ['Буквальное чтение даёт отрицательный остаток хотя бы в одном состоянии: это дефицит относительно издержек с обычной прибылью. Значение не обнулено.'] : []),
            ...(alignedRent0 < 0 || alignedRent1 < 0 ? ['При обеих поправках остаток хотя бы в одном состоянии также отрицателен; это не положительная рента.'] : [])
          ]
        };
      },
      plot: { x: 'yield1', y: 'literalRent1', label: 'Урожай в бушелях и остаток при цене за квартер' }
    })
  ];

  globalThis.LAB_MODELS = (globalThis.LAB_MODELS || []).concat(models);
}());
