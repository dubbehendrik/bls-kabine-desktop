export interface Manifest { version: string; file: string; size: number; sha256: string }
export interface Asset { url: string; size: number }
export const DOWNLOAD_REPO: string;
export const MANIFEST_NAME: string;
export const RELEASES_API: string;
export function compareVersions(a: string, b: string): -1 | 0 | 1;
export function parseManifest(value: unknown): Manifest;
export function findAsset(release: unknown, name: string): Asset;
export function evaluate(release: unknown, manifest: Manifest, installed: string): { version: string; installer: Asset; manifest: Manifest; notes: string } | null;
