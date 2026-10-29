# Hinweise für Claude

- Sprache mit dem Nutzer: Deutsch. Nutzer ist Lehrender, kein Vollzeit-Entwickler: Schritte erklären.
- App-Logik liegt in `src/apps/bls-bahnplanung/`, Desktop-Hülle in `electron/`. Das Modell ist ein Lehrmodell; Annahmen in `docs/modell.md` dokumentieren.
- Vor jedem Commit: `npm run build` (Tests + Typprüfung + Vite). In Claude-Sessions ist die npm-Registry ggf. gesperrt – dann über den Workflow „Tests“ auf GitHub prüfen.
- Release: Version in `package.json` + Abschnitt in `CHANGELOG.md`, dann Workflow „Windows-Installer“ manuell mit Häkchen „Veröffentlichen“ starten (`gh workflow run release.yml -f publish=true`) oder Tag `vX.Y.Z`. Tag-Pushes sind aus Claude-Sessions gesperrt, der manuelle Start funktioniert. Workflow „Windows-Installer“ veröffentlicht nach `dubbehendrik/bls-kabine-downloads`.
- Asset-Namen (`BLS-Kabine-Lehrtool-Setup.exe`, `latest.json`) und das Format von `latest.json` sind die Schnittstelle zu installierten Versionen – nicht ändern, ohne den Updater abwärtskompatibel zu halten.
- Keine Herstellerdokumente oder Fotos der Füll-Lab-Kabine ins Repo legen.
