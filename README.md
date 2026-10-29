# BLS-Kabine Lehrtool – Desktop (privat)

Windows-Desktopversion der Lehr-App **BLS Bahnplanung (Demo)**: Kabinenmodell, Bahnplanung und Spritzbildprognose. Nur für Lehrzwecke.

- Quellcode: dieses private Repository.
- Installer und Updates: öffentliches Repository [bls-kabine-downloads](https://github.com/dubbehendrik/bls-kabine-downloads).
- Ausgangsstand: `lehrapps-web` Commit `a469b09` (Ordner `src/apps/bls-bahnplanung`). Ab hier wird die Desktopversion eigenständig weiterentwickelt.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/apps/bls-bahnplanung/` | Die eigentliche App (React + Three.js), Modell in `model.ts` |
| `src/main.tsx` | Kopfzeile mit Version und „Nach Updates suchen“ |
| `electron/main.mjs` | Fenster, Menü, lokales Ausliefern der App, Update-Ablauf |
| `electron/update-core.mjs` | Update-Prüflogik ohne Electron (getestet in `tests/`) |
| `electron/preload.cjs` | Schmale Brücke Seite ↔ Programm |
| `build/installer.nsh` | Passwortseite im Installer, Sperre für stille Installation |
| `electron-builder.yml` | Installer-Konfiguration (NSIS, x64, pro Benutzer) |
| `.github/workflows/` | Tests bei jedem Push, Installer-Build und Veröffentlichung bei Tags |
| `docs/modell.md` | Fachliche Modellbeschreibung |

## Lokal entwickeln (optional)

Node.js 24, dann:

```sh
npm ci
npm run dev     # App im Browser (ohne Update-Knopf)
npm start       # App im Electron-Fenster
npm run dist    # Installer nach release/ (unter Windows)
```

## Neue Version veröffentlichen

1. `version` in `package.json` erhöhen (z. B. `0.1.1`) und Abschnitt `## 0.1.1` in `CHANGELOG.md` ergänzen.
2. Commit auf `main` pushen.
3. Auf GitHub: **Actions → Windows-Installer → Run workflow**, Branch `main`, Häkchen **Veröffentlichen** setzen → **Run workflow**. (Alternativ Tag `v0.1.1` pushen.)
   GitHub Actions baut auf Windows, prüft und veröffentlicht `BLS-Kabine-Lehrtool-Setup.exe`, `.sha256` und `latest.json` im Downloads-Repo.
4. Installierte Programme finden das Update über „Nach Updates suchen“ bzw. beim Start.

Voraussetzung für Schritt 3: Secret `DOWNLOADS_TOKEN` (Fine-grained Token mit „Contents: Read and write“ nur für `bls-kabine-downloads`). Ohne Secret liegt der Installer nur als Artefakt im Actions-Lauf.

Bestehende Versionen werden nie überschrieben; ein Tag, dessen Version schon veröffentlicht ist, schlägt fehl.

## Passwort

Installation und Update verlangen das Passwort aus `build/installer.nsh` (`BLS_INSTALL_PASSWORD`). Stille Installation (`/S`) ist gesperrt. Das Passwort steckt im Installer und ist damit eine Zugangshürde, kein kryptografischer Schutz. Deinstallation braucht kein Passwort.

## Hinweise

- Der Installer ist nicht code-signiert; Windows SmartScreen warnt beim ersten Start („Weitere Informationen → Trotzdem ausführen“).
- Die App läuft vollständig offline. Internet wird nur für die Updateprüfung gebraucht.
