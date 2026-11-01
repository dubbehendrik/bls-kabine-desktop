import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { brushMeta, parseMeasurement, readXlsx } from '../src/apps/bls-bahnplanung/measurement';
import { fitSpot, fitTracks, trackProfile } from '../src/apps/bls-bahnplanung/fit';
const load = async (name: string) => { const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url)); return parseMeasurement(await readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); };
describe('Synthetic measuring-table files (truth a 85, b 28, m 5, k 0.9, n 2.2, l 1.6, γ 0.4, AWG 62 %)', () => {
  it('fits crossed single tracks A and B', async () => {
    const a = await load('Messung_Blech_A_Strahl_quer.xlsx'), b = await load('Messung_Blech_B_Strahl_laengs.xlsx'), ma = brushMeta(a.meta), mb = brushMeta(b.meta);
    expect(ma.role).toBe('A'); expect(mb.role).toBe('B'); expect(ma.travel).toBe('y'); expect(a.rejected).toBe(1); expect(a.points.length).toBe(195);
    const track = (m: typeof a, meta: typeof ma, role: 'A' | 'B') => { const p = trackProfile(m.points, meta.travel!); return { role, speed: meta.speed, q: meta.q, solids: meta.solids, dry: meta.dry!, pos: p.pos, h: p.h }; };
    const r = fitTracks(track(a, ma, 'A'), track(b, mb, 'B'));
    console.log('tracks', JSON.stringify(r.estimates.map(e => [e.key, +e.value.toFixed(2), e.sd && +e.sd.toFixed(2), e.weak])), r.rmse.toFixed(2), r.notes);
    expect(Math.abs(r.shape.a - 85)).toBeLessThan(4); expect(Math.abs(r.shape.b - 28)).toBeLessThan(4); expect(Math.abs(r.awg - 62)).toBeLessThan(3);
  }, 60000);
  it('fits the stationary image', async () => {
    const s = await load('Messung_Standbild.xlsx'), m = brushMeta(s.meta);
    expect(m.role).toBe('spot'); expect(m.time).toBe(.5);
    const r = fitSpot({ time: m.time, q: m.q, solids: m.solids, dry: true, points: s.points });
    console.log('spot', JSON.stringify(r.estimates.map(e => [e.key, +e.value.toFixed(2), e.sd && +e.sd.toFixed(2), e.weak])), r.rmse.toFixed(2), r.offsets, r.notes);
    expect(Math.abs(r.shape.a - 85)).toBeLessThan(4); expect(Math.abs(r.offsets.theta! * 180 / Math.PI - 3)).toBeLessThan(1);
  }, 60000);
});
