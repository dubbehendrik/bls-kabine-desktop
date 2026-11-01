# BLS Bahnplanung (Demo)

Route: /bls-bahnplanung; category Fokus Labor. Independent of HR-ESTA.

## Confirmed motion

Vacuum-fixed horizontal sheet translates in X and can rotate 90 degrees. Nozzle translates in Y. Distance is manually set, fixed throughout a program. Syringe piston feeds material continuously on both scan directions, Y offsets and sheet rotation. X stops during Y offsets. Priming is automatic in the demo and included in withdrawal. One 100 ml syringe, approximate bore 30 mm.

## Model

Normalized elliptical 2D Gaussian on the target plane, integrated in time in sheet coordinates including rotation. Width scales with distance. Horn air stretches the Gaussian; atomizing pressure has a weak assumed influence. These dependencies are illustrative, not fitted. Deposition factor 0.7 on an unlimited plane; losses beyond the sheet remain lost. Dry film uses volume solids, not mass solids. Numerical cells are integrated at their centers with a step limited to 0.04 s and 2 mm scan travel. Time slider displays stored snapshots. Withdrawal stops at 100 ml. Priming lasts 1 s and is assigned entirely outside the sheet; repositioning lasts 1 s without flow. Offset lasts 0.3 s + 0.024 s/mm; rotation lasts 2 s with flow. Constant scan speed and instantaneous X stops: acceleration effects are not included. Cross mode rotates between successive passes; even passes use 90 degrees, odd passes 0 degrees. Meander rows are symmetric about the sheet center and span its width. All nonmeasured geometry is schematic.

Reference model family: Li et al. 2024, https://doi.org/10.1177/16878132241234185. Local BLS short instructions and manufacturer operating instructions supplied by the user; no proprietary documents or photos are published.

## Verification

Automated tests cover Gaussian normalization, round/elliptical symmetry, orientation, distance scaling, continuous flow during offsets and rotation, priming consumption, zero flow, analytical spot reference, edge accumulation and syringe exhaustion. Full repository build runs tests and TypeScript before Vite. Browser QA covers SVG fallback where WebGL is unavailable; native WebGL appearance remains to be checked on a GPU-enabled device.

## Refinement 2026-10-29

- Initial sheet X=200 / Y=100 mm; portrait 2D view (X up) with sheet-fixed arrows. Default pitch 30 mm, speed 200 mm/s, distance 150 mm, cap 90 degrees.
- Draft number text is checked only on blur/Enter; invalid text remains visible, errors block recalculation. Recalculation preserves relative time and prior results remain until confirmed.
- Material examples for solvent 2K, waterborne 1K and waterborne 2K, plus custom density/viscosity/volume solids. Wet density is used only for wet mass. Viscosity is descriptive. AWG uses the ratio of deposited to sprayed solids, including priming. Solid density cancels for identical composition; undefined at zero solids/zero flow.
- Start release 0.8 s (application lamp blinking), approach 0.7 s, priming 1 s, final drive retract 1.5 s. Four lamps are mapped to these states with text status as well as color. Left and second lamps are green; right two white. Approximate 30 mm syringe bore determines piston travel.
- Cap has a retaining ring, central nozzle and opposed extruded horns. Horn axis is perpendicular to the fan major axis. Cap, needle, syringe and guide are connected; bridge connects to booth frame. Head and control-desk closeups are available.
- Shared logarithmic COLOR mapping log(1+999*h/hmax)/log(1000), neutral zero; height, cut curves and µm axis remain linear. Canvas profile follows the HR-ESTA visualization with a movable section plane and direct rotation controls.
- Browser verified delayed validation (intermediate 1 accepted before blur, then rejected for speed), editing to 100 and recalculation, profile, closeup and labeled panel. Browser has WebGL disabled; SVG fallback and Canvas profile verified. Native GPU appearance still needs user-side checking.

## Desktop 0.1.1 – überhöhte 3D-Schicht

Kabinenansicht: Die Schicht kann wie in der Roboter-Bahnplanung überhöht als geschlossener Körper gezeigt werden. Darstellungshöhe = Schichtdicke / Skalenmaximum × eingestellte Höhe (0–100 mm, Standard 40 mm), linear auch bei logarithmischer Farbskala. Skalenmaximum ist das Maximum des Endzustands, daher bleibt der Maßstab über die Animation konstant. Reine Darstellung, keine Modelländerung. Gitterwerte (Zellmittelpunkte) werden wie bisher auf die Plattenecken gelegt.

## Desktop 0.1.2 – Schnittebene in der Kabinenansicht

Die Schnittebene nutzt dieselbe Gitterzeile bzw. -spalte wie `cutValues()` und die 2D-Ansichten und ist blechfest (dreht beim Kreuzgang mit). Die Profilkurve liegt auf den Stützpunkten der überhöhten Schicht; bei Überhöhung 0 wird nur die Ebenenlage gezeigt.

## Desktop 0.2.0 – Brush-Designer und Brush aus Experiment

Brush-Quelle wählbar: Gaußkern (Lehrmodell, η = 0,7), Designer oder Experiment. Beta-Brush im Düsensystem (u lange Achse, v kurze Achse):
R(u,v) = (1 + γt²)(1 − |t|^m)^k (1 − |w|^n)^l mit t = u/a, w = v/b(t), b(t) = b(1 + 0,35γt²); numerisch auf ∫∫K = 1 normiert (1/mm²). Höhe aus V̇ · Volumenfestkörper · AWG (AWG ersetzt η). Die Luftkappe dreht den Brush wie bisher um 0°/90°; Abstand und Drücke wirken beim Beta-Brush nicht auf die Form (nur Dokumentation).

Vorwärtskette für den Fit: Standbild h = F·t·K; Einzelbahn A (Strahl quer zur Fahrt) h = F/v · ∫K dv; Einzelbahn B (Strahl längs) h = F/v · ∫K du; F = 1000·AWG·φ·V̇ (µm, V̇ in mm³/s; φ = Festkörper bei Trockenschicht, sonst 1). A bestimmt a, m, k, γ (b, n, l kürzen sich heraus), B bestimmt b, n, l. Gemeinsamer Fit mit getrennter Bahnmitte je Blech; Standbild mit Mitte und Drehung. Nelder-Mead auf logit-begrenzten Parametern mit Neustarts, Standardabweichungen aus der Jacobi-Matrix (lineare Näherung). Plausibilität: AWG aus der Fläche unter A und B muss übereinstimmen (Abweichung > 15 % → Hinweis).

Messablauf (Annahme 200 × 100-Blech): Fahrt quer zur 200er-Seite, Profil entlang der 200er-Seite, mehrere Messlinien werden gemittelt. Blech B identisch, Luftkappe 90° gedreht. Die Kappenstellung relativ zur Fahrt ist Pflichtangabe (Rolle A/B); ein Winkelfehler ε verbreitert Profil B um etwa a·sin ε und ist aus B allein nicht von b zu trennen. Überlauf je Seite mindestens halbe Strahlausdehnung in Fahrtrichtung plus Beschleunigungsweg.

Import: .xlsx ohne Zusatzbibliothek (ZIP + DecompressionStream), Spalten „Blech X / Blech Y / Schichtdicke / Status“, nur gültige Punkte, Runs gemittelt. Fit läuft in einem Web Worker. Synthetische Testdateien in tests/fixtures (Wahrheit a 85, b 28, m 5, k 0,9, n 2,2, l 1,6, γ 0,4, AWG 62 %) werden in den Tests wiedergefunden.
