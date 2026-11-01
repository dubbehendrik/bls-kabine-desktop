# Änderungen

## 0.2.0

- Eingaben neu sortiert: 01 Werkstück & Programm (mit Luftkappe zur Fahrt), 02 Anlage & Rüstung (Düsentyp neu, Düse, Abstand, Drücke, Lackmenge), 03 Lackmaterial (Oberflächenspannung neu), 04 Brush.
- Block 04 Brush mit drei Quellen: Modellschätzung (bisheriger Gaußkern, Standard), Brush-Designer (Beta-Brush mit Reglern a, b, m, k, n, l, γ und AWG, Vorlagen Ellipse / RP-Plateau / Knochen) und Brush aus Experiment.
- Neue Ansicht „Brush · Designer & Messung“: Standbild als Trockenschicht in 2D/3D mit einstellbarer Spritzdauer, SB50 und Einzelbahnprofile A (Strahl quer) und B (Strahl längs).
- Import von Messtisch-Exporten (.xlsx, Blatt „Messdaten“) oder CSV: zwei gekreuzte Einzelbahnen oder ein Standbild. Piktogramme zeigen Blechlage, Fahrtrichtung, Strahl und Hornstellung; Überlauf wird empfohlen. Optionale „Brush: …“-Einträge in den Rahmendaten füllen die Versuchsangaben.
- Fit der Brush-Parameter mit Standardabweichungen, Hinweisen zu schwach bestimmten Größen und Messpunkten als Overlay; der gefittete Brush wird in die Simulation übernommen und kann nachjustiert werden.
- Beispieldateien (synthetisch) unter `tests/fixtures/`.

## 0.1.2

- Kabinenansicht 3D: Schnittebene wird wie in der 3D-Profilansicht angezeigt (violette Ebene, Lagebeschriftung), mit Profilkurve auf der überhöhten Schichtoberfläche. Gesteuert über die bestehenden Schnitt-Einstellungen; dreht sich mit dem Blech.

## 0.1.1

- Kabinenansicht 3D: Schichtdicke kann überhöht als Körper dargestellt werden (Regler „Überhöhung“, 0–100 mm Höhe am Skalenmaximum, Standard 40 mm; 0 = flach wie bisher).
- µm-Achse am Blech, Seitenwände der Schicht, Spritzfleck-Umriss bleibt über der Schicht sichtbar.
- Höhe linear in µm, Maßstab über die Zeit konstant; Farbskala unverändert (linear oder logarithmisch).

## 0.1.0

- Erste Desktopversion der BLS Bahnplanung (Demo), Stand der Web-App vom 29.10.2026.
- Windows-Installer (x64, pro Benutzer) mit Passwortabfrage.
- Updateprüfung über „Nach Updates suchen“ und beim Programmstart; Download wird per SHA256 und Dateigröße geprüft.
