import { describe, it, expect } from 'vitest';
import { compareVersions, parseManifest, findAsset, evaluate } from '../electron/update-core.mjs';

const sha = 'a'.repeat(64);
const manifest = { version: '0.2.0', file: 'BLS-Kabine-Lehrtool-Setup.exe', size: 1234, sha256: sha };
const release = {
  tag_name: 'v0.2.0', draft: false, prerelease: false, body: 'Neu: …',
  assets: [
    { name: 'latest.json', size: 120, browser_download_url: 'https://github.com/dubbehendrik/bls-kabine-downloads/releases/download/v0.2.0/latest.json' },
    { name: 'BLS-Kabine-Lehrtool-Setup.exe', size: 1234, browser_download_url: 'https://github.com/dubbehendrik/bls-kabine-downloads/releases/download/v0.2.0/BLS-Kabine-Lehrtool-Setup.exe' },
  ],
};

describe('update core', () => {
  it('compares semantic versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(() => compareVersions('1.0', '1.0.0')).toThrow();
  });
  it('validates the manifest strictly', () => {
    expect(parseManifest({ ...manifest, sha256: sha.toUpperCase() }).sha256).toBe(sha);
    expect(() => parseManifest({ ...manifest, sha256: 'xyz' })).toThrow();
    expect(() => parseManifest({ ...manifest, file: '../evil.exe' })).toThrow();
    expect(() => parseManifest({ ...manifest, size: -1 })).toThrow();
    expect(() => parseManifest(null)).toThrow();
  });
  it('only accepts https github.com download URLs', () => {
    expect(findAsset(release, 'latest.json').url).toContain('github.com');
    const bad = { assets: [{ name: 'latest.json', size: 1, browser_download_url: 'http://example.com/latest.json' }] };
    expect(() => findAsset(bad, 'latest.json')).toThrow();
  });
  it('offers newer versions only and checks size consistency', () => {
    expect(evaluate(release, manifest, '0.1.0')?.version).toBe('0.2.0');
    expect(evaluate(release, manifest, '0.2.0')).toBeNull();
    expect(evaluate({ ...release, prerelease: true }, manifest, '0.1.0')).toBeNull();
    expect(() => evaluate(release, { ...manifest, size: 99 }, '0.1.0')).toThrow();
  });
});
