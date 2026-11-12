/* Local-only interactive reader and laboratory. No network requests or telemetry. */
(() => {
  'use strict';

  const catalog = globalThis.FORMULA_CATALOG;
  const models = globalThis.LAB_MODELS || [];
  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  if (!catalog || !models.length) {
    $('validation').textContent = 'Не удалось загрузить каталог или модели. Проверьте, что все файлы папки stand находятся рядом с index.html.';
    return;
  }
  const formulas = new Map(catalog.formulas.map((f) => [f.id, f]));
  const translations = new Map(catalog.translations.map((f) => [f.id, f]));
  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const modelMap = new Map(models.map((m) => [m.id, m]));
  const shortGroups = [
    'Труд и стоимость', 'Формы стоимости', 'Деньги и цены', 'Кругообороты капитала',
    'Рабочая сила и зарплата', 'Прибавочная стоимость', 'Машины и экономия',
    'Оборот и износ', 'Прибыль и цены производства', 'Торговля и процент',
    'Земельная рента', 'Накопление и воспроизводство', 'Общественные фонды', 'Полемика с Прудоном'
  ];
  const colors = {blue:'#2449a4',red:'#ad4435',green:'#24714f',orange:'#91610c',purple:'#7154a4',gray:'#64718b',teal:'#167980'};
  const numberFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:4});
  function fmt(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'не определено';
    if (value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e10)) return value.toExponential(3).replace('.', ',');
    return numberFormat.format(Object.is(value, -0) ? 0 : value);
  }
  function tickFmt(value) {
    return Math.abs(value) >= 100000 || (value !== 0 && Math.abs(value) < 0.001) ? value.toExponential(1).replace('.', ',') : new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2}).format(value);
  }
  function parse(raw) {
    const str = String(raw).trim().replace(',', '.');
    return str && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(str) && Number.isFinite(Number(str)) ? Number(str) : null;
  }
  function readParams(model, raw) {
    const values = {}, errors = {};
    model.fields.forEach((field) => {
      const n = parse(raw[field.key]);
      if (n === null) errors[field.key] = 'Введите конечное число.';
      else if (n < field.min || n > field.max) errors[field.key] = `Допустимый диапазон: ${fmt(field.min)}–${fmt(field.max)}.`;
      else if (field.integer && !Number.isInteger(n)) errors[field.key] = 'Нужно целое число.';
      else values[field.key] = n;
    });
    return {values, errors, valid:!Object.keys(errors).length};
  }
  const defaults = (model) => Object.fromEntries(model.fields.map((f) => [f.key, f.value]));
  const strings = (obj) => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k,String(v)]));
  const initialModel = models.find((m) => m.formulaIds.includes('F034')) || models[0];
  let activeId = initialModel.id, view = 'lab', kind = 'formulas', toastTimer, saveTimer;
  let states = {};
  try {
    const saved = JSON.parse(localStorage.getItem('marx-lab-v1') || '{}');
    if (modelMap.has(saved.activeId)) activeId = saved.activeId;
    for (const model of models) {
      const entry = saved.states?.[model.id];
      if (!entry) continue;
      if (readParams(model, entry.baseline || {}).valid && readParams(model, entry.raw || {}).valid) {
        states[model.id] = {raw:strings(readParams(model, entry.raw).values), baseline:readParams(model, entry.baseline).values, x:entry.x, y:entry.y};
      }
    }
  } catch (_) { /* Private mode or unavailable storage: the laboratory still works. */ }
  function state() {
    const model = modelMap.get(activeId);
    if (!states[activeId]) states[activeId] = {raw:strings(defaults(model)),baseline:defaults(model),x:model.plot.x,y:model.plot.y};
    return states[activeId];
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem('marx-lab-v1', JSON.stringify({activeId,states})); } catch (_) { /* Optional storage. */ }
    }, 200);
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function math(node, source, display = false) {
    if (!globalThis.katex) { node.textContent = source; return; }
    katex.render(source, node, {displayMode:display,throwOnError:false,strict:false,trust:false});
  }
  function renderMarkdown(node, source, inline = false) {
    const mathParts = [];
    const protectedText = source.replace(/\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^\n$]+?\$/g, (part) => {
      mathParts.push(part);
      return `MATHPLACEHOLDER${mathParts.length - 1}END`;
    });
    let html = inline ? marked.parseInline(protectedText) : marked.parse(protectedText);
    html = html.replace(/MATHPLACEHOLDER(\d+)END/g, (_, i) => {
      const holder = el('span', '', mathParts[Number(i)]);
      return holder.innerHTML;
    });
    node.innerHTML = DOMPurify.sanitize(html);
    renderMathInElement(node, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false});
    node.querySelectorAll('a[href]').forEach((link) => {
      if (!link.getAttribute('href').startsWith('#')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    });
  }
  function table(node, columns, rows) {
    node.replaceChildren();
    const t = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody');
    columns.forEach((c) => { const th = el('th','',c); th.scope = 'col'; tr.append(th); });
    head.append(tr);
    rows.forEach((row) => {
      const r = el('tr');
      row.forEach((v) => r.append(el('td','',typeof v === 'number' ? fmt(v) : (v ?? 'не определено'))));
      body.append(r);
    });
    t.append(head,body); node.append(t);
  }
  function evaluate(model, params) {
    try {
      const result = model.compute({...params});
      // Fail closed on unexpected arithmetic, never display Infinity as a result.
      result.metrics = result.metrics.map((m) => ({...m,value:Number.isFinite(m.value) ? m.value : null}));
      return result;
    } catch (error) {
      return {metrics:[],warnings:['Расчёт недоступен для этих условий. Измените параметры или сбросьте опыт.'],notes:[]};
    }
  }
  function closeMenu() {
    const hadFocus = $('sidebar').contains(document.activeElement);
    $('sidebar').classList.remove('open'); $('nav-overlay').hidden = true; $('menu-toggle').setAttribute('aria-expanded','false');
    if (hadFocus && matchMedia('(max-width: 900px)').matches) $('menu-toggle').focus();
  }
  function setView(next) {
    view = next;
    $('lab-view').hidden = view !== 'lab'; $('catalog-view').hidden = view !== 'catalog';
    for (const name of ['lab','catalog']) {
      $(`${name}-tab`).classList.toggle('active', view === name);
      $(`${name}-tab`).setAttribute('aria-pressed',String(view === name));
    }
    closeMenu();
    if (view === 'catalog') renderCatalog();
  }
  function chooseModel(id) {
    if (!modelMap.has(id)) return;
    activeId = id; setView('lab'); renderModel(); persist();
  }
  function selectGroup(id) {
    const model = modelMap.get(activeId);
    if (view === 'catalog') { $('catalog-group').value = String(id); kind = 'formulas'; renderCatalog(); closeMenu(); }
    else chooseModel(model.group === id ? activeId : models.find((m) => m.group === id).id);
  }
  catalog.groups.forEach((g) => {
    const button = el('button'); button.dataset.group = String(g.id);
    button.append(el('span','nav-index',String(g.id).padStart(2,'0')),el('span','',shortGroups[g.id-1] || g.title));
    button.addEventListener('click', () => selectGroup(g.id)); $('group-nav').append(button);
    const opt = el('option','',`${String(g.id).padStart(2,'0')} · ${g.title}`); opt.value = String(g.id); $('catalog-group').append(opt);
  });
  function updateNav(group) {
    $('group-nav').querySelectorAll('button').forEach((b) => {
      const selected = Number(b.dataset.group) === Number(group);
      b.classList.toggle('active',selected); b.setAttribute('aria-current',selected ? 'true' : 'false');
    });
  }
  function renderModel() {
    const model = modelMap.get(activeId), s = state(), group = groups.get(model.group);
    $('group-number').textContent = `Тема ${model.group}`;
    $('group-title').textContent = group.title;
    updateNav(model.group);
    $('model-tabs').replaceChildren(); $('model-picker').replaceChildren();
    models.filter((m) => m.group === model.group).forEach((m) => {
      const b = el('button',m.id === activeId ? 'active' : '',m.title);
      const option = el('option','',m.title); option.value = m.id; $('model-picker').append(option);
      b.setAttribute('aria-pressed', String(m.id === activeId)); b.addEventListener('click', () => chooseModel(m.id)); $('model-tabs').append(b);
    });
    $('model-picker').value = activeId;
    $('model-title').textContent = model.title; $('model-description').textContent = model.description;
    math($('formula-banner'),model.formula,true);
    $('presets').replaceChildren();
    const blank = el('option','','Выбрать исходный пример…'); blank.value = ''; $('presets').append(blank);
    model.presets.forEach((p,i) => { const opt = el('option','',p.label); opt.value = String(i); $('presets').append(opt); });
    $('fields').replaceChildren();
    model.fields.forEach((f) => {
      const wrap = el('div','field'), label = el('label','field-label'), symbol = el('span','field-symbol');
      label.htmlFor = `input-${f.key}`; math(symbol,f.symbol || f.key);
      label.append(symbol,el('span','',f.label));
      const numwrap = el('div','number-wrap'), input = el('input'), range = el('input');
      input.id = `input-${f.key}`; input.type = 'text'; input.inputMode = 'decimal'; input.value = s.raw[f.key]; input.autocomplete = 'off';
      input.setAttribute('aria-describedby', `hint-${f.key} error-${f.key}`);
      numwrap.append(input,el('span','unit',f.unit || ''));
      range.type = 'range'; range.id = `range-${f.key}`; range.min = f.min; range.max = f.max; range.step = f.step || 'any'; range.value = parse(s.raw[f.key]) ?? f.value;
      range.setAttribute('aria-label',`${f.label} — ползунок`);
      const labels = el('div','range-labels'); labels.append(el('span','',fmt(f.min)),el('span','',fmt(f.max)));
      const hint = el('p','field-hint',f.hint || ''); hint.id = `hint-${f.key}`;
      const error = el('p','field-error'); error.id = `error-${f.key}`; error.hidden = true;
      input.addEventListener('input', () => {
        s.raw[f.key] = input.value;
        const value = parse(input.value); if (value !== null && value >= f.min && value <= f.max) range.value = value;
        $('presets').value = ''; renderResults(); persist();
      });
      range.addEventListener('input', () => {
        input.value = range.value; s.raw[f.key] = range.value; $('presets').value = ''; renderResults(); persist();
      });
      wrap.append(label,numwrap,range,labels,hint,error); $('fields').append(wrap);
    });
    $('chart-x').replaceChildren();
    model.fields.forEach((f) => { const opt = el('option','',`${f.label}${f.unit ? `, ${f.unit}` : ''}`); opt.value = f.key; $('chart-x').append(opt); });
    if (!model.fields.some((f) => f.key === s.x)) s.x = model.plot.x;
    $('chart-x').value = s.x;
    renderSources(); renderResults();
  }
  function renderResults() {
    const model = modelMap.get(activeId), s = state(), params = readParams(model,s.raw);
    model.fields.forEach((f) => {
      const error = params.errors[f.key];
      $(`input-${f.key}`).setAttribute('aria-invalid',String(Boolean(error)));
      $(`error-${f.key}`).textContent = error || ''; $(`error-${f.key}`).hidden = !error;
    });
    $('pin-baseline').disabled = !params.valid;
    $('validation').replaceChildren();
    for (const name of ['metrics','bars','flow','result-table','chart','chart-table','model-notes']) $(name).replaceChildren();
    if (!params.valid) {
      $('validation').append(el('div','warning','Проверьте выделенные поля. Результаты и график не рассчитаны: прежние значения не показываются.'));
      $('metrics').append(el('div','empty-state','Для расчёта нужны корректные исходные величины.'));
      $('chart-caption').textContent = 'График появится после исправления полей.';
      return;
    }
    const result = evaluate(model,params.values), baseline = evaluate(model,s.baseline);
    if (result.warnings?.length) {
      const warning = el('div','warning'); warning.append(el('strong','','Обратите внимание'));
      const list = el('ul'); result.warnings.forEach((w) => list.append(el('li','',w))); warning.append(list); $('validation').append(warning);
    }
    result.metrics.forEach((m) => {
      const card = el('div','metric'), value = el('div',`metric-value${m.value < 0 ? ' negative' : ''}`);
      value.append(el('span','',m.value === null ? '—' : fmt(m.value)),el('small','',m.unit || ''));
      const before = baseline.metrics.find((b) => b.key === m.key)?.value;
      const delta = el('div','metric-delta',`${fmt(before)} → ${fmt(m.value)}`);
      if (Number.isFinite(before) && Number.isFinite(m.value)) {
        const diff = m.value - before;
        const change = el('span',Math.abs(diff) > 1e-9 ? 'changed' : '',` · ${diff > 0 ? '+' : ''}${fmt(diff)}${m.unit === '%' ? ' п. п.' : ''}`);
        delta.append(change);
      }
      card.append(el('div','metric-label',m.label),value,delta);
      if (m.hint) card.append(el('div','metric-hint',m.hint)); $('metrics').append(card);
    });
    const bars = (result.bars || []).filter((b) => Number.isFinite(b.value) && b.value >= 0), total = bars.reduce((sum,b) => sum+b.value,0);
    if (bars.length && Number.isFinite(total) && total > 0) {
      const wrap = el('div','bars-wrap'), track = el('div','bar-track'), legend = el('div','bar-legend');
      track.setAttribute('aria-label',bars.map((b) => `${b.label}: ${fmt(b.value)} ${result.barUnit || ''}`).join('; '));
      bars.forEach((b,i) => {
        const color = colors[b.color] || Object.values(colors)[i % Object.values(colors).length];
        const part = el('div','bar-part'), pct = b.value / total * 100;
        part.style.width = `${pct}%`; part.style.backgroundColor = color; part.title = `${b.label}: ${fmt(b.value)} ${result.barUnit || ''}`;
        if (pct > 12) part.append(el('span','',fmt(b.value))); track.append(part);
        const item = el('span'), dot = el('i'); dot.style.backgroundColor = color;
        item.append(dot,document.createTextNode(b.label),el('strong','',`${fmt(b.value)} ${result.barUnit || ''}`)); legend.append(item);
      });
      wrap.append(track,legend); $('bars').append(wrap);
    }
    (result.flow || []).forEach((step,i) => {
      if (i) $('flow').append(el('span','flow-arrow','→')); $('flow').append(el('span','flow-step',step));
    });
    if (result.table) table($('result-table'),result.table.columns,result.table.rows);
    (result.notes || []).forEach((n) => $('model-notes').append(el('li','',n)));
    if (!result.notes?.length) $('model-notes').append(el('li','','См. предпосылки и оговорки в связанных пунктах каталога ниже.'));
    $('chart-y').replaceChildren();
    result.metrics.forEach((m) => { const opt = el('option','',`${m.label}${m.unit ? `, ${m.unit}` : ''}`); opt.value = m.key; $('chart-y').append(opt); });
    if (!result.metrics.some((m) => m.key === s.y)) s.y = result.metrics[0]?.key;
    $('chart-y').value = s.y;
    renderChart(model,params.values,result);
  }
  function renderChart(model, values, result) {
    const s = state(), field = model.fields.find((f) => f.key === s.x), metric = result.metrics.find((m) => m.key === s.y);
    if (!field || !metric) return;
    const center = values[field.key], original = s.baseline[field.key], step = field.step || 0.01;
    const span = Math.max(Math.abs(center),Math.abs(original),step*5,1);
    let lo = Math.max(field.min,Math.min(center,original) - span*0.6), hi = Math.min(field.max,Math.max(center,original) + span*0.8);
    if (hi <= lo) { lo = field.min; hi = field.max; }
    const points = new Set([center,original,lo,hi].filter((v) => !field.integer || Number.isInteger(v)));
    for (let i = 0; i <= 48; i++) {
      const x = Math.min(hi,Math.max(lo,lo + (hi-lo)*i/48));
      const snapped = Number((field.min + Math.round((x-field.min)/step)*step).toPrecision(12));
      if (snapped >= field.min && snapped <= field.max && snapped >= lo && snapped <= hi) points.add(snapped);
    }
    const data = [...points].sort((a,b) => a-b).map((x) => {
      const get = (p) => evaluate(model,{...p,[field.key]:x}).metrics.find((m) => m.key === s.y)?.value ?? null;
      return {x,current:get(values),baseline:get(s.baseline)};
    });
    const finite = data.flatMap((p) => [p.current,p.baseline]).filter(Number.isFinite);
    if (!finite.length) { $('chart').append(el('div','empty-state','Для выбранного показателя нет определённых значений в этом диапазоне. Измените условия или выберите другой показатель.')); $('chart-caption').textContent = 'Разрывы и неопределённые результаты не соединяются линией.'; return; }
    let ymin = Math.min(...finite), ymax = Math.max(...finite);
    const padding = ymax === ymin ? Math.max(Math.abs(ymax)*0.15,1) : (ymax-ymin)*0.12;
    ymin -= padding; ymax += padding;
    lo = data[0].x; hi = data[data.length-1].x;
    if (hi === lo) hi = lo+1;
    const W = Math.max(240,$('chart').clientWidth),H = W < 450 ? 265 : 300,L = 74,R = 18,T = 25,B = 44;
    const px = (x) => L+(x-lo)/(hi-lo)*(W-L-R), py = (y) => H-B-(y-ymin)/(ymax-ymin)*(H-T-B);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = (tag,attrs,text) => { const node = document.createElementNS(ns,tag); Object.entries(attrs).forEach(([k,v]) => node.setAttribute(k,String(v))); if (text !== undefined) node.textContent = text; return node; };
    const xLabel = `${field.label}${field.unit ? `, ${field.unit}` : ''}`, yLabel = `${metric.label}${metric.unit ? `, ${metric.unit}` : ''}`;
    const xTitle = el('div','chart-axis-title chart-axis-x',`${xLabel} →`), yTitle = el('div','chart-axis-title chart-axis-y',`↑ ${yLabel}`);
    // HTML labels wrap naturally; long names stay readable even on narrow screens.
    for (const title of [xTitle,yTitle]) {
      title.style.marginLeft = `${L}px`; title.style.marginRight = `${R}px`;
      title.setAttribute('aria-hidden','true');
    }
    const chart = svg('svg',{viewBox:`0 0 ${W} ${H}`,class:'chart-svg',role:'img','aria-label':`График зависимости. Ось X: ${xLabel}. Ось Y: ${yLabel}. Таблица точек доступна под графиком.`});
    chart.append(svg('title',{},`${yLabel} / ${xLabel}`));
    const ticks = W < 450 ? 2 : 4;
    for (let i = 0; i <= ticks; i++) {
      const y = ymin+(ymax-ymin)*i/ticks;
      chart.append(svg('line',{x1:L,y1:py(y),x2:W-R,y2:py(y),class:'tick-line'}),svg('text',{x:L-10,y:py(y)+4,'text-anchor':'end'},tickFmt(y)));
      const x = lo+(hi-lo)*i/ticks;
      chart.append(svg('text',{x:px(x),y:H-20,'text-anchor':'middle'},tickFmt(x)));
    }
    chart.append(svg('path',{d:`M${L} ${T} V${H-B} H${W-R}`,class:'axis-line'}));
    function path(key) {
      let d = '', gap = true;
      data.forEach((p) => {
        if (!Number.isFinite(p[key])) { gap = true; return; }
        d += `${gap ? 'M' : 'L'}${px(p.x).toFixed(2)} ${py(p[key]).toFixed(2)} `; gap = false;
      });
      return d;
    }
    chart.append(svg('path',{d:path('baseline'),class:'baseline-line'}),svg('path',{d:path('current'),class:'current-line'}));
    for (const key of ['baseline','current']) {
      data.forEach((p,i) => {
        if (!Number.isFinite(p[key])) return;
        const isolated = !Number.isFinite(data[i-1]?.[key]) && !Number.isFinite(data[i+1]?.[key]);
        if (isolated || field.integer) {
          const dot = svg('circle',{cx:px(p.x),cy:py(p[key]),r:isolated ? 4 : 2.5,class:`sample-point ${key}-sample`});
          dot.append(svg('title',{},`${fmt(p.x)} → ${fmt(p[key])}`)); chart.append(dot);
        }
      });
    }
    if (Number.isFinite(metric.value)) {
      const circle = svg('circle',{cx:px(center),cy:py(metric.value),r:5,class:'marker'}); circle.append(svg('title',{},`${fmt(center)} → ${fmt(metric.value)}`)); chart.append(circle);
    }
    $('chart').append(yTitle,chart,xTitle);
    $('chart-caption').textContent = `${field.symbol || field.key}: ${fmt(lo)}–${fmt(hi)} ${field.unit || ''}. По вертикали: ${metric.label}${metric.unit ? ` (${metric.unit})` : ''}. Точка — текущие значения. Для каждой кривой остальные параметры взяты из её сценария. Неопределённые значения пропущены; линии между дискретными точками — ориентир.`;
    table($('chart-table'),[`${field.label}${field.unit ? `, ${field.unit}` : ''}`,'Исходный сценарий','Текущий сценарий'],data.map((p) => [p.x,p.baseline,p.current]));
  }
  function assessmentBadge(entry) {
    if (!entry.assessment) return null;
    const a = entry.assessment;
    const label = `E${a.level} — ${catalog.assessmentScale[a.level]}. ${a.attribution ? a.attribution.label + '. ' + a.attribution.detail + ' ' : ''}Оценено: ${a.target}. ${a.reason}`;
    const badge = el('span',`assessment-badge assessment-e${a.level}`,`E${a.level}`);
    badge.title = label; badge.setAttribute('aria-label',label);
    if (!a.attribution) return badge;
    const summary = el('span','assessment-summary');
    summary.append(badge,el('span','assessment-attribution',a.attribution.label));
    return summary;
  }
  function sourceCard(f, computed) {
    const button = el('button','source-card');
    const heading = el('div','source-meta');
    heading.append(el('span','source-code',f.id),el('span',`source-type${computed ? ' computed' : ''}`,computed ? 'Есть расчёт' : 'Связанный разбор'));
    const badge = assessmentBadge(f); if (badge) heading.append(badge);
    button.append(heading,el('h4','',f.title));
    if (f.assessment?.attribution) button.append(el('p','assessment-detail',f.assessment.attribution.detail));
    if (f.context) {
      const context = el('p','source-context'); renderMarkdown(context,f.context,true); button.append(context);
    }
    renderMarkdown(button.querySelector('h4'),f.title,true);
    button.addEventListener('click',() => openEntry(f)); return button;
  }
  function renderSources() {
    const model = modelMap.get(activeId); $('model-sources').replaceChildren();
    [...model.formulaIds,...(model.relatedIds || [])].forEach((id) => {
      const f = formulas.get(id); if (f) $('model-sources').append(sourceCard(f,model.formulaIds.includes(id)));
    });
  }
  const normalize = (str) => str.toLocaleLowerCase('ru').replaceAll('ё','е');
  function renderCatalog() {
    const translated = kind === 'translations', group = $('catalog-group').value;
    $('formulas-kind').classList.toggle('active',!translated); $('translations-kind').classList.toggle('active',translated);
    $('formulas-kind').setAttribute('aria-pressed',String(!translated)); $('translations-kind').setAttribute('aria-pressed',String(translated));
    $('catalog-group').disabled = translated; $('catalog-assessment').disabled = translated; $('catalog-order').disabled = translated;
    updateNav(translated || group === 'all' ? -1 : Number(group));
    const words = normalize($('catalog-search').value).split(/\s+/).filter(Boolean);
    const source = translated ? catalog.translations : catalog.formulas;
    const assessment = $('catalog-assessment').value;
    const items = source.filter((f) => (translated || group === 'all' || f.group === Number(group))
      && (translated || assessment === 'all' || f.assessment?.level === Number(assessment))
      && words.every((w) => normalize(`${f.id} ${f.title} ${f.searchText || f.markdown}`).includes(w)));
    if (!translated && $('catalog-order').value === 'rating') items.sort((a,b) => b.assessment.level - a.assessment.level || a.id.localeCompare(b.id));
    $('catalog-count').textContent = `Найдено: ${items.length} из ${source.length}`;
    $('catalog-list').replaceChildren();
    if (!items.length) { $('catalog-list').append(el('div','empty-state','Совпадений нет. Попробуйте другой запрос или выберите «Все темы».')); return; }
    items.forEach((f) => {
      const computed = models.some((m) => m.formulaIds.includes(f.id)), card = sourceCard(f,computed); card.classList.add('catalog-card');
      if (translated) card.querySelector('.source-type').textContent = 'Оригинал и перевод';
      card.append(el('span','theme-tag',translated ? 'Терминология, оригинальные записи и редакторские различия' : groups.get(f.group).title));
      const preview = f.markdown.match(/\$\$([\s\S]*?)\$\$/);
      if (preview) {
        if (f.assessment?.attribution) card.append(el('p','preview-note',f.assessment.attribution.preview));
        const block = el('div','catalog-preview'); math(block,preview[1],true); card.append(block);
      }
      $('catalog-list').append(card);
    });
  }
  function openReader(title,code,markdown,entryId) {
    renderMarkdown($('reader-title'),title,true); $('reader-code').textContent = code;
    $('reader-actions').replaceChildren();
    if (entryId) models.filter((m) => m.formulaIds.includes(entryId) || m.relatedIds?.includes(entryId)).forEach((m) => {
      const b = el('button','quiet-button',`${m.formulaIds.includes(entryId) ? 'Рассчитать' : 'Связанный опыт'}: ${m.title} →`);
      b.addEventListener('click',() => { $('reader-dialog').close(); chooseModel(m.id); $('model-title').scrollIntoView({block:'start'}); }); $('reader-actions').append(b);
    });
    renderMarkdown($('reader-content'),markdown);
    if (!$('reader-dialog').open) $('reader-dialog').showModal();
    $('reader-dialog').scrollTop = 0;
  }
  function openEntry(entry) {
    openReader(entry.title,entry.id,entry.markdown,entry.id);
    $('reader-content').prepend(el('p','edition-note','Русские тома без отдельного названия издания — Маркс, Энгельс. Сочинения, 2-е издание. Для MEGA и других изданий принадлежность указана отдельно.'));
    const badge = assessmentBadge(entry); if (badge) $('reader-code').append(badge);
  }
  function assessmentHelp() {
    const levels = catalog.assessmentScale.map((text,index) => `- **E${index}** — ${text}.`).join('\n');
    openReader('Математическая сомнительность E0–E5','Шкала оценки',`${catalog.assessmentMethod}\n\n${levels}\n\nРядом с баллом постоянно видна атрибуция: чья посылка или какой вариант оценивается. Подпись перед формулой отдельно объясняет, что показано — ошибочный вариант, намеренное опровержение или правильное исправление. В карточке также указаны объект и основание оценки. Исправленная формула и ошибочный вариант могут находиться в одном пункте; E5 не означает, что оба неверны. Ошибки цитируемых оппонентов отдельно обозначены. Это порядковая редакторская оценка, не вероятность и не оценка истинности экономической теории. Отсутствие сплошной сверки источника само по себе не повышает E.`);
  }
  function downloadCatalog() {
    const parts = [catalog.intro];
    catalog.groups.forEach((group) => {
      parts.push(`<a id="group-${String(group.id).padStart(2,'0')}"></a>\n\n## ${group.id}. ${group.title}`);
      catalog.formulas.filter((entry) => entry.group === group.id).forEach((entry) => parts.push(`<a id="${entry.id.toLowerCase()}"></a>\n\n### ${entry.id}. ${entry.title}\n\n${entry.markdown}`));
    });
    parts.push('<a id="translation-notes"></a>\n\n## Оригинал и перевод');
    catalog.translations.forEach((entry) => parts.push(`<a id="${entry.id.toLowerCase()}"></a>\n\n### ${entry.id}. ${entry.title}\n\n${entry.markdown}`));
    parts.push('<a id="sources"></a>\n\n' + catalog.scope);
    const blob = new Blob([parts.join('\n\n') + '\n'],{type:'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = 'formulas-catalog.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function about() {
    openReader('Метод, источники и границы проверки','Справка',`Численные модели — учебная реализация отношений из каталога, а не утверждение об их эмпирической истинности. Ползунки имеют технические пределы интерфейса, не универсальные экономические границы. В каждой модели перечислены предпосылки. Метка «Есть расчёт» означает, что опыт рассчитывает отношения из пункта, но не обязательно все его исторические варианты. Метка «Связанный разбор» ведёт к тексту без обещания численной симуляции.\n\nВсе данные и библиотеки локальны. Сценарии сохраняются только в этом браузере, если он разрешает localStorage; отправки данных нет. Ссылка на сценарий содержит введённые числа и исходные значения сравнения.\n\n## Исходный каталог\n\n${catalog.intro}\n\n${catalog.scope}`);
  }
  function loadHash() {
    const hash = location.hash.slice(1);
    if (hash.startsWith('formula/')) {
      const entry = formulas.get(hash.slice(8)) || translations.get(hash.slice(8)); if (entry) openEntry(entry); return;
    }
    if (!hash.startsWith('lab/')) return;
    const [id,query = ''] = hash.slice(4).split('?');
    if (!modelMap.has(id)) { toast('Опыт из ссылки не найден.'); return; }
    const m = modelMap.get(id), args = new URLSearchParams(query), raw = strings(defaults(m)), baseline = defaults(m);
    m.fields.forEach((f) => { if (args.has(f.key)) raw[f.key] = args.get(f.key); if (args.has(`b.${f.key}`)) baseline[f.key] = args.get(`b.${f.key}`); });
    const checked = readParams(m,raw), before = readParams(m,baseline);
    if (!checked.valid || !before.valid) { toast('В ссылке недопустимые значения. Сценарий не загружен.'); return; }
    if ($('reader-dialog').open) $('reader-dialog').close();
    states[id] = {raw:strings(checked.values),baseline:before.values,x:args.get('x') || m.plot.x,y:args.get('y') || m.plot.y}; chooseModel(id);
  }
  $('presets').addEventListener('change',() => {
    if ($('presets').value === '') return;
    const m = modelMap.get(activeId), index = Number($('presets').value), preset = m.presets[index];
    const values = {...defaults(m),...preset.values}; state().raw = strings(values); state().baseline = {...values}; renderModel(); $('presets').value = String(index); persist(); toast('Пример загружен и принят за исходный сценарий.');
  });
  $('pin-baseline').addEventListener('click',() => {
    const checked = readParams(modelMap.get(activeId),state().raw); if (!checked.valid) return;
    state().baseline = {...checked.values}; renderResults(); persist(); toast('Текущие числа приняты за исходные.');
  });
  $('restore-baseline').addEventListener('click',() => { state().raw = strings(state().baseline); renderModel(); persist(); });
  $('reset-model').addEventListener('click',() => { delete states[activeId]; renderModel(); persist(); });
  $('model-picker').addEventListener('change',() => chooseModel($('model-picker').value));
  $('chart-x').addEventListener('change',() => { state().x = $('chart-x').value; renderResults(); persist(); });
  $('chart-y').addEventListener('change',() => { state().y = $('chart-y').value; renderResults(); persist(); });
  $('share-button').addEventListener('click',async () => {
    const m = modelMap.get(activeId), s = state(), checked = readParams(m,s.raw);
    if (!checked.valid) { toast('Сначала исправьте поля сценария.'); return; }
    const args = new URLSearchParams();
    m.fields.forEach((f) => { args.set(f.key,checked.values[f.key]); args.set(`b.${f.key}`,s.baseline[f.key]); }); args.set('x',s.x); args.set('y',s.y);
    const url = `${location.href.split('#')[0]}#lab/${m.id}?${args}`;
    try { await navigator.clipboard.writeText(url); toast('Ссылка на сценарий скопирована. Она откроется там, где доступен этот стенд.'); }
    catch (_) {
      openReader('Ссылка на сценарий','КОПИРОВАНИЕ ВРУЧНУЮ','Браузер не разрешил доступ к буферу обмена. Скопируйте адрес из поля ниже.');
      const input = el('textarea'); input.value = url; input.readOnly = true; input.rows = 5; input.style.width = '100%'; input.setAttribute('aria-label','Ссылка на текущий сценарий'); $('reader-content').append(input); input.focus(); input.select();
    }
  });
  $('lab-tab').addEventListener('click',() => { setView('lab'); updateNav(modelMap.get(activeId).group); });
  $('catalog-tab').addEventListener('click',() => setView('catalog'));
  $('group-catalog').addEventListener('click',() => { $('catalog-group').value = String(modelMap.get(activeId).group); kind = 'formulas'; $('catalog-search').value = ''; setView('catalog'); $('catalog-view').scrollIntoView({block:'start'}); });
  $('formulas-kind').addEventListener('click',() => { kind = 'formulas'; renderCatalog(); });
  $('translations-kind').addEventListener('click',() => { kind = 'translations'; renderCatalog(); });
  $('catalog-search').addEventListener('input',renderCatalog); $('catalog-group').addEventListener('change',renderCatalog);
  $('catalog-assessment').addEventListener('change',renderCatalog); $('catalog-order').addEventListener('change',renderCatalog);
  $('assessment-help').addEventListener('click',assessmentHelp); $('download-catalog').addEventListener('click',downloadCatalog);
  $('about-button').addEventListener('click',about); $('footer-about').addEventListener('click',about);
  $('reader-close').addEventListener('click',() => $('reader-dialog').close());
  $('reader-dialog').addEventListener('click',(event) => {
    if (event.target === $('reader-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); }
  });
  $('reader-content').addEventListener('click',(event) => {
    const link = event.target.closest('a'); if (!link) return;
    const href = link.getAttribute('href'); if (!href.startsWith('#')) return;
    const id = href.slice(1).toUpperCase(); const entry = formulas.get(id) || translations.get(id);
    if (entry) { event.preventDefault(); openEntry(entry); return; }
    const groupLink = href.match(/^#group-(\d+)$/);
    if (groupLink && groups.has(Number(groupLink[1]))) {
      event.preventDefault(); $('reader-dialog').close(); $('catalog-group').value = String(Number(groupLink[1]));
      $('catalog-search').value = ''; kind = 'formulas'; setView('catalog'); $('catalog-view').scrollIntoView({block:'start'});
    } else if (href === '#translation-notes') {
      event.preventDefault(); $('reader-dialog').close(); $('catalog-search').value = ''; kind = 'translations'; setView('catalog');
    } else if (href === '#sources') {
      event.preventDefault();
      const heading = [...$('reader-content').querySelectorAll('h2,h3')].find((h) => h.textContent.toLowerCase().includes('реестр источников'));
      if (heading) heading.scrollIntoView({block:'start'});
      else openReader('Источники и границы полноты','ИСТОЧНИКОВЕДЧЕСКИЕ ПРИМЕЧАНИЯ',catalog.scope);
    }
  });
  $('menu-toggle').addEventListener('click',() => {
    const open = $('sidebar').classList.toggle('open'); $('nav-overlay').hidden = !open; $('menu-toggle').setAttribute('aria-expanded',String(open));
    if (open) $('lab-tab').focus();
  });
  $('nav-overlay').addEventListener('click',closeMenu);
  document.addEventListener('keydown',(e) => { if (e.key === 'Escape') closeMenu(); });
  $('brand').addEventListener('click',(e) => { e.preventDefault(); chooseModel(initialModel.id); });
  let resizeTimer;
  window.addEventListener('resize',() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (view === 'lab') renderResults(); },100); });
  window.addEventListener('hashchange',loadHash);
  renderModel(); loadHash();
})();
