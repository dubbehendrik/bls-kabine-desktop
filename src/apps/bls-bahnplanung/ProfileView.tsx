import { useEffect, useRef, useState } from 'react';
import { colorAt, type Params, type Result } from './model';
export type Axis = 'x' | 'y';
export function cutValues(r: Result, z: Float32Array, axis: Axis, fraction: number) {
  const n = axis === 'x' ? r.ny : r.nx, index = Math.max(0, Math.min(n - 1, Math.round(fraction * (n - 1))));
  return axis === 'x' ? Array.from({ length: r.nx }, (_, i) => z[index * r.nx + i]) : Array.from({ length: r.ny }, (_, j) => z[j * r.nx + index]);
}
const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
export default function ProfileView({ p, r, z, max, log, axis, fraction, showCut, dry }: {
  p: Params; r: Result; z: Float32Array; max: number; log: boolean; axis: Axis; fraction: number; showCut: boolean; dry: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(700), [yaw, setYaw] = useState(-35), [pitch, setPitch] = useState(55), [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  useEffect(() => { const ro = new ResizeObserver(e => setSize(e[0].contentRect.width)); if (host.current) ro.observe(host.current); return () => ro.disconnect(); }, []);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const w = Math.max(250, size), h = Math.min(550, Math.max(370, w * .67)), dpr = Math.min(2, devicePixelRatio || 1);
    el.width = w * dpr; el.height = h * dpr; el.style.height = `${h}px`;
    const ctx = el.getContext('2d')!; ctx.scale(dpr, dpr); ctx.fillStyle = '#fbfcfd'; ctx.fillRect(0, 0, w, h);
    type P = { x: number; y: number; z: number };
    const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
    const heightFactor = Math.max(p.width, p.height) * .48 / Math.max(.01, max);
    const rotate = (q: P) => { const x = -(q.x - p.width / 2), y = q.y - p.height / 2, xx = cy * x - sy * y, yy = sy * x + cy * y;
      return { x: xx, y: cp * yy - sp * q.z * heightFactor, depth: sp * yy + cp * q.z * heightFactor }; };
    const corners = [0, p.width].flatMap(x => [0, p.height].flatMap(y => [0, max].map(z => rotate({ x, y, z }))));
    const lx = Math.min(...corners.map(q => q.x)), rx = Math.max(...corners.map(q => q.x)), ty = Math.min(...corners.map(q => q.y)), by = Math.max(...corners.map(q => q.y));
    const scale = Math.min((w - 140) / (rx - lx), (h - 120) / (by - ty)) * zoom;
    const project = (q: P) => { const a = rotate(q); return { x: w / 2 + (a.x - (lx + rx) / 2) * scale, y: h / 2 - 15 + (a.y - (ty + by) / 2) * scale, depth: a.depth }; };
    const line = (a: P, b: P, color: string, width = 1.5, dashed = false) => { const aa = project(a), bb = project(b); ctx.beginPath(); ctx.moveTo(aa.x, aa.y); ctx.lineTo(bb.x, bb.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dashed ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]); };
    const polygon = (points: P[], fill: string) => { ctx.beginPath(); points.map(project).forEach((a, i) => i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    const base = [{ x: 0, y: 0, z: 0 }, { x: p.width, y: 0, z: 0 }, { x: p.width, y: p.height, z: 0 }, { x: 0, y: p.height, z: 0 }];
    polygon(base, '#e3ebef');
    const quads = [];
    for (let j = 0; j < r.ny - 1; j++) for (let i = 0; i < r.nx - 1; i++) {
      const ids = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const points = ids.map(([a, b]) => ({ x: (a + .5) * r.dx, y: (b + .5) * r.dy, z: z[b * r.nx + a] }));
      quads.push({ points, color: colorAt(points.reduce((sum, q) => sum + q.z, 0) / 4, max, log), depth: points.reduce((sum, q) => sum + project(q).depth, 0) / 4 });
    }
    quads.sort((a, b) => a.depth - b.depth).forEach(q => { polygon(q.points, q.color); ctx.strokeStyle = 'rgba(30,60,80,.12)'; ctx.lineWidth = .4; ctx.stroke(); });
    base.forEach((q, i) => line(q, base[(i + 1) % 4], '#40576a', 1));
    const text = (q: P, value: string, dx = 8, dy = 0) => { const a = project(q); ctx.font = '13px system-ui'; ctx.fillStyle = '#253e50'; ctx.fillText(value, a.x + dx, a.y + dy); };
    if (showCut) {
      const fixed = (axis === 'x' ? p.height : p.width) * fraction;
      const a = axis === 'x' ? { x: 0, y: fixed, z: 0 } : { x: fixed, y: 0, z: 0 };
      const b = axis === 'x' ? { x: p.width, y: fixed, z: 0 } : { x: fixed, y: p.height, z: 0 };
      const top = max * 1.05, plane = [a, b, { ...b, z: top }, { ...a, z: top }]; polygon(plane, 'rgba(103,59,158,.12)');
      plane.forEach((q, i) => line(q, plane[(i + 1) % 4], '#673b9e', 1.5, i === 0));
      const values = cutValues(r, z, axis, fraction), coords = values.map((v, i) => ({ ...a, [axis]: (i + .5) * (axis === 'x' ? r.dx : r.dy), z: v }));
      for (let i = 1; i < coords.length; i++) { line(coords[i - 1], coords[i], '#fff', 5); line(coords[i - 1], coords[i], '#673b9e', 2.5); }
      text({ ...a, z: top }, `${axis === 'x' ? 'y' : 'x'} = ${fmt(fixed - (axis === 'x' ? p.height : p.width)/2)} mm`, 8, -12);
    }
    const origin = { x: p.width/2, y: p.height/2, z: 0 };
    const arrow = (to: P, label: string) => { line(origin, to, '#173748', 2.2); const a = project(origin), b = project(to), angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 11 * Math.cos(angle - .4), b.y - 11 * Math.sin(angle - .4)); ctx.lineTo(b.x - 11 * Math.cos(angle + .4), b.y - 11 * Math.sin(angle + .4)); ctx.closePath(); ctx.fillStyle = '#173748'; ctx.fill(); text(to, label, 8, 18); };
    text(origin, '0', 6, 16); arrow({ x: p.width, y: p.height/2, z: 0 }, `x / mm (+${fmt(p.width/2)})`); arrow({ x: p.width/2, y: p.height, z: 0 }, `y / mm (+${fmt(p.height/2)})`);
    line({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: max }, '#536983', 1, true);
    for (const f of [.25, .5, .75, 1]) { const value = max * f; line({ x: 0, y: 0, z: value }, { x: 8, y: 0, z: value }, '#536983', 1); text({ x: 0, y: 0, z: value }, `${fmt(value)} µm`, 8, -4); }
    ctx.font = '13px system-ui'; ctx.fillStyle = '#526b79'; ctx.fillText(`${dry ? 'Trocken' : 'Nass'}schichtdicke / µm · Höhe linear und überzeichnet`, 14, h - 16);
  }, [p, r, z, max, log, axis, fraction, showCut, dry, size, yaw, pitch, zoom]);
  return <div ref={host}><canvas className="bls-profile" ref={canvas} role="img" aria-label="Drehbares Schichtdickenprofil mit x- und y-Achse, linearer µm-Höhenachse und Schnittebene"
    onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { const d = drag.current; if (d) { setYaw(Math.max(-180, Math.min(180, d.yaw - (e.clientX - d.x) * .4))); setPitch(Math.max(20, Math.min(85, d.pitch - (e.clientY - d.y) * .3))); } }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    <div className="toolbar"><label>Drehung<input aria-label="Drehung des Schichtprofils" type="range" min="-180" max="180" value={yaw} onChange={e => setYaw(Number(e.target.value))} /></label><label>Neigung<input aria-label="Neigung des Schichtprofils" type="range" min="20" max="85" value={pitch} onChange={e => setPitch(Number(e.target.value))} /></label><button onClick={() => setZoom(v => Math.min(2, v * 1.2))}>+</button><button onClick={() => setZoom(v => Math.max(.5, v / 1.2))}>−</button><button onClick={() => { setYaw(-35); setPitch(55); setZoom(1); }}>Ansicht zurücksetzen</button></div></div>;
}
