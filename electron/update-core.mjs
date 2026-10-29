// Pure update logic without Electron dependencies, so it can be unit-tested with Vitest.

/** Public repository that holds installers and latest.json. Source code stays private. */
export const DOWNLOAD_REPO = 'dubbehendrik/bls-kabine-downloads';
export const MANIFEST_NAME = 'latest.json';
export const RELEASES_API = `https://api.github.com/repos/${DOWNLOAD_REPO}/releases/latest`;

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** Compares two versions "1.2.3" (optional leading v). Returns -1, 0 or 1. Throws on invalid input. */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(String(a).trim()), pb = SEMVER.exec(String(b).trim());
  if (!pa || !pb) throw new Error(`Ungültige Versionsangabe: ${a} / ${b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Validates latest.json: { version, file, size, sha256 }. Returns a normalized copy or throws. */
export function parseManifest(value) {
  if (!value || typeof value !== 'object') throw new Error('Updateinformation fehlt oder ist kein JSON-Objekt.');
  const { version, file, size, sha256 } = value;
  if (typeof version !== 'string' || !SEMVER.test(version)) throw new Error('Updateinformation: Version ungültig.');
  if (typeof file !== 'string' || !/^[\w.-]+\.exe$/.test(file)) throw new Error('Updateinformation: Dateiname ungültig.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Updateinformation: Dateigröße ungültig.');
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('Updateinformation: SHA256 ungültig.');
  return { version: version.replace(/^v/, ''), file, size, sha256: sha256.toLowerCase() };
}

/** Finds manifest and installer assets in a GitHub release object. */
export function findAsset(release, name) {
  const asset = Array.isArray(release?.assets) ? release.assets.find(a => a?.name === name) : undefined;
  if (!asset || typeof asset.browser_download_url !== 'string') throw new Error(`Datei ${name} fehlt im Release.`);
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new Error(`Unerwartete Downloadadresse für ${name}.`);
  return { url: url.toString(), size: asset.size };
}

/** Decides what to offer: null when the installed version is current. */
export function evaluate(release, manifest, installed) {
  if (release?.draft || release?.prerelease) return null;
  if (compareVersions(manifest.version, installed) <= 0) return null;
  const installer = findAsset(release, manifest.file);
  if (installer.size !== manifest.size) throw new Error('Dateigröße im Release stimmt nicht mit der Updateinformation überein.');
  return { version: manifest.version, installer, manifest, notes: String(release.body || '').slice(0, 1500) };
}
