import { useEffect, useMemo, useRef, useState } from 'react';
import { fwhm, presets, projectionU, projectionsV, rateFactor, shapeExtent, shapeKernel, type Shape } from './brush';
import { fitSpot, fitTracks, trackProfile, type FitResult, type Point, type SpotData, type TrackData } from './fit';
import { brushMeta, readMeasurementFile } from './measurement';
import { colorAt, kernel, shapeOf, type BrushSource, type Params } from './model';
import ProfileView from './ProfileView';
import type { FitRequest } from './fitWorker';

const fmt = (n: number, d = 1) => Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: d }) : '–';
export type Role = 'A' | 'B' | 'spot';
export type Slot = { file: string; points: Point[]; rejected: number; travel: 'x' | 'y'; speed: number; time: number; q: number; solids: number; dry: boolean; plate: { w: number; h: number } };
export type Experiment = { kind: 'tracks' | 'spot'; slots: Partial<Record<Role, Slot>>; result?: FitResult; busy: boolean; error: string; adjusted: boolean };
export const emptyExperiment: Experiment = { kind: 'tracks', slots: {}, busy: false, error: '', adjusted: false };
export const sources: [BrushSource, string][] = [['model', 'Modellschätzung'], ['designer', 'Brush-Designer'], ['experiment', 'Brush aus Experiment']];
const sliders: { key: keyof Params; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'ba', label: 'a · halbe Länge', min: 10, max: 200, step: 1, unit: 'mm' },
  { key: 'bb', label: 'b · halbe Breite', min: 5, max: 120, step: 1, unit: 'mm' },
  { key: 'bm', label: 'm · Flachheit lang', min: 1.5, max: 12, step: .1 },
  { key: 'bk', label: 'k · Kante lang', min: .2, max: 4, step: .05 },
  { key: 'bn', label: 'n · Flachheit kurz', min: 1.5, max: 8, step: .1 },
  { key: 'bl', label: 'l · Kante kurz', min: .2, max: 4, step: .05 },
  { key: 'bg', label: 'γ · Hornluft-Knochen', min: 0, max: 3, step: .05 },
  { key: 'awg', label: 'Auftragswirkungsgrad', min: 5, max: 100, step: 1, unit: '%' },
];

/** Plan view of the 200 × 100 sheet on the measuring table: travel direction, fan and horn position. */
export function Pictogram({ role, travel, shape }: { role: Role; travel: 'x' | 'y'; shape: Shape }) {
  const W = 220, H = 110, x0 = 50, y0 = 30, cx = x0 + W / 2, cy = y0 + H / 2;
  const alongY = travel === 'y', fanAlongTravel = role === 'B';
  const fanVertical = role === 'spot' ? false : alongY === fanAlongTravel;
  const rx = fanVertical ? 18 : 62, ry = fanVertical ? 62 : 18;
  const lines = role === 'spot' ? [] : [.3, .5, .7];
  const ext = shapeExtent(shape), overrun = role === 'A' ? ext.rv : role === 'B' ? ext.ru : 0;
  const text = role === 'A' ? 'Blech A · Strahl quer zur Fahrt · Hörner in Fahrtrichtung' : role === 'B' ? 'Blech B · Luftkappe 90° gedreht · Strahl längs zur Fahrt' : 'Standbild · Pistole steht still über der Blechmitte';
  return <figure className="bls-picto">
    <svg viewBox="0 0 345 205" role="img" aria-label={text}>
      <defs><marker id={`arr-${role}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#17628e" /></marker></defs>
      <rect x={x0} y={y0} width={W} height={H} fill="#e3ebef" stroke="#40576a" strokeWidth="1.5" />
      {role === 'spot' ? Array.from({ length: 40 }, (_, i) => <circle key={i} cx={x0 + 11 + (i % 10) * 22} cy={y0 + 14 + Math.floor(i / 10) * 27} r="1.6" fill="#8098a8" />)
        : lines.map(f => alongY ? <line key={f} x1={x0} x2={x0 + W} y1={y0 + H * f} y2={y0 + H * f} stroke="#673b9e" strokeDasharray="4 3" /> : <line key={f} y1={y0} y2={y0 + H} x1={x0 + W * f} x2={x0 + W * f} stroke="#673b9e" strokeDasharray="4 3" />)}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(42,180,130,.28)" stroke="#087344" strokeWidth="2" />
      {role !== 'spot' && (alongY ? <line x1={cx} x2={cx} y1={y0 + H + 22} y2={y0 - 22} stroke="#17628e" strokeWidth="2.5" markerEnd={`url(#arr-${role})`} /> : <line y1={cy} y2={cy} x1={x0 - 22} x2={x0 + W + 22} stroke="#17628e" strokeWidth="2.5" markerEnd={`url(#arr-${role})`} />)}
      <g transform={`translate(318 ${cy + 8})`}><circle r="11" fill="#fff" stroke="#40576a" strokeWidth="1.5" /><circle r="3" fill="#40576a" />
        {(fanVertical ? [[-15, 0], [15, 0]] : [[0, -15], [0, 15]]).map(([dx, dy]) => <rect key={dx + ' ' + dy} x={dx - (fanVertical ? 3 : 5)} y={dy - (fanVertical ? 5 : 3)} width={fanVertical ? 6 : 10} height={fanVertical ? 10 : 6} rx="1.5" fill="#40576a" />)}
        <text y="34" textAnchor="middle" fontSize="10">Luftkappe</text></g>
      <path d={`M${x0} ${y0 + H + 14} h26 M${x0} ${y0 + H + 14} v-26`} stroke="#173748" strokeWidth="1.5" fill="none" />
      <text x={x0 + 29} y={y0 + H + 18} fontSize="10">Blech X</text><text x={x0 - 4} y={y0 + H - 16} fontSize="10" textAnchor="end">Blech Y</text>
      <text x={cx} y={y0 + H + 36} fontSize="10" textAnchor="middle">200 mm</text><text x={x0 + W + 6} y={y0 + 12} fontSize="10">100 mm</text>
      {role !== 'spot' && <text x={alongY ? cx + 8 : x0 + W + 4} y={alongY ? y0 - 10 : cy - 8} fontSize="10" fill="#17628e">Fahrt</text>}
    </svg>
    <figcaption><strong>{text}</strong>{role === 'A' && <> Gemessen wird das Profil der langen Strahlachse (violette Messlinien quer zur Fahrt, Werte werden gemittelt).</>}
      {role === 'B' && <> Blech und Bahn wie bei A, nur die Luftkappe ist um 90° gedreht. Gemessen wird das Profil der kurzen Achse. Kappe genau ausrichten: 5° Fehler verbreitern das Profil um etwa a · sin 5°.</>}
      {role === 'spot' && <> Spritzdauer kurz halten (kein Ablaufen). Raster über das ganze Spritzbild; Lage und Drehung werden mitgefittet.</>}
      {overrun > 0 && <> Überlauf je Seite mit konstanter Geschwindigkeit: mindestens ≈ {fmt(overrun, 0)} mm plus Beschleunigungsweg.</>}</figcaption>
  </figure>;
}

function Chart({ series, dots = [], xLabel, yLabel, label }: { series: { x: number[]; y: number[]; color: string; name: string; dash?: string }[]; dots?: { x: number; y: number }[]; xLabel: string; yLabel: string; label: string }) {
  const xs = [...series.flatMap(s => s.x), ...dots.map(d => d.x)], ys = [...series.flatMap(s => s.y), ...dots.map(d => d.y), 0];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(1e-9, ...ys) * 1.08;
  const X = (v: number) => 52 + (v - x0) / Math.max(1e-9, x1 - x0) * 420, Y = (v: number) => 170 - v / y1 * 150;
  return <figure className="bls-chart"><svg viewBox="0 0 490 210" role="img" aria-label={label}>
    <path d="M52 15 V170 H475" fill="none" stroke="#647e90" />
    {[0, .5, 1].map(f => <text key={f} x="46" y={Y(f * y1) + 4} fontSize="11" textAnchor="end">{fmt(f * y1, 0)}</text>)}
    {[0, .5, 1].map(f => <text key={f} x={X(x0 + f * (x1 - x0))} y="186" fontSize="11" textAnchor="middle">{fmt(x0 + f * (x1 - x0), 0)}</text>)}
    {dots.map((d, i) => <circle key={i} cx={X(d.x)} cy={Y(d.y)} r="2.6" fill="#e39a20" stroke="#7a4d00" strokeWidth=".6" />)}
    {series.map(s => <polyline key={s.name} points={s.x.map((v, i) => `${X(v)},${Y(s.y[i])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash} />)}
    <text x="262" y="204" fontSize="12" textAnchor="middle">{xLabel}</text><text x="52" y="10" fontSize="12">{yLabel}</text>
  </svg><figcaption className="bls-chart-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}{dots.length > 0 && <span><i className="dot" />Messung (gemittelt)</span>}</figcaption></figure>;
}

function Heat({ nx, ny, values, max, w, h, label }: { nx: number; ny: number; values: Float32Array; max: number; w: number; h: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return; const W = 640, H = Math.round(W * h / w); el.width = W; el.height = H;
    const ctx = el.getContext('2d')!; ctx.fillStyle = '#f4f7fa'; ctx.fillRect(0, 0, W, H);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = values[j * nx + i]; if (v > .03 * max) { ctx.fillStyle = colorAt(v, max, false); ctx.fillRect(i * W / nx, H - (j + 1) * H / ny, W / nx + .6, H / ny + .6); } }
    ctx.strokeStyle = '#173748'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
  }, [nx, ny, values, max, w, h]);
  return <canvas ref={ref} className="bls-heat" role="img" aria-label={label} />;
}

const trackOf = (s: Slot, role: 'A' | 'B'): TrackData => { const t = trackProfile(s.points, s.travel); return { role, speed: s.speed, q: s.q, solids: s.solids, dry: s.dry, pos: t.pos, h: t.h }; };
const spotOf = (s: Slot): SpotData => ({ time: s.time, q: s.q, solids: s.solids, dry: s.dry, points: s.points });
const condFactor = (s: { q: number; solids: number; dry: boolean }, awg: number) => rateFactor(s.q, awg / 100, s.dry ? s.solids / 100 : 1);

export default function BrushPanel({ draft, update, exp, setExp }: { draft: Params; update: (patch: Partial<Params>) => void; exp: Experiment; setExp: (f: (e: Experiment) => Experiment) => void }) {
  const [dim, setDim] = useState<'2d' | '3d'>('2d'), [spotTime, setSpotTime] = useState(1), [whole, setWhole] = useState(false);
  const shape = shapeOf(draft), custom = draft.source !== 'model';
  const roles: Role[] = exp.kind === 'tracks' ? ['A', 'B'] : ['spot'];
  const load = async (role: Role, file: File) => {
    try {
      const m = await readMeasurementFile(file), b = brushMeta(m.meta);
      const xs = m.points.map(p => p.x), ys = m.points.map(p => p.y), fallback = (v: number, d: number) => Number.isFinite(v) && v > 0 ? v : d;
      const slot: Slot = { file: file.name, points: m.points, rejected: m.rejected, travel: b.travel || 'y', speed: fallback(b.speed, draft.speed), time: fallback(b.time, 1), q: fallback(b.q, draft.q), solids: fallback(b.solids, draft.solids), dry: b.dry ?? true,
        plate: { w: fallback(b.length, Math.max(...xs) + Math.min(...xs)), h: fallback(b.width, Math.max(...ys) + Math.min(...ys)) } };
      const warn = b.role && b.role !== role ? `Hinweis: Laut Rahmendaten gehört „${file.name}“ zu ${b.role === 'spot' ? 'Standbild' : 'Blech ' + b.role}.` : '';
      setExp(e => ({ ...e, slots: { ...e.slots, [role]: slot }, error: warn, result: undefined }));
    } catch (error) { setExp(e => ({ ...e, error: `${file.name}: ${error instanceof Error ? error.message : String(error)}` })); }
  };
  const setSlot = (role: Role, patch: Partial<Slot>) => setExp(e => ({ ...e, result: undefined, slots: { ...e.slots, [role]: { ...e.slots[role]!, ...patch } } }));
  const ready = roles.every(r => exp.slots[r]);
  const runFit = () => {
    if (!ready || exp.busy) return;
    const request: FitRequest = exp.kind === 'tracks' ? { kind: 'tracks', A: trackOf(exp.slots.A!, 'A'), B: trackOf(exp.slots.B!, 'B') } : { kind: 'spot', S: spotOf(exp.slots.spot!) };
    setExp(e => ({ ...e, busy: true, error: '' }));
    const done = (msg: { ok: boolean; result?: FitResult; error?: string }) => {
      if (msg.ok && msg.result) { const s = msg.result.shape; update({ source: 'experiment', ba: +s.a.toFixed(1), bb: +s.b.toFixed(1), bm: +s.m.toFixed(2), bk: +s.k.toFixed(2), bn: +s.n.toFixed(2), bl: +s.l.toFixed(2), bg: +s.g.toFixed(2), awg: +msg.result.awg.toFixed(1) }); }
      setExp(e => ({ ...e, busy: false, adjusted: false, result: msg.result, error: msg.ok ? '' : `Fit fehlgeschlagen: ${msg.error}` }));
    };
    try {
      const worker = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = e => { done(e.data); worker.terminate(); };
      worker.onerror = e => { done({ ok: false, error: e.message || 'Rechenprozess nicht verfügbar' }); worker.terminate(); };
      worker.postMessage(request);
    } catch { setTimeout(() => { try { done({ ok: true, result: request.kind === 'tracks' ? fitTracks(request.A, request.B) : fitSpot(request.S) }); } catch (error) { done({ ok: false, error: String(error) }); } }, 30); }
  };

  // Preview: stationary dry layer after spotTime on the program sheet (Gauss model or Beta brush), sheet-centred, cap orientation applied.
  const preview = useMemo(() => {
    const e = shapeExtent(shapeOf(draft)), o = draft.orientation === 0;
    const W = whole && custom ? Math.max(draft.width, 2.2 * (o ? e.ru : e.rv)) : draft.width, H = whole && custom ? Math.max(draft.height, 2.2 * (o ? e.rv : e.ru)) : draft.height;
    const nx = 100, ny = Math.max(10, Math.round(nx * H / W)), dx = W / nx, dy = H / ny;
    const F = rateFactor(draft.q, custom ? draft.awg / 100 : .7, draft.solids / 100) * spotTime, z = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = F * kernel(-W / 2 + (i + .5) * dx, -H / 2 + (j + .5) * dy, draft);
    return { nx, ny, dx, dy, z, max: Math.max(1e-6, ...z), W, H };
  }, [draft, spotTime, custom, whole]);
  const ext = shapeExtent(shape), sb50 = fwhm(u => projectionU(u, shape), ext.ru * 1.05), sb50b = fwhm(v => projectionsV([v], shape)[0], ext.rv * 1.05);

  // Track profiles: at measurement conditions (with points) after a fit, otherwise at the program settings.
  const tracks = useMemo(() => {
    const out: { role: 'A' | 'B'; x: number[]; y: number[]; dots: { x: number; y: number }[]; rmse: number | null }[] = [];
    for (const role of ['A', 'B'] as const) {
      const slot = exp.kind === 'tracks' && draft.source === 'experiment' ? exp.slots[role] : undefined, t = slot ? trackOf(slot, role) : undefined;
      const center = t ? (role === 'A' ? exp.result?.offsets.a : exp.result?.offsets.b) ?? (t.pos.reduce((s, x, i) => s + x * t.h[i], 0) / t.h.reduce((s, v) => s + v, 0)) : 0;
      const half = (role === 'A' ? ext.ru : ext.rv) * 1.15, lo = t ? Math.min(...t.pos) : -half, hi = t ? Math.max(...t.pos) : half;
      const x = Array.from({ length: 241 }, (_, i) => lo + i * (hi - lo) / 240), F = condFactor(slot ?? { q: draft.q, solids: draft.solids, dry: true }, draft.awg) / (slot?.speed ?? draft.speed);
      const prof = (xs: number[]) => role === 'A' ? xs.map(v => F * projectionU(v - center, shape)) : projectionsV(xs.map(v => v - center), shape).map(v => F * v);
      const dots = t ? t.pos.map((p, i) => ({ x: p, y: t.h[i] })) : [], fitted = t ? prof(t.pos) : [];
      out.push({ role, x, y: prof(x), dots, rmse: t ? Math.sqrt(fitted.reduce((s, v, i) => s + (v - t.h[i]) ** 2, 0) / fitted.length) : null });
    }
    return out;
  }, [draft, exp, shape, ext.ru, ext.rv]);

  const spotCompare = useMemo(() => {
    const slot = exp.kind === 'spot' && draft.source === 'experiment' ? exp.slots.spot : undefined; if (!slot) return null;
    const o = exp.result?.offsets, x0 = o?.x0 ?? slot.plate.w / 2, y0 = o?.y0 ?? slot.plate.h / 2, th = o?.theta ?? 0, F = condFactor(slot, draft.awg) * slot.time;
    const model = (x: number, y: number) => { const dx = x - x0, dy = y - y0; return F * shapeKernel(dx * Math.cos(th) + dy * Math.sin(th), -dx * Math.sin(th) + dy * Math.cos(th), shape); };
    const nx = 100, ny = Math.max(10, Math.round(nx * slot.plate.h / slot.plate.w)), z = new Float32Array(nx * ny), m = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = model((i + .5) * slot.plate.w / nx, (j + .5) * slot.plate.h / ny);
    for (const p of slot.points) { const i = Math.min(nx - 1, Math.floor(p.x / slot.plate.w * nx)), j = Math.min(ny - 1, Math.floor(p.y / slot.plate.h * ny)); m[j * nx + i] = p.h; }
    // Fill measured cells on the raster (nearest point) so the measured map reads as an image.
    const pts = slot.points; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (i + .5) * slot.plate.w / nx, y = (j + .5) * slot.plate.h / ny; let best = Infinity, v = 0; for (const p of pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) { best = d; v = p.h; } } m[j * nx + i] = v; }
    const rmse = Math.sqrt(pts.reduce((s, p) => s + (model(p.x, p.y) - p.h) ** 2, 0) / pts.length);
    return { nx, ny, z, m, max: Math.max(1e-6, ...z, ...m), plate: slot.plate, rmse };
  }, [draft, exp, shape]);

  const setShape = (patch: Partial<Params>) => { update(patch); if (draft.source === 'experiment' && exp.result) setExp(e => ({ ...e, adjusted: true })); };
  return <div className="bls-brush">
    <div className="toolbar" role="group" aria-label="Brush-Quelle">{sources.map(([v, l]) => <button key={v} aria-pressed={draft.source === v} className={draft.source === v ? 'active' : ''} onClick={() => update({ source: v })}>{l}</button>)}</div>
    {draft.source === 'model' && <p className="small">Das Lehrmodell schätzt einen elliptischen Gaußkern aus Abstand, Zerstäuber- und Horndruck (Block 02). Für eine gemessene oder frei gestaltete Form „Brush-Designer“ oder „Brush aus Experiment“ wählen; die Regler starten dann mit den zuletzt eingestellten Formwerten.</p>}

    {draft.source === 'experiment' && <section className="bls-section"><h3>Messdaten einlesen</h3>
      <div className="toolbar" role="group" aria-label="Versuchsart"><button aria-pressed={exp.kind === 'tracks'} className={exp.kind === 'tracks' ? 'active' : ''} onClick={() => setExp(e => ({ ...e, kind: 'tracks', result: undefined }))}>Zwei Einzelbahnen (empfohlen)</button><button aria-pressed={exp.kind === 'spot'} className={exp.kind === 'spot' ? 'active' : ''} onClick={() => setExp(e => ({ ...e, kind: 'spot', result: undefined }))}>Stationäres Spritzbild</button></div>
      <p className="small">Format: Export des Schichtdicken-Messtischs (.xlsx, Blatt „Messdaten“ mit Blech X / Blech Y / Schichtdicke / Status) oder CSV mit denselben Spalten. Nur gültige Punkte werden verwendet, Wiederholungsmessungen (Runs) gemittelt. Optionale Einträge „Brush: …“ in den Rahmendaten füllen die Versuchsangaben automatisch.</p>
      <div className="bls-slots">{roles.map(role => { const s = exp.slots[role]; return <div className="bls-slot" key={role}>
        <Pictogram role={role} travel={s?.travel ?? 'y'} shape={shape} />
        <label className="bls-file">{role === 'spot' ? 'Datei Standbild' : `Datei Blech ${role}`}<input type="file" accept=".xlsx,.csv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) load(role, f); e.target.value = ''; }} /></label>
        {s ? <>
          <p className="small">{s.file} · {s.points.length} Messpunkte{s.rejected ? ` · ${s.rejected} ungültig verworfen` : ''}{role !== 'spot' ? ` · ${trackProfile(s.points, s.travel).lines} Messlinien gemittelt` : ''}</p>
          <div className="bls-cond">
            {role !== 'spot' && <label>Fahrt entlang<select value={s.travel} onChange={e => setSlot(role, { travel: e.target.value as 'x' | 'y' })}><option value="y">Blech Y (quer zur 200er-Seite)</option><option value="x">Blech X</option></select></label>}
            {role === 'spot' ? <label>Spritzdauer / s<input type="number" step="0.1" min="0.1" value={s.time} onChange={e => setSlot(role, { time: Math.max(.1, Number(e.target.value) || .1) })} /></label>
              : <label>Geschwindigkeit / mm/s<input type="number" min="1" value={s.speed} onChange={e => setSlot(role, { speed: Math.max(1, Number(e.target.value) || 1) })} /></label>}
            <label>V̇ Lack / ml/min<input type="number" min="1" value={s.q} onChange={e => setSlot(role, { q: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label>Volumenfestkörper / %<input type="number" min="1" max="100" value={s.solids} onChange={e => setSlot(role, { solids: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            <label>Gemessen<select value={s.dry ? 'dry' : 'wet'} onChange={e => setSlot(role, { dry: e.target.value === 'dry' })}><option value="dry">Trockenschicht</option><option value="wet">Nassschicht</option></select></label>
          </div></> : <p className="small">Noch keine Datei.</p>}
      </div>; })}</div>
      <div className="toolbar"><button className="blue" disabled={!ready || exp.busy} onClick={runFit}>{exp.busy ? 'Fit läuft …' : 'Brush fitten'}</button>{!ready && <span className="small">{exp.kind === 'tracks' ? 'Beide Dateien (A und B) einlesen.' : 'Standbild-Datei einlesen.'}</span>}</div>
      {exp.error && <p className="error" role="alert">{exp.error}</p>}
      {exp.result && <div className="bls-fit">
        <table><thead><tr><th>Parameter</th><th>Wert</th><th>± Standardabw.</th></tr></thead><tbody>{exp.result.estimates.map(e => <tr key={e.key} className={e.weak ? 'weak' : ''}><td>{e.label}</td><td>{fmt(e.value, 2)} {e.unit}</td><td>{e.sd === null ? 'nicht bestimmbar' : fmt(e.sd, 2)}{e.weak && e.sd !== null ? ' · schwach' : ''}</td></tr>)}</tbody></table>
        <p className="small">RMSE {fmt(exp.result.rmse, 2)} µm · R² {fmt(exp.result.r2, 3)} · {exp.result.n} Werte{exp.result.offsets.theta !== undefined ? ` · Drehung lange Achse gegen Blech X ${fmt(exp.result.offsets.theta * 180 / Math.PI, 1)}°` : ''}. Die Werte wurden in den Brush übernommen.{exp.adjusted ? ' Danach manuell nachjustiert.' : ''}</p>
        {exp.result.notes.map(n => <p key={n} className="small bls-hint">{n}</p>)}
      </div>}
    </section>}

    {custom && <section className="bls-section"><h3>{draft.source === 'designer' ? 'Brush-Designer' : 'Brush nachjustieren'}</h3>
      <div className="toolbar">{presets.map(p => <button key={p.name} onClick={() => setShape({ ba: p.shape.a, bb: p.shape.b, bm: p.shape.m, bk: p.shape.k, bn: p.shape.n, bl: p.shape.l, bg: p.shape.g })}>{p.name}</button>)}</div>
      <div className="bls-sliders">{sliders.map(s => <label key={s.key}><span>{s.label}</span><input type="range" min={s.min} max={s.max} step={s.step} value={Number(draft[s.key])} onChange={e => setShape({ [s.key]: Number(e.target.value) })} /><output>{fmt(Number(draft[s.key]), 2)}{s.unit ? ' ' + s.unit : ''}</output></label>)}</div>
      <p className="small">Form h(u,v) = (1 + γt²)·(1 − |t|<sup>m</sup>)<sup>k</sup>·(1 − |w|<sup>n</sup>)<sup>l</sup>, t = u/a, w = v / (b·(1 + 0,35·γt²)), normiert auf das Lackvolumen. Höhe aus V̇ · Volumenfestkörper · AWG.</p>
    </section>}

    <section className="bls-section"><h3>Vorschau</h3>
      <div className="toolbar"><button className={dim === '2d' ? 'active' : ''} onClick={() => setDim('2d')}>Standbild 2D</button><button className={dim === '3d' ? 'active' : ''} onClick={() => setDim('3d')}>Standbild 3D</button>
        <label className="toggle">Spritzdauer Standbild<input type="range" min="0.1" max="5" step="0.1" value={spotTime} onChange={e => setSpotTime(Number(e.target.value))} /><output>{fmt(spotTime)} s</output></label>{custom && <label className="toggle"><input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)} />Ganzes Spritzbild zeigen</label>}</div>
      {dim === '2d' ? <Heat nx={preview.nx} ny={preview.ny} values={preview.z} max={preview.max} w={preview.W} h={preview.H} label="Stationäres Spritzbild als Trockenschicht auf dem Programmblech" />
        : <ProfileView p={{ ...draft, width: preview.W, height: preview.H }} r={preview} z={preview.z} max={preview.max} log={false} axis="x" fraction={.5} showCut={false} dry />}
      <p className="small">Trockenschicht nach {fmt(spotTime)} s auf {preview.W > draft.width || preview.H > draft.height ? 'vergrößerter Vorschaufläche' : 'dem Programmblech'} {fmt(preview.W, 0)} × {fmt(preview.H, 0)} mm, Luftkappe {draft.orientation}° · Maximum {fmt(preview.max)} µm · V̇ {draft.q} ml/min · Festkörper {draft.solids} %{custom ? ` · AWG ${draft.awg} %` : ' · η 70 % (Lehrmodell)'}.</p>
      {custom && <>
        <div className="bls-stats"><div><strong>{fmt(sb50, 0)} mm</strong><span>SB50 · Bahn A (Strahl quer)</span></div><div><strong>{fmt(sb50b, 0)} mm</strong><span>SB50 · Bahn B (Strahl längs)</span></div><div><strong>{fmt(2 * ext.ru, 0)} × {fmt(2 * ext.rv, 0)} mm</strong><span>Spritzbild außen</span></div></div>
        <div className="bls-charts">{tracks.map(t => <div key={t.role}><h4>Einzelbahn {t.role} · {t.role === 'A' ? 'Profil lange Achse' : 'Profil kurze Achse'}</h4>
          <Chart label={`Schichtprofil Einzelbahn ${t.role}`} xLabel={t.dots.length ? 'Messkoordinate quer zur Fahrt / mm' : 'Abstand zur Bahnmitte / mm'} yLabel="Trockenschicht / µm" series={[{ x: t.x, y: t.y, color: '#673b9e', name: 'Brush-Modell' }]} dots={t.dots} />
          <p className="small">{t.rmse !== null ? `Abweichung zur Messung (RMSE): ${fmt(t.rmse, 2)} µm · Bedingungen aus der Messdatei.` : `Bei ${draft.speed} mm/s und ${draft.q} ml/min aus Block 01/02.`}</p></div>)}</div>
        {spotCompare && <div className="bls-charts"><div><h4>Messung (nächster Messpunkt)</h4><Heat nx={spotCompare.nx} ny={spotCompare.ny} values={spotCompare.m} max={spotCompare.max} w={spotCompare.plate.w} h={spotCompare.plate.h} label="Gemessenes Standbild" /></div>
          <div><h4>Brush-Modell</h4><Heat nx={spotCompare.nx} ny={spotCompare.ny} values={spotCompare.z} max={spotCompare.max} w={spotCompare.plate.w} h={spotCompare.plate.h} label="Modell des Standbilds" /><p className="small">RMSE {fmt(spotCompare.rmse, 2)} µm</p></div></div>}
      </>}
    </section>
  </div>;
}
