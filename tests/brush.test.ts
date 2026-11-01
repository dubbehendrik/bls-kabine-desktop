import { describe, it, expect } from 'vitest';
import { projectionU, projectionV, shapeKernel, fwhm, presets, type Shape } from '../src/apps/bls-bahnplanung/brush';
import { fitSpot, fitTracks, trackProfile, type Point } from '../src/apps/bls-bahnplanung/fit';
import { parseMeasurement, readCsv, brushMeta } from '../src/apps/bls-bahnplanung/measurement';
import { defaults, kernel, simulate } from '../src/apps/bls-bahnplanung/model';

const truth: Shape = { a: 85, b: 28, m: 5, k: .9, n: 2.2, l: 1.6, g: .4 };
const integrate1 = (f: (x: number) => number, lo: number, hi: number, n = 2000) => { let s = 0; for (let i = 0; i < n; i++) s += f(lo + (i + .5) * (hi - lo) / n); return s * (hi - lo) / n; };
let seed = 7; const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - .5) * 2; };

describe('Beta brush', () => {
  it('is normalized and its projections integrate to one', () => {
    for (const s of [truth, ...presets.map(p => p.shape)]) {
      let sum = 0; for (let u = -150; u < 150; u += .5) for (let v = -80; v < 80; v += .5) sum += shapeKernel(u + .25, v + .25, s) * .25;
      expect(sum).toBeCloseTo(1, 2);
      expect(integrate1(u => projectionU(u, s), -150, 150)).toBeCloseTo(1, 3);
      expect(integrate1(v => projectionV(v, s), -80, 80, 800)).toBeCloseTo(1, 2);
    }
  });
  it('bone parameter moves material to the fan ends', () => {
    const flat = presets[1].shape, bone = presets[2].shape;
    expect(projectionU(.8 * bone.a, bone) / projectionU(0, bone)).toBeGreaterThan(projectionU(.8 * flat.a, flat) / projectionU(0, flat));
  });
  it('flat exponent widens the half-width of the track', () => {
    expect(fwhm(u => projectionU(u, { ...truth, m: 8, g: 0 }), 150)).toBeGreaterThan(fwhm(u => projectionU(u, { ...truth, m: 2, g: 0 }), 150));
  });
  it('drives the simulation when selected and keeps the Gaussian as default', () => {
    expect(kernel(0, 0, defaults)).toBeGreaterThan(0);
    const p = { ...defaults, source: 'designer' as const, mode: 'spot', spot: 1, orientation: 0 };
    expect(kernel(p.ba * 1.01, 0, p)).toBe(0);
    const r = simulate(p), f = r.frames.at(-1)!, volume = f.z.reduce((a, b) => a + b, 0) * r.dx * r.dy / 1e6;
    expect(volume / (f.used - p.q / 60)).toBeCloseTo(p.awg / 100, 1);
  });
});

describe('Brush fit', () => {
  it('recovers the brush from two crossed single tracks', () => {
    const c = { q: 120, solids: 50, dry: true, speed: 100 }, F = 1000 * .65 * .5 * c.q / 60 * 1000 / c.speed;
    const pos = Array.from({ length: 49 }, (_, i) => 4 + i * 4);
    const A = { ...c, role: 'A' as const, pos, h: pos.map(x => F * projectionU(x - 101, truth) + noise()) };
    const B = { ...c, role: 'B' as const, pos, h: pos.map(x => F * projectionV(x - 99, truth) + noise()) };
    const r = fitTracks(A, B);
    expect(r.shape.a).toBeGreaterThan(80); expect(r.shape.a).toBeLessThan(90);
    expect(r.shape.b).toBeGreaterThan(24); expect(r.shape.b).toBeLessThan(33);
    expect(r.awg).toBeGreaterThan(62); expect(r.awg).toBeLessThan(68);
    expect(r.offsets.a).toBeCloseTo(101, 0);
    expect(r.rmse).toBeLessThan(1.5);
  }, 60000);
  it('recovers centre and rotation from a stationary image', () => {
    const t = 1, F = 1000 * .65 * .5 * 120 / 60 * 1000 * t, th = .1, pts: Point[] = [];
    for (let x = 2.5; x < 200; x += 5) for (let y = 2.5; y < 100; y += 5) { const dx = x - 100, dy = y - 50; pts.push({ x, y, h: F * shapeKernel(dx * Math.cos(th) + dy * Math.sin(th), -dx * Math.sin(th) + dy * Math.cos(th), truth) + noise() }); }
    const r = fitSpot({ q: 120, solids: 50, dry: true, time: t, points: pts });
    expect(r.offsets.theta).toBeCloseTo(th, 1);
    expect(r.shape.a).toBeGreaterThan(80); expect(r.shape.a).toBeLessThan(90);
    expect(r.awg).toBeGreaterThan(60); expect(r.awg).toBeLessThan(70);
  }, 60000);
  it('averages lines along the track', () => {
    const p = trackProfile([{ x: 10, y: 30, h: 1 }, { x: 10, y: 50, h: 3 }, { x: 20, y: 30, h: 5 }], 'y');
    expect(p.pos).toEqual([10, 20]); expect(p.h).toEqual([2, 5]); expect(p.lines).toBe(2);
  });
});

describe('Measurement import', () => {
  it('reads table exports, drops invalid rows and averages runs', () => {
    const m = parseMeasurement(readCsv('Messpunkt;Blech X / mm;Blech Y / mm;Schichtdicke / µm;Status\n1;10;10;100;Gültig\n2;10;10;104;Gültig\n3;20;10;5;Fehler\n'));
    expect(m.points).toEqual([{ x: 10, y: 10, h: 102 }]); expect(m.rejected).toBe(1);
  });
  it('understands optional brush metadata', () => {
    const b = brushMeta({ 'Brush: Szenario': 'Einzelbahn B', 'Brush: Geschwindigkeit / mm/s': 150, 'Brush: Schicht': 'trocken', 'Länge / mm': 200 });
    expect(b.role).toBe('B'); expect(b.speed).toBe(150); expect(b.dry).toBe(true); expect(b.length).toBe(200);
  });
});
