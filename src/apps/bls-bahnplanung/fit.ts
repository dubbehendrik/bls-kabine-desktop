import { projectionU, projectionsV, rateFactor, shapeKernel, type Shape } from './brush';

export type Point = { x: number; y: number; h: number };
/** Conditions of one measured sheet. Thickness in µm, dry or wet. */
export type Conditions = { q: number; solids: number; dry: boolean };
export type TrackData = Conditions & { role: 'A' | 'B'; speed: number; pos: number[]; h: number[] };
export type SpotData = Conditions & { time: number; points: Point[] };
export type Estimate = { key: string; label: string; unit: string; value: number; sd: number | null; weak: boolean };
export type FitResult = {
  shape: Shape; awg: number; estimates: Estimate[]; rmse: number; r2: number; n: number; notes: string[];
  offsets: { a?: number; b?: number; x0?: number; y0?: number; theta?: number };
};

type Bound = { key: string; label: string; unit: string; lo: number; hi: number };
const shapeBounds: Bound[] = [
  { key: 'a', label: 'Halbe Länge a', unit: 'mm', lo: 5, hi: 300 },
  { key: 'b', label: 'Halbe Breite b', unit: 'mm', lo: 2, hi: 200 },
  { key: 'm', label: 'Flachheit lang m', unit: '', lo: 1.2, hi: 12 },
  { key: 'k', label: 'Kante lang k', unit: '', lo: .1, hi: 5 },
  { key: 'n', label: 'Flachheit kurz n', unit: '', lo: 1.2, hi: 10 },
  { key: 'l', label: 'Kante kurz l', unit: '', lo: .1, hi: 5 },
  { key: 'g', label: 'Knochen γ', unit: '', lo: 0, hi: 4 },
  { key: 'awg', label: 'Auftragswirkungsgrad', unit: '%', lo: 1, hi: 150 },
];
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const toZ = (v: number, b: Bound) => { const f = Math.min(.999, Math.max(.001, (v - b.lo) / (b.hi - b.lo))); return Math.log(f / (1 - f)); };
const fromZ = (z: number, b: Bound) => b.lo + (b.hi - b.lo) * sig(z);

/** Nelder–Mead simplex minimizer (unconstrained, used on logit-transformed parameters). */
export function nelderMead(f: (x: number[]) => number, x0: number[], iterations = 3000, step = .4) {
  const n = x0.length; let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => j === i ? v + step : v))].map(x => ({ x, f: f(x) }));
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.f - b.f);
    const best = simplex[0], worst = simplex[n], second = simplex[n - 1];
    if (Math.abs(worst.f - best.f) <= 1e-10 * (Math.abs(best.f) + 1e-12)) break;
    const c = x0.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p.x[j], 0) / n);
    const along = (t: number) => c.map((v, j) => v + t * (worst.x[j] - v));
    const r = along(-1), fr = f(r);
    if (fr < best.f) { const e = along(-2), fe = f(e); simplex[n] = fe < fr ? { x: e, f: fe } : { x: r, f: fr }; continue; }
    if (fr < second.f) { simplex[n] = { x: r, f: fr }; continue; }
    const k = fr < worst.f ? along(-.5) : along(.5), fk = f(k);
    if (fk < Math.min(fr, worst.f)) { simplex[n] = { x: k, f: fk }; continue; }
    simplex = simplex.map((p, i) => i === 0 ? p : (() => { const x = p.x.map((v, j) => best.x[j] + .5 * (v - best.x[j])); return { x, f: f(x) }; })());
  }
  simplex.sort((a, b) => a.f - b.f); return simplex[0];
}

function invert(m: number[][]): number[][] | null {
  const n = m.length, a = m.map((row, i) => [...row, ...row.map((_, j) => i === j ? 1 : 0)]);
  const scale = Math.max(...m.map((r, i) => Math.abs(r[i])), 1e-300);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12 * scale) return null;
    [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c]; for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map(r => r.slice(n));
}

/** Least squares fit with logit-bounded parameters, restarts and Jacobian-based standard deviations. */
function solve(bounds: Bound[], start: number[], residuals: (v: number[]) => number[], measured: number[], fixed: Set<string> = new Set()) {
  const free = bounds.map((b, i) => fixed.has(b.key) ? -1 : i).filter(i => i >= 0);
  const full = (z: number[]) => { const v = [...start]; free.forEach((i, j) => { v[i] = fromZ(z[j], bounds[i]); }); return v; };
  const sse = (v: number[]) => residuals(v).reduce((s, r) => s + r * r, 0);
  let best = nelderMead(z => sse(full(z)), free.map(i => toZ(start[i], bounds[i])));
  for (let restart = 0; restart < 2; restart++) best = nelderMead(z => sse(full(z)), best.x, 2000, .15);
  const value = full(best.x), res = residuals(value), n = res.length, p = free.length;
  const rmse = Math.sqrt(best.f / n), mean = measured.reduce((s, v) => s + v, 0) / n;
  const r2 = 1 - best.f / Math.max(1e-12, measured.reduce((s, v) => s + (v - mean) ** 2, 0));
  const jac = free.map(i => { const h = 1e-4 * Math.max(Math.abs(value[i]), (bounds[i].hi - bounds[i].lo) * .01); const up = [...value]; up[i] += h; const r = residuals(up); return r.map((v, k) => (v - res[k]) / h); });
  const jtj = jac.map(a => jac.map(b => a.reduce((s, v, k) => s + v * b[k], 0))), cov = invert(jtj), s2 = best.f / Math.max(1, n - p);
  const sd = bounds.map((_, i) => { const j = free.indexOf(i); if (j < 0 || !cov) return null; const v = cov[j][j] * s2; return v >= 0 && Number.isFinite(v) ? Math.sqrt(v) : null; });
  return { value, sd, rmse, r2, n };
}

function estimates(bounds: Bound[], value: number[], sd: (number | null)[], fixed: Set<string>, notes: string[]) {
  return bounds.map((b, i) => {
    const atBound = !fixed.has(b.key) && (value[i] - b.lo < .01 * (b.hi - b.lo) || b.hi - value[i] < .01 * (b.hi - b.lo));
    const weak = fixed.has(b.key) || sd[i] === null || atBound || (sd[i]! > .5 * Math.max(Math.abs(value[i]), (b.hi - b.lo) * .05));
    if (atBound && b.key !== 'g') notes.push(`${b.label} liegt an der Grenze des zulässigen Bereichs.`);
    return { key: b.key, label: b.label, unit: b.unit, value: value[i], sd: fixed.has(b.key) ? null : sd[i], weak };
  });
}
const toShape = (v: number[]): Shape => ({ a: v[0], b: v[1], m: v[2], k: v[3], n: v[4], l: v[5], g: v[6] });
const factor = (c: Conditions, awg: number) => rateFactor(c.q, awg / 100, c.dry ? c.solids / 100 : 1);
const area = (pos: number[], h: number[]) => { const o = pos.map((x, i) => [x, h[i]]).sort((a, b) => a[0] - b[0]); let s = 0; for (let i = 1; i < o.length; i++) s += (o[i][0] - o[i - 1][0]) * (o[i][1] + o[i - 1][1]) / 2; return s; };
function support(pos: number[], h: number[]) {
  const max = Math.max(...h), idx = h.map((v, i) => v > .03 * max ? i : -1).filter(i => i >= 0);
  const xs = idx.map(i => pos[i]), w = idx.map(i => h[i]), sw = w.reduce((s, v) => s + v, 0);
  return { center: xs.reduce((s, x, i) => s + x * w[i], 0) / sw, half: Math.max(3, (Math.max(...xs) - Math.min(...xs)) / 2 * 1.05) };
}

/** Joint fit of two single tracks: A = fan across travel (long axis profile), B = fan along travel (short axis profile). */
export function fitTracks(A: TrackData, B: TrackData, fixG = false): FitResult {
  const notes: string[] = [], sa = support(A.pos, A.h), sb = support(B.pos, B.h);
  const etaA = area(A.pos, A.h) * A.speed / factor(A, 1) * 100, etaB = area(B.pos, B.h) * B.speed / factor(B, 1) * 100;
  const ratio = etaB / etaA;
  if (Math.abs(ratio - 1) > .15) notes.push(`Die Flächen unter den Profilen passen nicht zusammen (B/A = ${ratio.toFixed(2)}). Geschwindigkeit, Lackmenge oder Überlauf prüfen.`);
  const span = (d: TrackData) => [Math.min(...d.pos), Math.max(...d.pos)];
  const [a0, a1] = span(A); if (sa.center - sa.half < a0 + 2 || sa.center + sa.half > a1 - 2) notes.push('Profil A reicht bis an den Blechrand. Die Flanken der langen Achse sind dann unsicher.');
  const bounds: Bound[] = [...shapeBounds, { key: 'xa', label: 'Bahnmitte A', unit: 'mm', lo: sa.center - 40, hi: sa.center + 40 }, { key: 'xb', label: 'Bahnmitte B', unit: 'mm', lo: sb.center - 40, hi: sb.center + 40 }];
  const start = [sa.half, sb.half, 4, 1, 2, 1.5, fixG ? 0 : .2, Math.min(140, Math.max(5, (etaA + etaB) / 2)), sa.center, sb.center];
  const fixed = new Set(fixG ? ['g'] : []);
  const model = (v: number[]) => { const s = toShape(v); return [...A.pos.map(x => factor(A, v[7]) / A.speed * projectionU(x - v[8], s)), ...projectionsV(B.pos.map(x => x - v[9]), s).map(p => factor(B, v[7]) / B.speed * p)]; };
  const measured = [...A.h, ...B.h], r = solve(bounds, start, v => model(v).map((m, i) => m - measured[i]), measured, fixed);
  const est = estimates(bounds, r.value, r.sd, fixed, notes);
  if (est.find(e => e.key === 'g')?.weak) notes.push('γ (Knochenform) ist aus diesen Einzelbahnen nur schwach bestimmbar: Die Verbreiterung der Enden zeigt sich fast nur in Profil B. Zur Kontrolle ein Standbild messen.');
  return { shape: toShape(r.value), awg: r.value[7], estimates: est.slice(0, 8), rmse: r.rmse, r2: r.r2, n: r.n, notes, offsets: { a: r.value[8], b: r.value[9] } };
}

/** Fit of a rastered stationary spray image including centre and rotation of the long axis against sheet X. */
export function fitSpot(S: SpotData): FitResult {
  const notes: string[] = [], pts = S.points, max = Math.max(...pts.map(p => p.h)), hot = pts.filter(p => p.h > .05 * max);
  const sw = hot.reduce((s, p) => s + p.h, 0), cx = hot.reduce((s, p) => s + p.x * p.h, 0) / sw, cy = hot.reduce((s, p) => s + p.y * p.h, 0) / sw;
  const sxx = hot.reduce((s, p) => s + p.h * (p.x - cx) ** 2, 0), syy = hot.reduce((s, p) => s + p.h * (p.y - cy) ** 2, 0), sxy = hot.reduce((s, p) => s + p.h * (p.x - cx) * (p.y - cy), 0);
  const th = .5 * Math.atan2(2 * sxy, sxx - syy), along = (p: Point) => (p.x - cx) * Math.cos(th) + (p.y - cy) * Math.sin(th), across = (p: Point) => -(p.x - cx) * Math.sin(th) + (p.y - cy) * Math.cos(th);
  const hw = hot.filter(p => p.h > .03 * max), a0 = Math.max(...hw.map(p => Math.abs(along(p)))) * 1.05, b0 = Math.max(...hw.map(p => Math.abs(across(p)))) * 1.05;
  const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b), ys = [...new Set(pts.map(p => p.y))].sort((a, b) => a - b);
  const step = (v: number[]) => { const d = v.slice(1).map((x, i) => x - v[i]).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : 1; };
  const volume = pts.reduce((s, p) => s + p.h, 0) * step(xs) * step(ys), eta0 = volume / (factor(S, 1) * S.time) * 100;
  const bounds: Bound[] = [...shapeBounds, { key: 'x0', label: 'Mitte X', unit: 'mm', lo: cx - 30, hi: cx + 30 }, { key: 'y0', label: 'Mitte Y', unit: 'mm', lo: cy - 30, hi: cy + 30 }, { key: 'th', label: 'Drehung lange Achse', unit: 'rad', lo: th - Math.PI / 4, hi: th + Math.PI / 4 }];
  const start = [a0, b0, 4, 1, 2, 1.5, .2, Math.min(140, Math.max(5, eta0)), cx, cy, th];
  const model = (v: number[]) => { const s = toShape(v), F = factor(S, v[7]) * S.time, c = Math.cos(v[10]), si = Math.sin(v[10]); return pts.map(p => { const dx = p.x - v[8], dy = p.y - v[9]; return F * shapeKernel(dx * c + dy * si, -dx * si + dy * c, s); }); };
  const measured = pts.map(p => p.h), r = solve(bounds, start, v => model(v).map((m, i) => m - measured[i]), measured);
  const est = estimates(bounds, r.value, r.sd, new Set(), notes);
  const edge = pts.filter(p => p.x === xs[0] || p.x === xs.at(-1) || p.y === ys[0] || p.y === ys.at(-1));
  if (edge.some(p => p.h > .1 * max)) notes.push('Das Spritzbild reicht über das Messraster hinaus. Größeres Blech oder kleineren Abstand wählen.');
  return { shape: toShape(r.value), awg: r.value[7], estimates: est.slice(0, 8), rmse: r.rmse, r2: r.r2, n: r.n, notes, offsets: { x0: r.value[8], y0: r.value[9], theta: r.value[10] } };
}

/** Mean profile across the track: travel along sheet Y → profile over sheet X (and vice versa). */
export function trackProfile(points: Point[], travel: 'x' | 'y') {
  const groups = new Map<number, number[]>();
  for (const p of points) { const key = Math.round((travel === 'y' ? p.x : p.y) * 100) / 100; groups.set(key, [...(groups.get(key) || []), p.h]); }
  const pos = [...groups.keys()].sort((a, b) => a - b);
  return { pos, h: pos.map(k => { const v = groups.get(k)!; return v.reduce((s, x) => s + x, 0) / v.length; }), lines: Math.max(...[...groups.values()].map(v => v.length)) };
}
