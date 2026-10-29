import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST_NAME, RELEASES_API, evaluate, findAsset, parseManifest } from './update-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(app.getAppPath(), 'dist');
const TITLE = 'BLS-Kabine Lehrtool';
const ORIGIN = 'app://bls';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:";
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };

/** @type {BrowserWindow | null} */
let win = null;
let updateRunning = false;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/** Serves the Vite build from inside the app package (asar) under app://bls/. */
async function serve(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
  try {
    const body = await readFile(file);
    const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
    if (headers['Content-Type'] === 'text/html') headers['Content-Security-Policy'] = CSP;
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false, title: TITLE,
    backgroundColor: '#f3f6f8', autoHideMenuBar: false,
    icon: path.join(here, '..', 'build', 'icon.ico'),
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win?.maximize(); win?.show(); });
  win.on('closed', () => { win = null; });
  win.on('page-title-updated', e => e.preventDefault());
  // External links (e.g. literature DOI) open in the default browser; nothing else may navigate away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadURL(`${ORIGIN}/index.html`);
}

function buildMenu() {
  const isDev = !app.isPackaged;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Datei', submenu: [{ role: 'quit', label: 'Beenden' }] },
    { label: 'Ansicht', submenu: [
      { role: 'reload', label: 'Neu laden' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Originalgröße' }, { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Vollbild' },
      ...(isDev ? [{ role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' }] : []),
    ] },
    { label: 'Hilfe', submenu: [
      { label: 'Nach Updates suchen …', click: () => checkForUpdates({ silent: false }) },
      { type: 'separator' },
      { label: `Über ${TITLE}`, click: about },
    ] },
  ]));
}

function about() {
  dialog.showMessageBox(win ?? undefined, {
    type: 'info', title: `Über ${TITLE}`, message: `${TITLE} ${app.getVersion()}`,
    detail: 'BLS-Kabine: Bahnplanung und Spritzbildprognose.\nDemo ausschließlich für Lehrzwecke, keine reale Anlagensteuerung und keine bestätigten Anlagenwerte.\n\nHochschule Esslingen',
  });
}

async function getJson(url) {
  const res = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${TITLE}/${app.getVersion()}` }, cache: 'no-store' });
  if (res.status === 404) throw new Error('Es wurde noch keine Version veröffentlicht.');
  if (!res.ok) throw new Error(`Server antwortet mit Status ${res.status}.`);
  return res.json();
}

/** Downloads the installer, streaming it to disk while hashing; deletes it again on any mismatch. */
async function download(update) {
  const dir = path.join(app.getPath('temp'), 'bls-kabine-update');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, update.manifest.file);
  await rm(target, { force: true });
  const res = await net.fetch(update.installer.url, { headers: { 'User-Agent': `${TITLE}/${app.getVersion()}` }, cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (Status ${res.status}).`);
  const hash = createHash('sha256'), out = createWriteStream(target);
  let received = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > update.manifest.size) throw new Error('Download ist größer als angekündigt.');
      hash.update(value);
      if (!out.write(value)) await new Promise(r => out.once('drain', r));
      win?.setProgressBar(received / update.manifest.size);
    }
    await new Promise((resolve, reject) => out.end(err => err ? reject(err) : resolve()));
    const digest = hash.digest('hex');
    const { size } = await stat(target);
    if (size !== update.manifest.size) throw new Error(`Dateigröße stimmt nicht (${size} statt ${update.manifest.size} Byte).`);
    if (digest !== update.manifest.sha256) throw new Error('SHA256-Prüfsumme stimmt nicht. Die Datei wurde verworfen.');
    return target;
  } catch (err) {
    out.destroy();
    await rm(target, { force: true });
    throw err;
  } finally {
    win?.setProgressBar(-1);
  }
}

async function checkForUpdates({ silent }) {
  if (updateRunning) return;
  updateRunning = true;
  const parent = win ?? undefined;
  try {
    const release = await getJson(RELEASES_API);
    const manifest = parseManifest(await getJson(findAsset(release, MANIFEST_NAME).url));
    const update = evaluate(release, manifest, app.getVersion());
    if (!update) {
      if (!silent) await dialog.showMessageBox(parent, { type: 'info', title: 'Updates', message: 'Sie verwenden die aktuelle Version.', detail: `Installiert: ${app.getVersion()}` });
      return;
    }
    const ask = await dialog.showMessageBox(parent, {
      type: 'info', title: 'Update verfügbar', buttons: ['Herunterladen', 'Später'], defaultId: 0, cancelId: 1,
      message: `Version ${update.version} ist verfügbar (installiert: ${app.getVersion()}).`,
      detail: `${update.notes ? update.notes + '\n\n' : ''}Größe: ${(update.manifest.size / 1048576).toFixed(1)} MB. Die Datei wird vor der Installation per SHA256 und Dateigröße geprüft.`,
    });
    if (ask.response !== 0) return;
    const installer = await download(update);
    const go = await dialog.showMessageBox(parent, {
      type: 'question', title: 'Update installieren', buttons: ['Jetzt installieren', 'Abbrechen'], defaultId: 0, cancelId: 1,
      message: 'Download vollständig und geprüft.',
      detail: 'Das Programm wird jetzt beendet und der Installer gestartet. Der Installer fragt das Installationspasswort ab.',
    });
    if (go.response !== 0) { await rm(installer, { force: true }); return; }
    spawn(installer, [], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
  } catch (err) {
    if (!silent) await dialog.showMessageBox(parent, { type: 'warning', title: 'Updateprüfung', message: 'Die Updateprüfung ist fehlgeschlagen.', detail: `${err instanceof Error ? err.message : String(err)}\n\nBesteht eine Internetverbindung? Das Programm selbst funktioniert auch offline.` });
  } finally {
    updateRunning = false;
  }
}

app.whenReady().then(() => {
  protocol.handle('app', serve);
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:check', () => checkForUpdates({ silent: false }));
  buildMenu();
  createWindow();
  // Quiet check after start: only speaks up when a newer version exists.
  if (app.isPackaged) setTimeout(() => checkForUpdates({ silent: true }), 8000);
});
app.on('window-all-closed', () => app.quit());
