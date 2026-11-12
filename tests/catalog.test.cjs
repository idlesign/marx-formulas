const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const stand = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(stand, '..', '0formulas.md'), 'utf8');
const generated = fs.readFileSync(path.join(stand, 'catalog.js'), 'utf8');
const context = {};
vm.runInNewContext(generated, context, { filename: 'catalog.js' });
const catalog = JSON.parse(JSON.stringify(context.FORMULA_CATALOG));

function cleanMarkdownBatch(items) {
  const result = spawnSync('python3', ['-c',
    'import json, runpy, sys; m = runpy.run_path(sys.argv[1]); '
    + 'print(json.dumps([m["clean_markdown"](item) for item in json.load(sys.stdin)], ensure_ascii=False))',
    path.join(stand, 'scripts', 'build-catalog.py')], {
    input: JSON.stringify(items), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const headings = [...source.matchAll(/^#{1,3} .+$/gm)];
const cleanedBodies = cleanMarkdownBatch(headings.map((heading, index) => source.slice(
  heading.index + heading[0].length,
  headings[index + 1]?.index ?? source.length,
)));
const sections = headings.map((heading, index) => ({
  heading: heading[0],
  start: heading.index,
  markdown: cleanedBodies[index],
}));

test('classic script loads without fetch, import, DOM or other browser globals', () => {
  assert.ok(catalog);
  assert.deepEqual(Object.keys(context), ['FORMULA_CATALOG']);
  assert.deepEqual(Object.keys(catalog).sort(),
    ['groups', 'formulas', 'translations', 'intro', 'scope', 'assessmentScale', 'assessmentMethod'].sort());
});

test('catalog has all consecutive formula, group and translation IDs', () => {
  assert.equal(catalog.formulas.length, 101);
  assert.equal(catalog.groups.length, 14);
  assert.equal(catalog.translations.length, 7);
  assert.deepEqual(catalog.formulas.map(item => item.id),
    Array.from({ length: 101 }, (_, index) => `F${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(catalog.groups.map(item => item.id),
    Array.from({ length: 14 }, (_, index) => index + 1));
  assert.deepEqual(catalog.translations.map(item => item.id),
    Array.from({ length: 7 }, (_, index) => `TR-${String(index + 1).padStart(2, '0')}`));
  for (const group of catalog.groups) {
    assert.ok(group.title.length > 0);
    assert.ok(catalog.formulas.some(formula => formula.group === group.id));
  }
});

test('every formula preserves its exact body, sources and assessment, without adjacent sections', () => {
  let group = null;
  for (const section of sections) {
    const groupMatch = section.heading.match(/^## (\d+)\. (.+)$/);
    if (groupMatch) {
      group = Number(groupMatch[1]);
      assert.equal(catalog.groups.find(item => item.id === group).title, groupMatch[2]);
    }
    const match = section.heading.match(/^### (F\d{3})\. (.+)$/);
    if (!match) continue;
    const formula = catalog.formulas.find(item => item.id === match[1]);
    assert.equal(formula.title, match[2]);
    assert.equal(formula.group, group);
    assert.equal(formula.markdown, section.markdown, `${formula.id} body differs`);
    assert.match(formula.markdown, /Математическое противоречие/);
    assert.match(formula.markdown, /(?:Источник|Работ)/);
    assert.doesNotMatch(formula.markdown, /^#{1,3} |<a\b/gm);
    assert.ok(formula.searchText.includes(formula.id.toLowerCase()));
    assert.ok(formula.searchText.includes(formula.title.toLowerCase()));
    assert.ok(formula.searchText.includes('математическое противоречие'));
  }
});

test('translation bodies are complete and TR-07 does not swallow the source-critical caveat', () => {
  for (const translation of catalog.translations) {
    const section = sections.find(item => item.heading.startsWith(`### ${translation.id}. `));
    assert.equal(translation.title, section.heading.slice(`### ${translation.id}. `.length));
    assert.equal(translation.markdown, section.markdown);
    assert.doesNotMatch(translation.markdown, /^#{1,3} |<a\b/gm);
  }
  assert.doesNotMatch(catalog.translations[6].markdown, /### Источниковедческое ограничение/);
  assert.match(catalog.scope, /### Источниковедческое ограничение/);
});

test('intro and scope preserve all text outside the thematic and translation entries', () => {
  const firstGroup = sections.findIndex(item => /^## 1\. /.test(item.heading));
  assert.equal(catalog.intro, cleanMarkdownBatch([source.slice(0, sections[firstGroup].start)])[0]);
  const tail = sections.slice(firstGroup).filter(item =>
    !/^## \d+\. /.test(item.heading) && !/^### (?:F\d{3}|TR-\d{2})\. /.test(item.heading));
  assert.equal(catalog.scope, tail.map(item => item.markdown
    ? `${item.heading}\n\n${item.markdown}` : item.heading).join('\n\n'));
  for (const phrase of [
    'Ниже — семь проверенных мест',
    '## Указатель существенных математических расхождений',
    '## Охват и реестр источников',
    '### Обследованные цифровые копии',
    '### Внешние первичные и критические источники',
    'Дата составления и внешней сверки',
  ]) assert.ok(catalog.scope.includes(phrase), phrase);
});

test('published sources use edition and volume labels, never PDF names or download links', () => {
  const body = [catalog.intro, ...catalog.formulas.map(item => item.markdown),
    ...catalog.translations.map(item => item.markdown), catalog.scope].join('\n');
  assert.doesNotMatch(body, /\]\(\/(?:home|Users|tmp)\//);
  assert.doesNotMatch(body, /<a\b/);
  assert.doesNotMatch(body, /tom_\d+(?:_[IVX]+)?\.pdf/i);
  assert.doesNotMatch(body, /\]\([^)]*\.pdf(?:[#?][^)]*)?\)/i);
  assert.doesNotMatch(body, /(?:https?:\/\/|file:\/)[^\s<>]+\.pdf/i);
  assert.doesNotMatch(body, /\]\([^)]*0formulas\.md(?:[#?][^)]*)?\)/);
  assert.match(body, /Маркс, Энгельс\. Сочинения, 2-е изд\., т\. 31 \(цифровая копия, с\. 294\)/);
  assert.match(body, /Маркс, Энгельс\. Сочинения, 2-е изд\., т\. 25, ч\. I/);
  assert.match(body, /Маркс, Энгельс\. Сочинения, 2-е изд\., т\. 26, ч\. III/);
  assert.match(body, /\]\(#tr-0[1-7]\)/);
  const externalLinks = text => [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)]
    .map(match => match[1]).filter(url => !/\.pdf(?:$|[?#])/i.test(decodeURIComponent(url))).sort();
  assert.deepEqual(externalLinks(body), externalLinks(source));
});

test('source references use clear digital-copy wording and a short completeness caveat', () => {
  const body = [catalog.intro, ...catalog.formulas.map(item => item.markdown), catalog.scope].join('\n');
  assert.doesNotMatch(body, /локальн(?:ом|ого) (?:текст|воспроизведени|PDF)/i);
  assert.doesNotMatch(body, /Результат сплошного поиска|формулы-картинки/);
  assert.match(catalog.scope, /Поиск по тексту мог пропустить формулы на изображениях, поэтому каталог может быть неполным\./);
  assert.match(catalog.scope, /Важные рисунки и дроби проверены по сканам\./);
});

test('generator is deterministic, cwd-independent, and emits UTF-8 LF with final newline', () => {
  const result = spawnSync('python3', [path.join(stand, 'scripts', 'build-catalog.py'), '--check'], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /101 formulas, 14 groups, 7 translation notes/);
  assert.ok(generated.endsWith('\n'));
  assert.doesNotMatch(generated, /\r|[\t ]+$/m);
  assert.match(generated, /Стоимость/);
});

test('bibliographic cleanup preserves edition parts, page ranges, fragments and non-PDF links', () => {
  const examples = [
    ['[PDF](/different/location/tom_25_II.pdf#page=120)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 25, ч. II (цифровая копия, с. 120)'],
    ['[PDF, с. 378–379](../tom_31.pdf#page=378)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 31 (цифровая копия, с. 378–379)'],
    ['[цифровая копия, с. 378–379](../tom_31.pdf#page=378)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 31 (цифровая копия, с. 378–379)'],
    ['[цифровое воспроизведение, с. 378–379](../tom_31.pdf#page=378)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 31 (цифровое воспроизведение, с. 378–379)'],
    ['[tom_26_III.pdf](/a/tom_26_III.pdf)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 26, ч. III'],
    ['[Т. 1](/a/tom_01.pdf), с. 552–553 / PDF 574–575.',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 1, с. 552–553 / PDF 574–575.'],
    ['[PDF MEGA, с. 1–2](https://megadigital.bbaw.de/store/M0000618.pdf)', 'MEGA, с. 1–2'],
    ['[MEGA² III/9, с. 90](https://archive.org/download/a/MEGA%C2%B2%20III.9%20%28Text%29.pdf#page=105)',
      'MEGA² III/9, с. 90 (страница цифровой копии: 105)'],
    ['[Капитал, с. 77](/a/tom_25_I.pdf#page=85)',
      'Маркс, Энгельс. Сочинения, 2-е изд., т. 25, ч. I (Капитал, с. 77; страница цифровой копии: 85)'],
    ['[external edition](https://example.org/tom_25_II.pdf#page=120)',
      'external edition (страница цифровой копии: 120)'],
    ['[PDF](https://example.org/MEGA%C2%B2%20II.1.2%20(Text).pdf#page=241)',
      'MEGA², II/1.2 (страница цифровой копии: 241)'],
    ['[catalog](/home/idlesign/dev/lit/pd/mar/0formulas.md#f001)', '[catalog](#f001)'],
    ['[catalog](../0formulas.md)', 'catalog'],
    ['[note](#tr-07)', '[note](#tr-07)'],
    ['[MEGA](https://example.org/detail?id=42)', '[MEGA](https://example.org/detail?id=42)'],
    ['Указатель: `tom_25_I.pdf`.', 'Указатель: `Маркс, Энгельс. Сочинения, 2-е изд., т. 25, ч. I`.'],
    ['<https://example.org/MEGA-II.2.pdf#page=90>', 'MEGA², II/2 (страница цифровой копии: 90)'],
    ['https://example.org/MEGA-II.2.pdf#page=90', 'MEGA², II/2 (страница цифровой копии: 90)'],
  ];
  assert.deepEqual(cleanMarkdownBatch(examples.map(([input]) => input)), examples.map(([, output]) => output));
});

test('bibliographic cleanup is idempotent and does not rewrite formula math or quoted wording', () => {
  const input = '**Формула:** $R=qP-k$; «a=b+c»; $\\frac{m}{v}$.\n\n'
    + '[PDF, с. 10–12](/a/tom_25_I.pdf#page=10) и [сноска](#f081).';
  const first = cleanMarkdownBatch([input])[0];
  assert.match(first, /\*\*Формула:\*\* \$R=qP-k\$; «a=b\+c»; \$\\frac\{m\}\{v\}\$\./);
  assert.equal(cleanMarkdownBatch([first])[0], first);
});
