// QA runner for quadrilaterals-preview/index.html
// Real Chromium (Playwright): layout, overflow, computed colors, SVG geometry invariants,
// implication arrows, numbering, source content lock, mobile scale, print/PDF and console errors.
//
//   node run.mjs                 run every check, write artifacts/report.{json,md}, exit 1 on failure
//   node run.mjs --baseline      also (re)write content-lock.json from the current rendering
//   node run.mjs --out DIR       artifacts directory (default qa/artifacts)
//   node run.mjs --url URL       test a deployed copy instead of ../index.html
//   node run.mjs --no-pdf        skip PDF export / rasterization (needs python + PyMuPDF)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = k => argv.includes(k);

const INDEX = path.resolve(opt('--index', path.join(here, '..', 'index.html')));
const URL = opt('--url', pathToFileURL(INDEX).href);
const OUT = path.resolve(opt('--out', path.join(here, 'artifacts')));
const LOCK = path.resolve(opt('--lock', path.join(here, 'content-lock.json')));
const BASELINE = has('--baseline');
const NO_PDF = has('--no-pdf');
const TOPICS = ['parallelogram', 'rectangle', 'rhombus', 'square'];
const A4 = { w: 794, h: 1123 };
const MM = { w: 210 * 96 / 25.4, h: 297 * 96 / 25.4 };
const TOL = 1.5;
const DESKTOP = { width: 1100, height: 1350 };
const MOBILE = { width: 390, height: 844 };
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

fs.mkdirSync(OUT, { recursive: true });
const results = [];
const record = (test, ok, msg = '') => { results.push({ test, ok, msg }); if (!ok) console.log(`  FAIL ${test}: ${msg}`); };
const check = (test, cond, msg = '') => record(test, !!cond, msg);

// ---------- browser-side helpers (installed into every page) ----------
const LIB = String.raw`
window.__qa = (() => {
  const vis = el => { try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch { return true; } };
  const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('class') ? '.' + String(el.getAttribute('class')).trim().split(/\s+/).join('.') : '') + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) + '"');
  const rgb = c => { const m = String(c).match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const isTransparent = c => { const p = rgb(c); return !p || p.a === 0; };
  const isBlack = c => { const p = rgb(c); return !!p && p.r === 0 && p.g === 0 && p.b === 0 && p.a > 0; };
  const isWhite = c => { const p = rgb(c); return !!p && p.r === 255 && p.g === 255 && p.b === 255; };
  const isGray = c => { const p = rgb(c); return !!p && p.r === p.g && p.g === p.b && p.a > 0; };
  const nums = s => (String(s).match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number);

  function sheetMetrics(sheet) {
    const sr = sheet.getBoundingClientRect();
    const outside = [], clipped = [];
    for (const node of sheet.querySelectorAll('*')) {
      if (!vis(node)) continue;
      const r = node.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.left < sr.left - 1.5 || r.right > sr.right + 1.5 || r.top < sr.top - 1.5 || r.bottom > sr.bottom + 1.5)
        outside.push({ el: desc(node), dx: Math.max(sr.left - r.left, r.right - sr.right, 0).toFixed(1), dy: Math.max(sr.top - r.top, r.bottom - sr.bottom, 0).toFixed(1) });
      if (node instanceof HTMLElement && node.clientWidth > 0 && getComputedStyle(node).overflowX !== 'visible' && node.scrollWidth > node.clientWidth + 2)
        clipped.push({ el: desc(node), axis: 'x', client: node.clientWidth, scroll: node.scrollWidth });
      if (node instanceof HTMLElement && node.clientHeight > 0 && getComputedStyle(node).overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 2)
        clipped.push({ el: desc(node), axis: 'y', client: node.clientHeight, scroll: node.scrollHeight });
    }
    return {
      topic: sheet.closest('.topic')?.id || '', page: sheet.dataset.page || '',
      rect: { x: sr.left, y: sr.top, w: sr.width, h: sr.height },
      visible: vis(sheet), outside, clipped,
      sheetScroll: { cw: sheet.clientWidth, sw: sheet.scrollWidth, ch: sheet.clientHeight, sh: sheet.scrollHeight }
    };
  }

  function textModel(sheet) {
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const texts = []; let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement; if (!el || el.closest('script,style,svg,.pn') || !vis(el)) continue;
      let t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue;
      if (/^\d+\.$/.test(t)) continue;
      t = t.replace(/^\d+\.\s+/, ''); if (!t) continue;
      texts.push(t);
    }
    const blanks = [...sheet.querySelectorAll('.blank,.answer-line')].filter(vis).length;
    const symbols = texts.join(' ').match(/[=∥⟂⊥°∠⇓↓]|וגם|אם:|אז/g) || [];
    return { texts, blanks, symbols };
  }

  function colorAudit(sheet) {
    const bad = [];
    for (const el of sheet.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      const ownText = [...el.childNodes].some(x => x.nodeType === 3 && x.nodeValue.trim());
      if (el instanceof SVGElement) {
        if (el.tagName === 'svg') continue;
        for (const p of ['fill', 'stroke']) {
          const v = cs[p]; if (v === 'none' || isTransparent(v)) continue;
          const grayOk = isGray(v) && el.matches('.extension,[data-helper]');
          if (!(isBlack(v) || isWhite(v) || grayOk)) bad.push({ what: p, el: desc(el), value: v });
        }
        continue;
      }
      if (ownText) {
        const c = cs.color;
        if (!(isBlack(c) || (isGray(c) && el.closest('[data-muted]')))) bad.push({ what: 'color', el: desc(el), value: c });
        const fill = cs.webkitTextFillColor;
        if (fill && !(isBlack(fill) || (isGray(fill) && el.closest('[data-muted]')))) bad.push({ what: 'text-fill', el: desc(el), value: fill });
      }
      for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
        if (cs['border' + side + 'Style'] === 'none' || cs['border' + side + 'Width'] === '0px') continue;
        const v = cs['border' + side + 'Color'];
        if (!(isBlack(v) || isGray(v) || isTransparent(v))) bad.push({ what: 'border' + side, el: desc(el), value: v });
      }
      const bg = cs.backgroundColor;
      if (!(isTransparent(bg) || isWhite(bg))) bad.push({ what: 'background', el: desc(el), value: bg });
      if (cs.backgroundImage !== 'none') bad.push({ what: 'background-image', el: desc(el), value: cs.backgroundImage.slice(0, 50) });
      if (cs.textShadow !== 'none') bad.push({ what: 'text-shadow', el: desc(el), value: cs.textShadow });
    }
    return bad;
  }

  function geomOf(el) {
    const t = el.tagName;
    if (t === 'line') return { type: 'line', p: [[+el.getAttribute('x1'), +el.getAttribute('y1')], [+el.getAttribute('x2'), +el.getAttribute('y2')]] };
    if (t === 'path') {
      // M/L contribute every coordinate pair; A/Q/C contribute only their end point
      const p = []; const re = /([MLQCAZ])([^MLQCAZ]*)/gi; let mm;
      while ((mm = re.exec(el.getAttribute('d') || ''))) {
        const v = nums(mm[2]); if (v.length < 2) continue;
        if (/[ML]/i.test(mm[1])) { for (let i = 0; i + 1 < v.length; i += 2) p.push([v[i], v[i + 1]]); }
        else p.push([v[v.length - 2], v[v.length - 1]]);
      }
      return { type: 'path', p };
    }
    if (t === 'circle') return { type: 'circle', p: [[+el.getAttribute('cx'), +el.getAttribute('cy')]], r: +el.getAttribute('r') };
    if (t === 'text') return { type: 'text', p: [[+el.getAttribute('x'), +el.getAttribute('y')]], text: el.textContent };
    if (t === 'polygon') return { type: 'polygon', p: el.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number)) };
    return { type: t, p: [] };
  }

  function svgAudit(sheet) {
    return [...sheet.querySelectorAll('svg:not([data-decor])')].map(svg => {
      const vb = svg.viewBox.baseVal;
      const box = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
      const poly = svg.querySelector('polygon.shape');
      const points = poly ? geomOf(poly).p : [];
      const marks = [...svg.querySelectorAll('[data-mark]')].map(m => ({ mark: m.dataset.mark, seg: m.dataset.seg || '', at: m.dataset.at || '', rays: m.dataset.rays || '', n: m.dataset.n || '', label: m.dataset.label || '', cls: m.getAttribute('class') || '', geom: geomOf(m) }));
      const labels = [...svg.querySelectorAll('text.lbl')].map(t => { const r = t.getBoundingClientRect(); return { t: t.textContent, v: t.dataset.vertex || '', x: +t.getAttribute('x'), y: +t.getAttribute('y'), px: r.height, anchor: getComputedStyle(t).textAnchor }; });
      const outside = []; let ux = Infinity, uy = Infinity, ux2 = -Infinity, uy2 = -Infinity;
      for (const el of svg.querySelectorAll('*')) {
        if (!(el instanceof SVGGraphicsElement) || el.tagName === 'g' || el.tagName === 'defs' || el.tagName === 'title') continue;
        let b; try { b = el.getBBox(); } catch { continue; }
        if (!b.width && !b.height) continue;
        const sw = parseFloat(getComputedStyle(el).strokeWidth) || 0; const pad = sw / 2;
        ux = Math.min(ux, b.x - pad); uy = Math.min(uy, b.y - pad); ux2 = Math.max(ux2, b.x + b.width + pad); uy2 = Math.max(uy2, b.y + b.height + pad);
        if (b.x - pad < box.x - 0.01 || b.y - pad < box.y - 0.01 || b.x + b.width + pad > box.x + box.w + 0.01 || b.y + b.height + pad > box.y + box.h + 0.01)
          outside.push({ el: el.tagName + '.' + (el.getAttribute('class') || '') + ' ' + (el.textContent || '').trim().slice(0, 6), bbox: [b.x, b.y, b.width, b.height].map(v => +v.toFixed(1)) });
      }
      const r = svg.getBoundingClientRect();
      return { kind: svg.dataset.kind || '', label: svg.getAttribute('aria-label') || '', viewBox: box, points, marks, labels, outside,
        rendered: { w: r.width, h: r.height }, ink: { x: ux, y: uy, w: ux2 - ux, h: uy2 - uy }, inkFill: ((ux2 - ux) * (uy2 - uy)) / (box.w * box.h) };
    });
  }

  function arrowsAudit(sheet) {
    const text = sheet.innerText || '';
    const imp = [...sheet.querySelectorAll('.imp')].filter(vis);
    return {
      doubleArrows: imp.filter(e => e.textContent.trim() === '⇓').length,
      badImp: imp.filter(e => e.textContent.trim() !== '⇓').map(desc),
      singleArrows: (text.match(/[↓⇩⬇]/g) || []).length,
      arrowSvgs: [...sheet.querySelectorAll('svg')].filter(s => /arrow/i.test(s.getAttribute('class') || '')).length,
      derivesWithoutArrow: [...sheet.querySelectorAll('.derive')].filter(d => ![...d.querySelectorAll('.imp')].some(e => e.textContent.trim() === '⇓')).map(desc)
    };
  }

  function numbering(topic) {
    const out = {};
    for (const li of document.querySelectorAll('#' + topic + ' ol[data-list] > li')) {
      const list = li.closest('ol').dataset.list; const n = li.querySelector('.n');
      (out[list] ||= []).push({ page: li.closest('.sheet')?.dataset.page || '', n: n ? n.textContent.trim() : '', text: (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) });
    }
    return out;
  }

  function fonts() {
    const seen = {};
    for (const el of document.querySelectorAll('.sheet *')) {
      if (!vis(el)) continue;
      const own = [...el.childNodes].some(x => x.nodeType === 3 && x.nodeValue.trim());
      if (!own) continue;
      const cs = getComputedStyle(el); const k = cs.fontFamily.split(',')[0].trim().replace(/"/g, '') + ' ' + cs.fontSize;
      seen[k] = (seen[k] || 0) + 1;
    }
    const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight + ' ' + f.style);
    return { sizes: seen, loaded };
  }

  function gaps(sheet) {
    const R = sheet.getBoundingClientRect();
    const boxes = [...sheet.querySelectorAll('h1,h2,h3,p,svg,math,.imp,li>.n')].filter(e => vis(e) && !e.closest('.pn')).map(e => e.getBoundingClientRect()).filter(b => b.height > 0);
    const bands = boxes.map(b => [b.top, b.bottom]).sort((a, b) => a[0] - b[0]);
    let cur = bands[0].slice(), maxGap = 0, gapAt = 0;
    for (const [t, b] of bands.slice(1)) { if (t > cur[1]) { if (t - cur[1] > maxGap) { maxGap = t - cur[1]; gapAt = cur[1] - R.top; } cur = [t, b]; } else cur[1] = Math.max(cur[1], b); }
    const bottom = Math.max(...boxes.map(b => b.bottom)) - R.top;
    return { maxGap: +maxGap.toFixed(1), gapAt: +gapAt.toFixed(0), tail: +(R.height - parseFloat(getComputedStyle(sheet).paddingBottom) - bottom).toFixed(0), sgap: sheet.style.getPropertyValue('--sgap') };
  }
  return { sheetMetrics, textModel, colorAudit, svgAudit, arrowsAudit, numbering, fonts, desc, gaps };
})();`;

// ---------- vector helpers (Node side) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = a => Math.hypot(a[0], a[1]);
const dist = (a, b) => len(sub(a, b));
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const isParallel = (u, v) => Math.abs(cross(u, v)) <= 1e-6 * len(u) * len(v);
const isPerp = (u, v) => Math.abs(dot(u, v)) <= 1e-6 * len(u) * len(v);
const angleAt = (v, a, b) => { const u = sub(a, v), w = sub(b, v); return Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (len(u) * len(w))))); };
const pointOnLine = (p, a, b) => Math.abs(cross(sub(b, a), sub(p, a))) / dist(a, b) < 1e-4;
const pointOnSegment = (p, a, b) => pointOnLine(p, a, b) && dot(sub(p, a), sub(b, a)) >= -1e-6 && dot(sub(p, b), sub(a, b)) >= -1e-6;
const inPolygon = (p, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
const lineIntersect = (a, b, c, d) => { const r = sub(b, a), s = sub(d, c), den = cross(r, s); const t = cross(sub(c, a), s) / den; return [a[0] + r[0] * t, a[1] + r[1] * t]; };

function geometryChecks(svg, where) {
  const P = svg.points; const kind = svg.kind;
  if (!kind || P.length !== 4) { record(`svg-geometry ${where}`, false, `no kind/polygon (kind=${kind}, points=${P.length})`); return; }
  const V = { A: P[0], B: P[1], C: P[2], D: P[3] };
  V.O = lineIntersect(V.A, V.C, V.B, V.D);
  const seg = name => name.split('').map(ch => V[ch]);
  const AB = sub(V.B, V.A), BC = sub(V.C, V.B), CD = sub(V.D, V.C), DA = sub(V.A, V.D);
  const sides = [dist(V.A, V.B), dist(V.B, V.C), dist(V.C, V.D), dist(V.D, V.A)];
  const problems = [];
  if (!(isParallel(AB, CD) && isParallel(BC, DA))) problems.push('opposite sides not parallel');
  if ((kind === 'rectangle' || kind === 'square') && !(isPerp(AB, BC) && isPerp(BC, CD) && isPerp(CD, DA))) problems.push('angles not 90°');
  if ((kind === 'rhombus' || kind === 'square') && !sides.every(s => near(s, sides[0]))) problems.push('sides not equal');
  if ((kind === 'rectangle' || kind === 'square') && !near(dist(V.A, V.C), dist(V.B, V.D))) problems.push('diagonals not equal');
  if ((kind === 'rhombus' || kind === 'square') && !isPerp(sub(V.C, V.A), sub(V.D, V.B))) problems.push('diagonals not perpendicular');
  if (kind === 'parallelogram' && (isPerp(AB, BC) || near(sides[0], sides[1]))) problems.push('parallelogram degenerates into rectangle/rhombus');
  if (kind === 'rectangle' && near(sides[0], sides[1])) problems.push('rectangle drawn as a square');
  if (kind === 'rhombus' && isPerp(AB, BC)) problems.push('rhombus drawn as a square');
  const mO = mid(V.A, V.C); if (!near(mO[0], V.O[0]) || !near(mO[1], V.O[1]) || !near(dist(V.B, V.O), dist(V.O, V.D))) problems.push('diagonals do not bisect each other');
  const groups = {};
  for (const m of svg.marks) {
    const g = m.geom;
    if (m.mark === 'parallel') {
      const [a, b] = seg(m.seg); const apex = g.p[1];
      if (!pointOnSegment(apex, a, b)) problems.push(`parallel mark ${m.seg} apex not on segment`);
      (groups['par' + m.n] ||= []).push(sub(b, a));
    } else if (m.mark === 'equal') {
      const [a, b] = seg(m.seg); const c = mid(g.p[0], g.p[1]);
      if (!pointOnLine(c, a, b)) problems.push(`equal tick ${m.seg} not on segment`);
      if (!isPerp(sub(g.p[1], g.p[0]), sub(b, a))) problems.push(`equal tick ${m.seg} not perpendicular`);
      (groups['eq' + m.n] ||= []).push({ seg: m.seg, len: dist(a, b), c, a, b });
    } else if (m.mark === 'right') {
      const at = V[m.at]; const [r1, r2] = m.rays.split(',').map(k => V[k]);
      if (!isPerp(sub(r1, at), sub(r2, at))) problems.push(`right-angle mark at ${m.at} but rays not perpendicular`);
      if (!near(dist(at, g.p[0]), dist(at, g.p[2]), 1e-3)) problems.push(`right mark at ${m.at} not square`);
      if (!(pointOnLine(g.p[0], at, r1) || pointOnLine(g.p[0], at, r2))) problems.push(`right mark at ${m.at} arms off rays`);
    } else if (m.mark === 'height') {
      const from = V[m.at]; const [a, b] = seg(m.seg); const foot = g.p[1];
      if (!near(dist(from, g.p[0]), 0, 1e-3)) problems.push(`height from ${m.at} does not start at vertex`);
      if (!pointOnLine(foot, a, b)) problems.push(`height foot not on line ${m.seg}`);
      if (!isPerp(sub(foot, from), sub(b, a))) problems.push(`height from ${m.at} not perpendicular to ${m.seg}`);
    } else if (m.mark === 'angle') {
      const at = V[m.at]; const [r1, r2] = m.rays.split(',').map(k => V[k]);
      const ang = angleAt(at, r1, r2);
      const p1 = g.p[0], p2 = g.p[g.p.length - 1];
      if (!(pointOnLine(p1, at, r1) && pointOnLine(p2, at, r2))) problems.push(`angle arc at ${m.at} endpoints off rays ${m.rays}`);
      if (m.n) (groups['ang' + m.n] ||= []).push({ at: m.at, rays: m.rays, ang });
    }
  }
  for (const [k, g] of Object.entries(groups)) {
    if (k.startsWith('par')) { for (const v of g) if (!isParallel(v, g[0])) problems.push(`parallel group ${k}: segments not parallel`); }
    if (k.startsWith('eq')) {
      const segs = [...new Set(g.map(x => x.seg))];
      for (const s of segs) { const ticks = g.filter(x => x.seg === s); const cx = ticks.reduce((a, t) => a + t.c[0], 0) / ticks.length, cy = ticks.reduce((a, t) => a + t.c[1], 0) / ticks.length; const m = mid(ticks[0].a, ticks[0].b); if (!near(cx, m[0], 1e-3) || !near(cy, m[1], 1e-3)) problems.push(`equal ticks on ${s} not centred at midpoint`); }
      for (const x of g) if (!near(x.len, g[0].len)) problems.push(`equal group ${k}: |${x.seg}|=${x.len.toFixed(2)} ≠ |${g[0].seg}|=${g[0].len.toFixed(2)}`);
    }
    if (k.startsWith('ang')) { for (const x of g) if (!near(x.ang, g[0].ang)) problems.push(`angle group ${k}: ∠${x.at}(${x.rays})=${(x.ang * 180 / Math.PI).toFixed(2)}° ≠ ${(g[0].ang * 180 / Math.PI).toFixed(2)}°`); }
  }
  for (const l of svg.labels) {
    if (!l.v) continue;
    const v = V[l.v]; if (!v) continue;
    if (l.v !== 'O' && inPolygon([l.x, l.y], P)) problems.push(`label ${l.t} inside the shape`);
    if (dist([l.x, l.y], v) > 30) problems.push(`label ${l.t} far from vertex ${l.v}`);
  }
  record(`svg-geometry ${where} (${kind})`, problems.length === 0, problems.join('; '));
}

// ---------- main ----------
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(LIB);
  await page.waitForTimeout(150);

  const lock = {}; const allSvg = [];
  let total = 0;
  for (const topic of TOPICS) {
    await page.click(`.top button[data-id="${topic}"]`);
    await page.waitForTimeout(120);
    const sheets = await page.$$(`#${topic} .sheet`);
    check(`pages-per-topic ${topic}`, sheets.length === 5, `found ${sheets.length}`);
    total += sheets.length;
    let idx = 0;
    for (const sheet of sheets) {
      idx++;
      const where = `${topic}-${idx}`;
      const m = await sheet.evaluate(el => window.__qa.sheetMetrics(el));
      check(`visible ${where}`, m.visible, 'sheet hidden');
      check(`a4-desktop ${where}`, Math.abs(m.rect.w - A4.w) <= TOL && Math.abs(m.rect.h - A4.h) <= TOL, `${m.rect.w.toFixed(2)}×${m.rect.h.toFixed(2)}`);
      check(`no-outside-children ${where}`, m.outside.length === 0, JSON.stringify(m.outside.slice(0, 4)));
      check(`no-clipped-children ${where}`, m.clipped.length === 0, JSON.stringify(m.clipped.slice(0, 4)));
      check(`no-sheet-overflow ${where}`, m.sheetScroll.sw <= m.sheetScroll.cw + 1 && m.sheetScroll.sh <= m.sheetScroll.ch + 1, JSON.stringify(m.sheetScroll));
      const gp = await sheet.evaluate(el => window.__qa.gaps(el));
      check(`no-large-gap ${where}`, gp.maxGap <= 130, `largest vertical gap ${gp.maxGap}px at y=${gp.gapAt}; tail ${gp.tail}px; --sgap ${gp.sgap}`);
      record(`whitespace ${where}`, true, `gap ${gp.maxGap}px, tail ${gp.tail}px, --sgap ${gp.sgap}`);
      await sheet.scrollIntoViewIfNeeded();
      await sheet.screenshot({ path: path.join(OUT, `${where}.png`) });
      const colors = await sheet.evaluate(el => window.__qa.colorAudit(el));
      check(`monochrome ${where}`, colors.length === 0, JSON.stringify(colors.slice(0, 4)));
      const svgs = await sheet.evaluate(el => window.__qa.svgAudit(el));
      svgs.forEach((s, i) => {
        const w = `${where} svg${i + 1}`;
        allSvg.push({ where: w, ...s });
        check(`svg-in-viewbox ${w}`, s.outside.length === 0, JSON.stringify(s.outside.slice(0, 3)));
        check(`svg-viewbox-tight ${w}`, s.inkFill >= 0.6, `ink fills ${(s.inkFill * 100).toFixed(0)}% of viewBox`);
        check(`svg-label-size ${w}`, s.labels.length === 0 || Math.min(...s.labels.map(l => l.px)) >= 13, `min label height ${Math.min(...s.labels.map(l => l.px)).toFixed(1)}px`);
        geometryChecks(s, w);
      });
      const arrows = await sheet.evaluate(el => window.__qa.arrowsAudit(el));
      check(`double-arrows ${where}`, arrows.singleArrows === 0 && arrows.arrowSvgs === 0 && arrows.badImp.length === 0 && arrows.derivesWithoutArrow.length === 0, JSON.stringify(arrows));
      lock[where] = await sheet.evaluate(el => window.__qa.textModel(el));
    }
    const num = await page.evaluate(t => window.__qa.numbering(t), topic);
    for (const [list, items] of Object.entries(num)) {
      const seq = items.map(i => i.n); const expect = items.map((_, i) => `${i + 1}.`);
      check(`numbering ${topic} ${list}`, JSON.stringify(seq) === JSON.stringify(expect), `got ${seq.join(' ')}`);
    }
  }
  check('total-pages', total === 20, `found ${total}`);
  const fonts = await page.evaluate(() => window.__qa.fonts());
  fs.writeFileSync(path.join(OUT, 'fonts.json'), JSON.stringify(fonts, null, 2));
  fs.writeFileSync(path.join(OUT, 'svg-audit.json'), JSON.stringify(allSvg, null, 2));

  // ---------- content lock ----------
  fs.writeFileSync(path.join(OUT, 'content-lock.current.json'), JSON.stringify(lock, null, 2));
  if (BASELINE || !fs.existsSync(LOCK)) {
    fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2));
    record('content-lock', true, `baseline written to ${path.relative(process.cwd(), LOCK)}`);
  } else {
    const base = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    const diffs = [];
    for (const k of new Set([...Object.keys(base), ...Object.keys(lock)])) {
      const a = base[k], b = lock[k];
      if (!a || !b) { diffs.push(`${k}: page ${a ? 'removed' : 'added'}`); continue; }
      if (a.texts.join('\n') !== b.texts.join('\n')) {
        const A = new Set(a.texts), B = new Set(b.texts);
        diffs.push(`${k}: text differs (-${[...A].filter(x => !B.has(x)).length} +${[...B].filter(x => !A.has(x)).length}): ${[...A].filter(x => !B.has(x)).map(x => '-«' + x + '»').concat([...B].filter(x => !A.has(x)).map(x => '+«' + x + '»')).join(' ')}`);
      }
      if (a.blanks !== b.blanks) diffs.push(`${k}: blanks ${a.blanks} → ${b.blanks}`);
      if (a.symbols.join(' ') !== b.symbols.join(' ')) diffs.push(`${k}: symbols ${a.symbols.join('')} → ${b.symbols.join('')}`);
    }
    fs.writeFileSync(path.join(OUT, 'content-lock.diff.txt'), diffs.join('\n'));
    check('content-lock', diffs.length === 0, diffs.length ? `${diffs.length} difference(s), see content-lock.diff.txt` : '');
  }

  // ---------- print ----------
  await page.emulateMedia({ media: 'print' });
  for (const topic of TOPICS) {
    // the nav is display:none in print, so switch topics through the button's own handler
    await page.$eval(`.top button[data-id="${topic}"]`, b => b.click());
    await page.waitForTimeout(80);
    const nav = await page.$eval('.top', el => getComputedStyle(el).display);
    check(`print-hides-nav ${topic}`, nav === 'none', nav);
    const rects = await page.$$eval(`#${topic} .sheet`, els => els.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    check(`print-a4-size ${topic}`, rects.length === 5 && rects.every(([w, h]) => Math.abs(w - MM.w) <= 2 && Math.abs(h - MM.h) <= 2), JSON.stringify(rects.map(r => r.map(v => +v.toFixed(1)))));
    const hiddenOthers = await page.$$eval('.topic', (els, t) => els.filter(e => e.id !== t).every(e => getComputedStyle(e).display === 'none'), topic);
    check(`print-only-active-topic ${topic}`, hiddenOthers, '');
    if (!NO_PDF) {
      const pdf = path.join(OUT, `${topic}.pdf`);
      await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      const py = spawnSync(PYTHON, [path.join(here, 'pdf_pages.py'), pdf, OUT, `print-${topic}`], { encoding: 'utf8' });
      if (py.status !== 0) { record(`pdf-pages ${topic}`, false, (py.stderr || py.stdout || '').trim().slice(0, 300)); continue; }
      const info = JSON.parse(py.stdout.trim().split('\n').pop());
      check(`pdf-page-count ${topic}`, info.count === 5, `${info.count} pages`);
      check(`pdf-a4-points ${topic}`, info.pages.every(p => Math.abs(p.width_pt - 595.3) < 1 && Math.abs(p.height_pt - 841.9) < 1), JSON.stringify(info.pages.map(p => [p.width_pt, p.height_pt])));
      check(`pdf-no-blank-pages ${topic}`, info.pages.every(p => p.ink > 0.003), JSON.stringify(info.pages.map(p => p.ink)));
      info.pages.forEach((p, i) => {
        const screen = path.join(OUT, `${topic}-${i + 1}.png`);
        if (!fs.existsSync(screen) || !fs.existsSync(p.png)) return;
        const a = PNG.sync.read(fs.readFileSync(screen)), b = PNG.sync.read(fs.readFileSync(p.png));
        if (a.width !== b.width || a.height !== b.height) { record(`pdf-vs-screen ${topic}-${i + 1}`, false, `size ${a.width}x${a.height} vs ${b.width}x${b.height}`); return; }
        const diff = new PNG({ width: a.width, height: a.height });
        const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.25 });
        fs.writeFileSync(path.join(OUT, `diff-print-${topic}-${i + 1}.png`), PNG.sync.write(diff));
        const rows = w => { const out = new Float64Array(a.height); for (let y = 0; y < a.height; y++) { let s = 0; for (let x = 0; x < a.width; x++) s += w.data[(y * a.width + x) * 4] < 200 ? 1 : 0; out[y] = s; } return out; };
        const ra = rows(a), rb = rows(b); let ma = 0, mb = 0; for (let y = 0; y < a.height; y++) { ma += ra[y]; mb += rb[y]; } ma /= a.height; mb /= a.height;
        let num = 0, da = 0, db = 0; for (let y = 0; y < a.height; y++) { num += (ra[y] - ma) * (rb[y] - mb); da += (ra[y] - ma) ** 2; db += (rb[y] - mb) ** 2; }
        const corr = num / Math.sqrt(da * db || 1);
        const pct = n / (a.width * a.height) * 100;
        check(`pdf-vs-screen ${topic}-${i + 1}`, pct < 6, `pixel diff ${pct.toFixed(2)}%, row-profile correlation ${corr.toFixed(3)}`);
      });
    }
  }
  await page.emulateMedia({ media: 'screen' });
  await page.close();

  // ---------- mobile ----------
  const mctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL' });
  const mp = await mctx.newPage();
  mp.on('console', m => { if (m.type() === 'error') consoleErrors.push(`mobile ${m.type()}: ${m.text()}`); });
  mp.on('pageerror', e => consoleErrors.push(`mobile pageerror: ${e.message}`));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.evaluate(() => document.fonts?.ready);
  await mp.evaluate(LIB);
  await mp.waitForTimeout(150);
  for (const topic of TOPICS) {
    await mp.click(`.top button[data-id="${topic}"]`);
    await mp.waitForTimeout(120);
    const info = await mp.$$eval(`#${topic} .sheet`, els => els.map(e => { const r = e.getBoundingClientRect(); const lbl = [...e.querySelectorAll('text.lbl')].map(t => t.getBoundingClientRect().height); return { w: r.width, h: r.height, left: r.left, right: r.right, minLabel: lbl.length ? Math.min(...lbl) : null }; }));
    const docW = await mp.evaluate(() => document.documentElement.scrollWidth);
    const expectedW = MOBILE.width - 12, expectedH = expectedW * A4.h / A4.w;
    check(`mobile-count ${topic}`, info.length === 5, `${info.length}`);
    check(`mobile-scale ${topic}`, info.every(s => Math.abs(s.w - expectedW) <= 2 && Math.abs(s.h - expectedH) <= 2 && s.left >= -0.5 && s.right <= MOBILE.width + 0.5), JSON.stringify(info.map(s => [s.w, s.h, s.left, s.right].map(v => +v.toFixed(1)))));
    check(`mobile-no-horizontal-scroll ${topic}`, docW <= MOBILE.width, `scrollWidth ${docW}`);
    check(`mobile-label-legible ${topic}`, info.every(s => s.minLabel === null || s.minLabel >= 7), `min label ${Math.min(...info.map(s => s.minLabel ?? 99)).toFixed(1)}px`);
    const first = await mp.$(`#${topic} .sheet`);
    await first.screenshot({ path: path.join(OUT, `mobile-${topic}-1.png`) });
  }
  await mp.screenshot({ path: path.join(OUT, 'mobile-viewport.png') });
  await mp.close();

  // ---------- console ----------
  check('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

  // ---------- canva source package ----------
  const srcDir = path.join(here, '..', 'canva-source');
  const need = ['README.md', 'manifest.json', ...['rectangle', 'rhombus'].flatMap(t => [1, 2, 3, 4, 5].map(n => `${t}/page-${n}.png`))];
  const missing = need.filter(f => !fs.existsSync(path.join(srcDir, f)));
  check('canva-source-files', missing.length === 0, missing.join(', '));
  if (!missing.length) {
    const bad = need.filter(f => f.endsWith('.png')).filter(f => { try { const p = PNG.sync.read(fs.readFileSync(path.join(srcDir, f))); return !(p.width > 0 && p.height > 0); } catch { return true; } });
    check('canva-source-png-valid', bad.length === 0, bad.join(', '));
  }
} finally {
  await browser.close();
}

// ---------- report ----------
const failed = results.filter(r => !r.ok);
const md = [`# Quadrilaterals QA report`, ``, `Target: ${URL}`, `Checks: ${results.length}, failed: ${failed.length}`, ``, `| result | test | detail |`, `|---|---|---|`, ...results.map(r => `| ${r.ok ? 'PASS' : '**FAIL**'} | ${r.test} | ${String(r.msg).replace(/\|/g, '\\|').slice(0, 220)} |`)].join('\n');
fs.writeFileSync(path.join(OUT, 'report.md'), md);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ url: URL, results, consoleErrors }, null, 2));
console.log(`\n${results.length} checks, ${failed.length} failed. Report: ${path.join(OUT, 'report.md')}`);
process.exit(failed.length && !BASELINE ? 1 : 0);
