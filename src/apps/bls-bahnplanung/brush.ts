// Beta-type spray brush (stationary deposition rate) in the nozzle frame.
// u = long fan axis, v = short fan axis, both in mm. The raw shape
//   R(u,v) = (1 + g·t²) · (1 − |t|^m)^k · (1 − |w|^n)^l,  t = u/a,  w = v/b(t),  b(t) = b·(1 + c·g·t²)
// is normalized numerically to ∫∫K du dv = 1 (unit 1/mm²). g > 0 moves material to the
// fan ends and widens them ("Knochenform"); c couples widening to g.
export type Shape = { a: number; b: number; m: number; k: number; n: number; l: number; g: number };
export const WIDEN = .35;
const NU = 400, NV = 400, NP = 240;

const fu = (t: number, s: Shape) => { const at = Math.abs(t); return at >= 1 ? 0 : (1 + s.g * t * t) * Math.pow(1 - Math.pow(at, s.m), s.k); };
const gv = (w: number, s: Shape) => { const aw = Math.abs(w); return aw >= 1 ? 0 : Math.pow(1 - Math.pow(aw, s.n), s.l); };
const bw = (t: number, s: Shape) => s.b * (1 + WIDEN * s.g * t * t);

let cacheKey = '', cacheValue = { z: 1, gint: 1 };
/** Normalization constant Z (mm²) and ∫g dw over [−1, 1]. Midpoint rule; edges with k,l < 1 stay integrable. */
export function normalization(s: Shape) {
  const key = `${s.a},${s.b},${s.m},${s.k},${s.n},${s.l},${s.g}`;
  if (key === cacheKey) return cacheValue;
  let gint = 0; for (let i = 0; i < NV; i++) gint += gv(-1 + (i + .5) * 2 / NV, s) * 2 / NV;
  let iu = 0; for (let i = 0; i < NU; i++) { const t = -1 + (i + .5) * 2 / NU; iu += fu(t, s) * bw(t, s) * 2 / NU; }
  cacheKey = key; cacheValue = { z: Math.max(1e-12, s.a * iu * gint), gint };
  return cacheValue;
}
/** Normalized stationary brush K(u,v) in 1/mm². */
export function shapeKernel(u: number, v: number, s: Shape) {
  const t = u / s.a; if (Math.abs(t) >= 1) return 0;
  return fu(t, s) * gv(v / bw(t, s), s) / normalization(s).z;
}
/** Projection along v (track with fan across the travel direction, "Blech A"): ∫K dv in 1/mm. */
export function projectionU(u: number, s: Shape) {
  const t = u / s.a; if (Math.abs(t) >= 1) return 0;
  const { z, gint } = normalization(s);
  return fu(t, s) * bw(t, s) * gint / z;
}
/** Projection along u (track with fan along the travel direction, "Blech B"): ∫K du in 1/mm. */
export function projectionV(v: number, s: Shape) { return projectionsV([v], s)[0]; }
export function projectionsV(vs: number[], s: Shape) {
  const { z } = normalization(s), f: number[] = [], w: number[] = [];
  for (let i = 0; i < NP; i++) { const t = -1 + (i + .5) * 2 / NP, a = fu(t, s); if (a > 0) { f.push(a); w.push(1 / bw(t, s)); } }
  return vs.map(v => { let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * gv(v * w[i], s); return sum * s.a * 2 / NP / z; });
}
/** Outer half axes of the brush in mm. */
export const shapeExtent = (s: Shape) => ({ ru: s.a, rv: s.b * (1 + WIDEN * s.g) });
/** Full width at half maximum of a sampled profile (mm). */
export function fwhm(f: (x: number) => number, half: number) {
  const n = 801, xs = Array.from({ length: n }, (_, i) => -half + i * 2 * half / (n - 1)), ys = xs.map(f), max = Math.max(...ys);
  if (!(max > 0)) return 0;
  const first = ys.findIndex(y => y >= max / 2), last = n - 1 - [...ys].reverse().findIndex(y => y >= max / 2);
  const cross = (i: number, j: number) => xs[i] + (max / 2 - ys[i]) / (ys[j] - ys[i] || 1) * (xs[j] - xs[i]);
  const left = first > 0 ? cross(first - 1, first) : xs[0], right = last < n - 1 ? cross(last, last + 1) : xs[n - 1];
  return right - left;
}
/** Layer thickness factor in µm: 1000 µm/mm · η · φ · V̇ with V̇ in mm³/s from ml/min. */
export const rateFactor = (q: number, efficiency: number, solidsFraction: number) => 1000 * efficiency * solidsFraction * q / 60 * 1000;
export const presets: { name: string; shape: Shape }[] = [
  { name: 'Ellipse', shape: { a: 80, b: 35, m: 2, k: 1.5, n: 2, l: 1.5, g: 0 } },
  { name: 'RP-Plateau', shape: { a: 90, b: 30, m: 6, k: .8, n: 2, l: 1.5, g: 0 } },
  { name: 'Knochen', shape: { a: 90, b: 30, m: 6, k: .8, n: 2, l: 1.5, g: 1.6 } },
];
