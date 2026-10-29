export type Params = {
  mode: string; q: number; atom: number; horn: number; distance: number; orientation: number;
  solids: number; density: number; viscosity: number; material: string;
  speed: number; spacing: number; over: number; passes: number; flash: number; spot: number;
  width: number; height: number; deltaY: number; nozzle: number;
};
export const materials = [
  { id: '2k-solvent', name: '2K-Lösemittellack · Beispiel', density: 1.2, viscosity: 100, solids: 50 },
  { id: '1k-water', name: '1K-Wasserbasislack · Beispiel', density: 1.1, viscosity: 150, solids: 35 },
  { id: '2k-water', name: '2K-Wasserlack · Beispiel', density: 1.2, viscosity: 180, solids: 45 },
];
export const defaults: Params = {
  mode: 'meander', q: 80, atom: 2, horn: 1.5, distance: 150, orientation: 90,
  solids: 50, density: 1.2, viscosity: 100, material: '2k-solvent',
  speed: 200, spacing: 30, over: 60, passes: 1, flash: 0, spot: 1, width: 200, height: 100, deltaY: 0, nozzle: 1.5,
};
export type Pose = { x: number; y: number; angle: number; phase: string; on: boolean };
export type Segment = { a: Pose; b: Pose; start: number; duration: number };
export type Lamp = { label: string; color: 'green' | 'white'; state: 'off' | 'on' | 'blink' };
export function lamps(pose: Pose, time: number, duration: number): Lamp[] {
  const active = time > 0 && time < duration;
  return [
    { label: 'Auto Start · Schutztür verriegeln', color: 'green', state: active ? 'on' : 'off' },
    { label: 'Spritzapplikation Start', color: 'green', state: !active ? 'off' : pose.phase === 'Startfreigabe' ? 'blink' : pose.phase === 'Spritze entnehmen' ? 'off' : 'on' },
    { label: 'Spritze entnehmen', color: 'white', state: active && pose.phase === 'Spritze entnehmen' ? 'on' : 'off' },
    { label: 'Spritze anfahren', color: 'white', state: active && ['Spritze anfahren', 'Anspritzen'].includes(pose.phase) ? 'on' : 'off' },
  ];
}
export function brush(p: Params) {
  const base = 18 * p.distance / 200 * Math.pow(Math.max(.2, p.atom) / 2, .12);
  return { sx: base * (1 + 1.2 * p.horn), sy: base / (1 + .16 * p.horn) };
}
export function kernel(x: number, y: number, p: Params) {
  const { sx, sy } = brush(p), a = p.orientation * Math.PI / 180;
  const u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a);
  return Math.exp(-.5 * ((u / sx) ** 2 + (v / sy) ** 2)) / (2 * Math.PI * sx * sy);
}
export function plan(p: Params) {
  const segments: Segment[] = [];
  let time = 0, cur: Pose = { x: p.width / 2 + p.over, y: 0, angle: 0, phase: 'Bereit', on: false };
  const move = (x: number, y: number, angle: number, phase: string, duration: number, on = true) => {
    const b = { x, y, angle, phase, on };
    segments.push({ a: { ...cur }, b, start: time, duration: Math.max(.001, duration) });
    time += Math.max(.001, duration); cur = b;
  };
  const finish = () => { move(cur.x, cur.y, cur.angle, 'Spritze entnehmen', 1.5, false); return segments; };
  move(cur.x, 0, 0, 'Startfreigabe', .8, false);
  move(cur.x, 0, 0, 'Spritze anfahren', .7, false);
  move(cur.x, 0, 0, 'Anspritzen', 1);
  if (p.mode === 'spot') {
    move(0, 0, 0, 'Positionieren', 1, false);
    move(0, 0, 0, 'Spritzbild', p.spot);
    return finish();
  }
  for (let pass = 0; pass < p.passes; pass++) {
    const angle = p.mode === 'cross' ? (pass % 2) * Math.PI / 2 : 0;
    const w = angle ? p.height : p.width, h = angle ? p.width : p.height, end = w / 2 + p.over;
    if (angle !== cur.angle) move(cur.x, cur.y, angle, 'Werkstück drehen', 2);
    const count = Math.max(0, Math.ceil((h + 2 * p.deltaY) / p.spacing));
    const rows = p.mode === 'single' ? [0] : Array.from({ length: count + 1 }, (_, i) => (i - count / 2) * p.spacing);
    move(end, rows[0], angle, 'Startposition', 1, false);
    for (let i = 0; i < rows.length; i++) {
      if (i) move(cur.x, rows[i], angle, 'Düsenversatz', .3 + Math.abs(rows[i] - rows[i - 1]) * .024);
      move(i % 2 ? end : -end, rows[i], angle, 'Beschichtungsbahn', 2 * end / p.speed);
    }
    if (pass < p.passes - 1 && p.flash > 0) move(cur.x, cur.y, angle, 'Ablüften', p.flash, false);
  }
  return finish();
}
export function at(segments: Segment[], t: number): Pose {
  const g = segments.find(g => t < g.start + g.duration) || segments[segments.length - 1];
  const f = Math.max(0, Math.min(1, (t - g.start) / g.duration));
  return { x: g.a.x + (g.b.x - g.a.x) * f, y: g.a.y + (g.b.y - g.a.y) * f,
    angle: g.a.angle + (g.b.angle - g.a.angle) * f, phase: g.b.phase, on: g.b.on && t < g.start + g.duration };
}
export function consumed(s: Segment[], t: number, q: number) {
  return Math.min(100, s.reduce((v, g) => v + (g.b.on ? Math.max(0, Math.min(g.duration, t - g.start)) : 0), 0) * q / 60);
}
/** Piston travel in mm; 30 mm is an approximate inner bore. */
export function pistonTravel(used: number) { return used * 1000 / (Math.PI * 15 ** 2); }
/** Color only: zero has a separate neutral color. Geometry and measurements remain linear. */
export function colorFraction(value: number, max: number, logarithmic: boolean) {
  const f = Math.max(0, Math.min(1, value / Math.max(1e-12, max)));
  return logarithmic ? Math.log1p(999 * f) / Math.log(1000) : f;
}
export function colorAt(value: number, max: number, logarithmic: boolean) {
  return value <= 1e-9 ? '#dbe3e8' : `hsl(${235 - 235 * colorFraction(value, max, logarithmic)} 83% 48%)`;
}
export function parseNumber(text: string, min: number, max: number): number | null {
  if (!text.trim()) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
export function simulate(p: Params) {
  const segments = plan(p), duration = segments.reduce((v, s) => v + s.duration, 0);
  const nx = 51, ny = 39, dx = p.width / nx, dy = p.height / ny;
  let used = 0, steps = 0;
  const z = new Float32Array(nx * ny);
  const frames = [{ time: 0, z: z.slice(), used: 0 }];
  for (const g of segments) {
    const n = Math.ceil(g.duration / Math.min(.04, 2 / p.speed));
    for (let k = 0; k < n; k++) {
      const dt = g.duration / n, t = g.start + (k + .5) * dt, pose = at(segments, t);
      const vol = g.b.on ? Math.min(p.q / 60 * dt, Math.max(0, 100 - used)) : 0;
      used += vol;
      if (vol && g.b.phase !== 'Anspritzen') {
        const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const u = -p.width / 2 + (i + .5) * dx, v = -p.height / 2 + (j + .5) * dy;
          z[j * nx + i] += vol * 1e6 * .7 * kernel(c * u - s * v - pose.x, s * u + c * v - pose.y, p);
        }
      }
      if (++steps % 10 === 0) frames.push({ time: t + dt / 2, z: z.slice(), used });
    }
  }
  frames.push({ time: duration, z: z.slice(), used });
  return { segments, duration, frames, nx, ny, dx, dy };
}
export type Result = ReturnType<typeof simulate>;
export function massBalance(p: Params, r: Result, frame: Result['frames'][number]) {
  const depositedVolume = frame.z.reduce((sum, value) => sum + value, 0) * r.dx * r.dy / 1e6;
  const sprayedSolids = frame.used * p.solids / 100; // ml of solid constituents
  const depositedSolids = depositedVolume * p.solids / 100;
  // Same coating composition: solid density cancels in m2/m1. Wet density is NOT solid density.
  const awg = sprayedSolids > 0 ? depositedSolids / sprayedSolids * 100 : null;
  return { depositedVolume, sprayedSolids, depositedSolids, awg, sprayedWetMass: frame.used * p.density,
    depositedWetMass: depositedVolume * p.density };
}
