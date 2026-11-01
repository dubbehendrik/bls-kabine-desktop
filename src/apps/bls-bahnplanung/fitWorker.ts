import { fitSpot, fitTracks, type SpotData, type TrackData } from './fit';
export type FitRequest = { kind: 'tracks'; A: TrackData; B: TrackData } | { kind: 'spot'; S: SpotData };
self.onmessage = (e: MessageEvent<FitRequest>) => {
  try { const d = e.data; postMessage({ ok: true, result: d.kind === 'tracks' ? fitTracks(d.A, d.B) : fitSpot(d.S) }); }
  catch (error) { postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
