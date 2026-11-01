import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Scene from './Scene';
import ProfileView, { cutValues, type Axis } from './ProfileView';
import MapView from './MapView';
import Description from './Description';
import BrushPanel, { emptyExperiment, sources, type Experiment } from './BrushPanel';
import { fwhm, projectionU, shapeExtent } from './brush';
import { at, colorAt, colorFraction, defaults, lamps, massBalance, materials, nozzleTypes, parseNumber, pistonTravel, shapeOf, simulate, type Params } from './model';
import './style.css';
const fmt = (n: number) => Number.isFinite(n) ? (Math.abs(n) > 0 && Math.abs(n) < .1 ? n.toExponential(1) : n.toLocaleString('de-DE', { maximumFractionDigits: 1 })) : '–';
const modes = [['spot', 'Statisches Spritzbild'], ['single', 'Einzelbahn ohne Versatz'], ['meander', 'Bahnen mit Versatz'], ['cross', 'Kreuzgang']];
function NumberField({ label, value, min, max, step = 1, onCommit, onState, disabled = false }: {
  label: ReactNode; value: number; min: number; max: number; step?: number; disabled?: boolean;
  onCommit: (v: number) => void; onState: (pending: boolean, invalid: boolean) => void;
}) {
  const [text, setText] = useState(String(value)), [error, setError] = useState(false);
  useEffect(() => () => onState(false, false), []);
  useEffect(() => { setText(String(value)); setError(false); onState(false, false); }, [value]);
  const commit = () => {
    const v = parseNumber(text, min, max);
    if (v === null || (step === 1 && !Number.isInteger(v))) { setError(true); onState(true, true); return; }
    setError(false); setText(String(v)); onCommit(v); onState(false, false);
  };
  return <div><label className="control"><span>{label}</span><input type="text" inputMode="decimal" value={text} disabled={disabled} aria-invalid={error} onChange={e => {
    setText(e.target.value); setError(false); onState(e.target.value !== String(value), false);
  }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    {error && <p className="error" role="alert">Bitte {step === 1 ? 'eine ganze Zahl' : 'einen Wert'} von {fmt(min)} bis {fmt(max)} eingeben.</p>}</div>;
}
export default function App() {
  const [draft, setDraft] = useState<Params>({ ...defaults }), [p, setP] = useState<Params>({ ...defaults });
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1);
  const [view, setView] = useState('cabin'), [cabin, setCabin] = useState(true), [transparent, setTransparent] = useState(true), [filter, setFilter] = useState(true);
  const [dry, setDry] = useState(true), [log, setLog] = useState(false), [axis, setAxis] = useState<Axis>('x'), [fraction, setFraction] = useState(.5), [showCut, setShowCut] = useState(true);
  const [fields, setFields] = useState<Record<string, { pending: boolean; invalid: boolean }>>({});
  const [resetEpoch, setResetEpoch] = useState(0), [exp, setExp] = useState<Experiment>(emptyExperiment);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const r = useMemo(() => simulate(p), [p]);
  const pose = at(r.segments, time), frame = r.frames.slice().reverse().find(f => f.time <= time) || r.frames[0];
  const factor = dry ? p.solids / 100 : 1, z = useMemo(() => Float32Array.from(frame.z, v => v * factor), [frame, factor]);
  const max = Math.max(.01, ...r.frames[r.frames.length - 1].z) * Math.max(1e-6, factor);
  const mean = z.reduce((a, b) => a + b, 0) / z.length, balance = massBalance(p, r, frame);
  const dirty = JSON.stringify(p) !== JSON.stringify(draft) || Object.values(fields).some(f => f.pending);
  const invalid = Object.values(fields).some(f => f.invalid);
  const extentError = draft.mode !== 'spot' && (Math.min(draft.width, draft.mode === 'cross' ? draft.height : draft.width) + 2 * draft.over <= 0 || draft.mode !== 'single' && Math.min(draft.height, draft.mode === 'cross' ? draft.width : draft.height) + 2 * draft.deltaY < 0);
  const error = extentError ? 'ΔX/ΔY verkürzen den Verfahrbereich zu stark. Bitte Randversatz erhöhen.' : draft.mode === 'cross' && draft.passes < 2 ? 'Kreuzgang benötigt mindestens zwei Spritzgänge.' : '';
  const custom = draft.source !== 'model', brushSb50 = useMemo(() => { const sh = shapeOf(draft); return fwhm(u => projectionU(u, sh), shapeExtent(sh).ru * 1.05); }, [draft]);
  const lights = lamps(pose, time, r.duration), values = cutValues(r, z, axis, fraction);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(); const id = setInterval(() => { const now = performance.now(), dt = (now - last) / 1000; last = now;
      setTime(t => { const next = Math.min(r.duration, t + dt * rate); if (next >= r.duration) setPlaying(false); return next; });
    }, 80); return () => clearInterval(id);
  }, [playing, r.duration, rate]);
  const fieldState = (key: string, pending: boolean, invalid: boolean) => setFields(old => old[key]?.pending === pending && old[key]?.invalid === invalid ? old : { ...old, [key]: { pending, invalid } });
  const control = (key: keyof Params, label: ReactNode, min: number, max: number, step = 1, disabled = false) => <NumberField key={key + resetEpoch} label={label} value={Number(draft[key])} min={min} max={max} step={step} disabled={disabled}
    onState={(pending, invalid) => fieldState(key, pending, invalid)} onCommit={v => setDraft(d => ({ ...d, [key]: v, ...(['density', 'viscosity', 'solids', 'tension'].includes(key) && v !== d[key] ? { material: 'custom' } : {}) }))} />;
  const calculate = () => {
    if (error || invalid || busy) return;
    const relativeTime = time / r.duration; setPlaying(false); setBusy(true);
    setTimeout(() => { setP({ ...draft }); const next = simulate(draft); setTime(Math.min(next.duration, relativeTime * next.duration)); setBusy(false); setMessage('Neu berechnet. Die relative Zeitposition wurde beibehalten.'); }, 20);
  };
  return <div className="bls"><p>FOKUS LABOR · FÜLL LAB</p><h1>BLS Bahnplanung <small>(Demo)</small></h1>
    <Description />
    <div className={'bls-update ' + (dirty ? 'dirty' : '')} role="status"><span>{dirty ? 'Einstellungen geändert – die angezeigten Ergebnisse gehören noch zur bisherigen Berechnung.' : message || 'Ergebnisse entsprechen den berechneten Einstellungen.'}</span><button className="blue" disabled={invalid || !!error || busy} onClick={calculate}>{busy ? 'Berechnet …' : 'Neu berechnen'}</button></div>
    <div className="bls-layout"><aside>
      <fieldset><legend>01 · Programm & Werkstück</legend><label className="control">Programm<select value={draft.mode} onChange={e => setDraft(d => ({ ...d, mode: e.target.value, passes: e.target.value === 'cross' ? Math.max(2, d.passes) : d.passes }))}>{modes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {control('width', 'Blechlänge (Ausgangslage X) / mm', 20, 250)}{control('height', 'Blechbreite (Ausgangslage Y) / mm', 20, 250)}
        {draft.mode === 'spot' ? control('spot', 'Spritzdauer / s', .1, 30, .1) : <>{control('speed', 'X-Geschwindigkeit / mm/s', 20, 1000)}{draft.mode !== 'single' && control('spacing', 'Y-Versatz / mm', 1, 300)}{control('over', 'ΔX · Randversatz je Seite / mm', -200, 200)}{draft.mode !== 'single' && control('deltaY', 'ΔY · Randversatz je Seite / mm', -200, 200)}{control('passes', 'Spritzgänge', 1, 10)}{control('flash', 'Ablüftzeit / s', 0, 60)}</>}
        <label className="control">Luftkappe zur Fahrt (X)<select value={draft.orientation} onChange={e => setDraft(d => ({ ...d, orientation: Number(e.target.value) }))}><option value="0">0° · Flachstrahl längs X (längs zur Fahrt)</option><option value="90">90° · Flachstrahl quer X (quer zur Fahrt)</option></select></label>
        {error && <p className="error" role="alert">{error}</p>}</fieldset>
      <fieldset><legend>02 · Anlage & Rüstung</legend><label className="control">Düsentyp<select value={draft.nozzleType} onChange={e => setDraft(d => ({ ...d, nozzleType: e.target.value }))}>{nozzleTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {control('nozzle', 'Düsendurchmesser / mm', .1, 5, .1)}{control('distance', 'Werkstückabstand / mm', 150, 300)}{control('atom', 'Zerstäuberdruck / bar', .2, 4, .1, custom)}{control('horn', 'Horndruck / bar', 0, 4, .1, custom)}{control('q', <>V̇<sub>LK</sub> / ml/min</>, 0, 420)}
        <p className="small">{custom ? 'Form aus dem Brush (Block 04): Drücke, Düse und Abstand werden nur dokumentiert. V̇ wirkt weiter auf die Schichtdicke.' : '100-ml-Spritze · Ø ≈ 30 mm. Düsentyp und -durchmesser werden dokumentiert.'}</p></fieldset>
      <fieldset><legend>03 · Lackmaterial</legend><label className="control">Materialvorlage<select value={draft.material} onChange={e => { const m = materials.find(m => m.id === e.target.value); setDraft(d => m ? { ...d, material: m.id, density: m.density, viscosity: m.viscosity, solids: m.solids, tension: m.tension } : { ...d, material: 'custom' }); }}>{materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}<option value="custom">Benutzerdefiniert</option></select></label>
        {control('density', 'Dichte / g/cm³', .5, 3, .1)}{control('viscosity', 'Dyn. Viskosität / mPa·s', 1, 10000)}{control('tension', 'Oberflächenspannung / mN/m', 10, 80)}{control('solids', 'Volumenfestkörper / %', 0, 100)}<p className="small">Illustrative Werte für spritzfertigen Lack. Viskosität und Oberflächenspannung vorerst ohne Brush-Einfluss (Grundlage für spätere Prognose).</p></fieldset>
      <fieldset><legend>04 · Brush</legend><label className="control">Quelle<select value={draft.source} onChange={e => { setDraft(d => ({ ...d, source: e.target.value as Params['source'] })); if (e.target.value !== 'model') setView('brush'); }}>{sources.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <p className="small">{custom ? `a ${fmt(draft.ba)} · b ${fmt(draft.bb)} mm · SB50 ≈ ${fmt(brushSb50)} mm · AWG ${fmt(draft.awg)} %${draft.source === 'experiment' && !exp.result ? ' · noch kein Fit' : ''}` : 'Gaußkern aus Abstand und Drücken (Lehrmodell).'}</p>
        <button onClick={() => setView('brush')}>Brush-Ansicht öffnen</button></fieldset>
      <div className="toolbar"><button className="blue" disabled={invalid || !!error || busy} onClick={calculate}>Neu berechnen</button><button onClick={() => { setDraft({ ...defaults }); setFields({}); setResetEpoch(v => v + 1); }}>Startwerte laden</button></div>
    </aside><section className="workspace">
      <div className="toolbar">{[['map', 'Blech & Bahn · 2D'], ['growth', 'Schichtwachstum · 3D'], ['cabin', 'Kabine & Auftrag · 3D'], ['brush', 'Brush · Designer & Messung']].map(([v, l]) => <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{l}</button>)}</div>
      {view === 'brush' ? <BrushPanel draft={draft} update={patch => setDraft(d => ({ ...d, ...patch }))} exp={exp} setExp={setExp} /> : <>
      <div className="toolbar"><button className="green" onClick={() => { if (time >= r.duration) setTime(0); setPlaying(v => !v); }}>{playing ? 'Ⅱ Pause' : '▶ Ablauf starten'}</button><button onClick={() => { setPlaying(false); setTime(0); }}>Von vorn</button><label className="toggle">Tempo<select value={rate} onChange={e => setRate(Number(e.target.value))}>{[.5, 1, 2, 5].map(v => <option key={v} value={v}>{fmt(v)}×</option>)}</select></label></div>
      <p role="status"><strong>{time === 0 ? 'Bereit' : time >= r.duration ? 'Abgeschlossen' : pose.phase}</strong> · Lackförderung {pose.on && frame.used < 100 ? 'EIN' : 'AUS'} · {fmt(time)} / {fmt(r.duration)} s</p>
      <div className="toolbar"><label className="toggle"><input type="checkbox" checked={dry} onChange={e => setDry(e.target.checked)} />Trockenschicht</label><label className="toggle">Farbskala<select value={log ? 'log' : 'linear'} onChange={e => setLog(e.target.value === 'log')}><option value="linear">Linear</option><option value="log">Logarithmisch</option></select></label>
        {view === 'cabin' && <><label className="toggle"><input type="checkbox" checked={cabin} onChange={e => setCabin(e.target.checked)} />Kabine</label><label className="toggle"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />Wände transparent</label><label className="toggle"><input type="checkbox" checked={filter} onChange={e => setFilter(e.target.checked)} />Bodenfilter</label></>}</div>
      {view === 'map' ? <MapView p={p} pose={pose} z={z} max={max} log={log} r={r} axis={axis} fraction={fraction} showCut={showCut} /> : view === 'growth' ? <ProfileView p={p} r={r} z={z} max={max} log={log} axis={axis} fraction={fraction} showCut={showCut} dry={dry} /> : <Scene p={p} pose={pose} z={z} nx={r.nx} ny={r.ny} max={max} log={log} dry={dry} axis={axis} fraction={fraction} showCut={showCut} cabin={cabin} transparent={transparent} filter={filter} used={frame.used} time={time} duration={r.duration} playing={playing} />}
      {view === 'cabin' && <div className="bls-lamps" aria-label="Anlagensteuerung – Leuchtenzustände">{lights.map(l => <div key={l.label}><span className={`lamp ${l.color} ${l.state}`} /><strong>{l.label}</strong><small>{l.state === 'blink' ? 'Blinkt' : l.state === 'on' ? 'Leuchtet' : 'Aus'}</small></div>)}</div>}
      <div className="bls-legend"><span>Schichtdicke / µm · {log ? 'logarithmische' : 'lineare'} Farben</span><div>{Array.from({ length: 80 }, (_, i) => <i key={i} style={{ background: colorAt((log ? (Math.exp((i + 1) / 80 * Math.log(1000)) - 1) / 999 : (i + 1) / 80) * max, max, log) }} />)}</div><div className="bls-scale-ticks">{(log ? [max / 1000, max / 100, max / 10, max] : [0, max / 2, max]).map(v => <span key={v} style={{ left: `${100 * colorFraction(v, max, log)}%` }}>{fmt(v)}</span>)}</div><p>0: neutral · µm · feste Skala während des Ablaufs</p></div>
      <div className="timeline"><span>Zeit / s</span><input aria-label="Zeitposition in Sekunden" type="range" min="0" max={r.duration} step="0.02" value={time} onChange={e => { setPlaying(false); setTime(Number(e.target.value)); }} /><button onClick={() => { setPlaying(false); setTime(r.duration); }}>Ergebnis</button></div>
      <div className="stats">{[[fmt(mean) + ' µm', 'Mittlere ' + (dry ? 'Trocken' : 'Nass') + 'schicht'], [fmt(frame.used) + ' ml', 'Verbrauch inkl. Anspritzen'], [fmt(100 - frame.used) + ' ml', 'Spritzenrest'], [balance.awg === null ? '–' : fmt(balance.awg) + ' %', 'Auftragswirkungsgrad (AWG)']].map(([v, l]) => <div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
      <p>Kolbenweg: {fmt(pistonTravel(frame.used))} mm · Nasslack verspritzt: {fmt(balance.sprayedWetMass)} g · auf Blech: {fmt(balance.depositedWetMass)} g.</p>
      <div className="bls-cuts"><label className="toggle"><input type="checkbox" checked={showCut} onChange={e => setShowCut(e.target.checked)} />Schnitt einblenden</label><label>Schnittrichtung<select value={axis} onChange={e => setAxis(e.target.value as Axis)}><option value="x">x variiert · y fest</option><option value="y">y variiert · x fest</option></select></label><label>Schnittposition {axis === 'x' ? 'y' : 'x'} = {fmt((fraction - .5) * (axis === 'x' ? p.height : p.width))} mm<input type="range" min="0" max="1" step="0.01" value={fraction} onChange={e => setFraction(Number(e.target.value))} /></label></div>
      <section className="bls-section"><h3>Auftragsschnitt · {axis} / mm</h3><svg viewBox="0 0 700 210" role="img" aria-label="Lineares Schichtdickenprofil entlang des ausgewählten Schnitts"><path d="M60 20 V165 H670" fill="none" stroke="#647e90" /><polyline points={values.map((v, i) => `${60 + (i + .5) / values.length * 600},${165 - v / Math.max(1e-12, max) * 140}`).join(' ')} fill="none" stroke="#673b9e" strokeWidth="2.5" /><text x="2" y="22" fontSize="13">{fmt(max)}</text><text x="8" y="165" fontSize="13">0</text><text x="280" y="202" fontSize="14">{axis} / mm · −{(axis === 'x' ? p.width : p.height)/2} bis {(axis === 'x' ? p.width : p.height)/2}</text><text x="60" y="15" fontSize="13">Schichtdicke / µm (linear)</text></svg></section>
      </>}
      <p className="note">Lehrmodell ohne Messkalibrierung. Geometrie, Brush-Kennlinien und Bewegungszeiten sind angenähert. Details und Formeln in der Programmbeschreibung.</p>
    </section></div></div>;
}
