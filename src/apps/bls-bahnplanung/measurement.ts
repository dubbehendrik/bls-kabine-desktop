// Minimal reader for measuring-table exports (.xlsx without dependencies, or .csv).
import type { Point } from './fit';
export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };
export type Measurement = { points: Point[]; meta: Record<string, string | number>; rejected: number; sheet: string };

const u16 = (d: DataView, o: number) => d.getUint16(o, true), u32 = (d: DataView, o: number) => d.getUint32(o, true);
async function inflate(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzip(buffer: ArrayBuffer) {
  const d = new DataView(buffer), bytes = new Uint8Array(buffer), files = new Map<string, Uint8Array>();
  let end = -1; for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (u32(d, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Die Datei ist keine gültige Excel-Datei (.xlsx).');
  let p = u32(d, end + 16); const count = u16(d, end + 10), dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const method = u16(d, p + 10), size = u32(d, p + 20), nameLen = u16(d, p + 28), extra = u16(d, p + 30), comment = u16(d, p + 32), local = u32(d, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen)), start = local + 30 + u16(d, local + 26) + u16(d, local + 28), raw = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? raw : await inflate(raw)); p += 46 + nameLen + extra + comment;
  }
  return files;
}
const entity = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
const attr = (s: string, name: string) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const column = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((s, c) => s * 26 + c.charCodeAt(0) - 64, 0) - 1;
export async function readXlsx(buffer: ArrayBuffer): Promise<Sheet[]> {
  const files = await unzip(buffer), text = (n: string) => files.has(n) ? new TextDecoder().decode(files.get(n)) : '';
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => entity([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)].map(m => [attr(m[1], 'Id')!, attr(m[1], 'Target')!]));
  return [...text('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)].map(m => {
    const target = rels.get(attr(m[1], 'r:id') || '') || '', path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const rows: Cell[][] = [];
    for (const r of text(path).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const row: Cell[] = [], index = Number(attr(r[1], 'r') || rows.length + 1) - 1;
      for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const type = attr(c[1], 't'), ref = attr(c[1], 'r'), body = c[2] || '', v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const value: Cell = type === 's' ? shared[Number(v)] ?? null : type === 'inlineStr' ? entity([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')) : type === 'str' || type === 'b' ? (v === undefined ? null : entity(v)) : v === undefined ? null : Number(v);
        row[ref ? column(ref) : row.length] = value;
      }
      rows[index] = Array.from(row, v => v ?? null);
    }
    return { name: entity(attr(m[1], 'name') || ''), rows: Array.from(rows, r => r ?? []) };
  });
}
export function readCsv(text: string): Sheet[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim()), sep = [';', '\t', ','].find(s => lines[0]?.includes(s)) || ';';
  return [{ name: 'CSV', rows: lines.map(l => l.split(sep).map(c => {
    const t = c.trim().replace(/^"|"$/g, ''), n = Number(sep === ',' ? t : t.replace(',', '.'));
    return t === '' ? null : Number.isFinite(n) ? n : t;
  })) }];
}
const num = (v: Cell) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : NaN;
/** Find the thickness table (columns Blech X / Blech Y / Schichtdicke, optional Status), drop invalid rows and average repeated runs. */
export function parseMeasurement(sheets: Sheet[]): Measurement {
  const meta: Record<string, string | number> = {};
  for (const s of sheets.filter(s => /rahmen|meta/i.test(s.name))) for (const r of s.rows) if (typeof r[0] === 'string' && r[1] !== null && r[1] !== undefined) meta[r[0].trim()] = r[1] as string | number;
  for (const s of sheets) {
    const hi = s.rows.findIndex(r => r.some(c => typeof c === 'string' && /schichtdicke|^h\b|dicke/i.test(c)));
    if (hi < 0) continue;
    const head = s.rows[hi].map(c => String(c ?? '')), find = (re: RegExp) => head.findIndex(h => re.test(h));
    const ix = find(/blech\s*x|^x\b/i), iy = find(/blech\s*y|^y\b/i), ih = find(/schichtdicke|^h\b|dicke/i), is = find(/status/i);
    if (ix < 0 || iy < 0 || ih < 0) continue;
    const sums = new Map<string, { x: number; y: number; h: number; n: number }>(); let rejected = 0;
    for (const r of s.rows.slice(hi + 1)) {
      const x = num(r[ix] ?? null), y = num(r[iy] ?? null), h = num(r[ih] ?? null);
      if (![x, y, h].every(Number.isFinite)) { if (r.some(c => c !== null)) rejected++; continue; }
      if (is >= 0 && r[is] && !/gültig|gueltig|ok|valid/i.test(String(r[is]))) { rejected++; continue; }
      const key = `${x}|${y}`, o = sums.get(key) || { x, y, h: 0, n: 0 }; o.h += h; o.n++; sums.set(key, o);
    }
    const points = [...sums.values()].map(o => ({ x: o.x, y: o.y, h: o.h / o.n }));
    if (points.length) return { points, meta, rejected, sheet: s.name };
  }
  throw new Error('Keine Messwerte gefunden. Erwartet werden Spalten „Blech X / mm“, „Blech Y / mm“ und „Schichtdicke / µm“.');
}
export async function readMeasurementFile(file: { name: string; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }) {
  return parseMeasurement(/\.csv$|\.txt$/i.test(file.name) ? readCsv(await file.text()) : await readXlsx(await file.arrayBuffer()));
}
/** Optional brush metadata written into the "Rahmendaten" sheet ("Brush: …" keys). */
export function brushMeta(meta: Record<string, string | number>) {
  const get = (re: RegExp) => Object.entries(meta).find(([k]) => re.test(k))?.[1], n = (v: unknown) => num((v ?? null) as Cell);
  const scenario = String(get(/brush:\s*szenario/i) ?? ''), cap = String(get(/brush:\s*luftkappe/i) ?? ''), travel = String(get(/brush:\s*fahrtrichtung/i) ?? ''), layer = String(get(/brush:\s*schicht/i) ?? '');
  return {
    role: /standbild|station/i.test(scenario) ? 'spot' as const : /\bB\b|längs/i.test(scenario) || /längs/i.test(cap) ? 'B' as const : /\bA\b|quer/i.test(scenario) || /quer/i.test(cap) ? 'A' as const : undefined,
    travel: /x/i.test(travel) ? 'x' as const : /y/i.test(travel) ? 'y' as const : undefined,
    speed: n(get(/brush:\s*geschwindigkeit/i)), time: n(get(/brush:\s*spritzdauer/i)), q: n(get(/brush:\s*lackmenge/i)), solids: n(get(/brush:\s*volumenfestk/i)),
    dry: layer ? !/nass/i.test(layer) : undefined, length: n(get(/^länge/i)), width: n(get(/^breite/i)),
  };
}
