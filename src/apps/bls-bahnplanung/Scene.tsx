import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { brush, colorFraction, exaggeratedHeight, lamps, pistonTravel, type Params, type Pose } from './model';
const fmtUm = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: n < 10 ? 1 : 0 });
export default function Scene({ p, pose, z, nx, ny, max, log, cabin, transparent, filter, used, time, duration, playing, dry = true, axis = 'x', fraction = .5, showCut = false }: {
  p: Params; pose: Pose; z: Float32Array; nx: number; ny: number; max: number; log: boolean; dry?: boolean; axis?: 'x' | 'y'; fraction?: number; showCut?: boolean;
  cabin: boolean; transparent: boolean; filter: boolean; used: number; time: number; duration: number; playing: boolean;
}) {
  const host = useRef<HTMLDivElement>(null), rendererRef = useRef<T.WebGLRenderer | SVGRenderer | null>(null);
  const saved = useRef<{ focus: string; position: T.Vector3; target: T.Vector3 } | null>(null);
  const interaction = useRef<{ camera: T.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const [focus, setFocus] = useState('overall');
  // Display height of the colour-scale maximum in mm; 0 keeps the flat coloured coating.
  const [exaggeration, setExaggeration] = useState(40);
  useEffect(() => () => { interaction.current?.controls.dispose(); interaction.current = null; if (rendererRef.current instanceof T.WebGLRenderer) rendererRef.current.dispose(); rendererRef.current = null; }, []);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current, scene = new T.Scene(); scene.background = new T.Color('#e9eef2');
    const camera = interaction.current?.camera ?? new T.PerspectiveCamera(38, 1, 1, 6000);
    if (!interaction.current) camera.position.set(1000, 850, 1250);
    let renderer = rendererRef.current;
    if (!renderer) {
      try { renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); }
      catch { renderer = new SVGRenderer(); renderer.setQuality('low'); }
      rendererRef.current = renderer;
    }
    const activeRenderer = renderer;
    // Keep the input surface attached: re-inserting it during playback cancels pointer capture.
    if (renderer.domElement.parentNode !== el) el.appendChild(renderer.domElement);
    const labelRenderer = new CSS2DRenderer(); labelRenderer.domElement.className = 'bls-3d-labels'; el.appendChild(labelRenderer.domElement);
    const controls = interaction.current?.controls ?? new OrbitControls(camera, renderer.domElement);
    if (!interaction.current) controls.target.set(0, 285, 0);
    interaction.current = { camera, controls }; controls.enableDamping = true;
    scene.add(new T.HemisphereLight(0xffffff, 0x607080, 2.6));
    const light = new T.DirectionalLight(0xffffff, 3); light.position.set(400, 900, 500); scene.add(light);
    function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, opacity = 1, parent: T.Object3D = scene) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color, metalness: .55, roughness: .36, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    function cyl(r: number, h: number, x: number, y: number, z: number, color: number, opacity = 1, parent: T.Object3D = scene) {
      const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 24), new T.MeshStandardMaterial({ color, metalness: .35, roughness: .3, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    function label(text: string, x: number, y: number, z: number, cls = '') {
      const div = document.createElement('div'); div.className = `bls-model-label ${cls}`; div.textContent = text;
      const object = new CSS2DObject(div); object.position.set(x, y, z); scene.add(object); return div;
    }
    if (cabin) {
      const op = transparent ? .1 : 1;
      box(750, 220, 650, 0, -150, 0, 0x89949e);
      for (const x of [-335,335]) for (const zz of [-285,285]) cyl(20, 25, x, -273, zz, 0x263743); box(750, 90, 650, 0, 730, 0, 0xb2bbc1);
      for (const x of [-370, 370]) for (const zz of [-320, 320]) box(18, 810, 18, x, 310, zz, 0x73828c);
      box(740, 600, 6, 0, 350, -320, 0xaabac2, op); box(6, 600, 640, -370, 350, 0xaabac2, op);
      box(6, 600, 640, 370, 350, 0xaabac2, op); box(740, 600, 6, 0, 350, 320, 0xc0d8e3, transparent ? .06 : .3);
    }
    // Full-depth side cabinet, sharing the booth's floor level. Its front roof is the inclined panel.
    const consoleShape = new T.Shape();
    consoleShape.moveTo(320, -260); consoleShape.lineTo(-350, -260);
    consoleShape.lineTo(-350, 75); consoleShape.lineTo(-90, 225);
    consoleShape.lineTo(320, 225); consoleShape.closePath();
    const consoleBody = new T.Mesh(new T.ExtrudeGeometry(consoleShape, { depth: 260, bevelEnabled: false }),
      new T.MeshStandardMaterial({ color: 0x929da5, metalness: .65, roughness: .35 }));
    consoleBody.rotation.y = Math.PI / 2; consoleBody.position.x = -630; scene.add(consoleBody);
    for (const x of [-605, -395]) for (const zz of [-285, 315]) cyl(20, 25, x, -273, zz, 0x263743);
    // Panel-local XY plane: screen, rings and lenses all lie on the same inclined face.
    const panel = new T.Group(); panel.position.set(-500, 150, 220); panel.rotation.x = -Math.PI / 3; scene.add(panel);
    box(246, 292, 3, 0, 0, 0, 0x687b88, 1, panel);
    // A thin bezel surrounds a dark glass inset; no freestanding monitor housing.
    box(190, 114, 2, 0, 61, 2, 0xc8ced0, 1, panel);
    box(168, 94, 1, 0, 61, 3.2, 0x183444, 1, panel);
    box(150, 3, 1, 0, 90, 3.9, 0x7094a5, 1, panel);
    const panelLabel = (text: string, x: number, y: number) => {
      const div = document.createElement('div'); div.className = 'bls-model-label bls-panel-label'; div.textContent = text;
      const object = new CSS2DObject(div); object.position.set(x, y, 9); panel.add(object);
    };
    if (focus === 'panel') panelLabel('BLS · ' + pose.phase, 0, 60);
    const states = lamps(pose, time, duration), lampMaterials: T.MeshBasicMaterial[] = [];
    const shortLabels = ['Auto Start · Tür verriegeln', 'Spritzapplikation Start', 'Spritze entnehmen', 'Spritze anfahren'];
    for (let i = 0; i < 4; i++) {
      const x = -87 + i * 58;
      const ring = cyl(19, 5, x, -88, 5, 0xc0c9ce, 1, panel); ring.rotation.x = Math.PI / 2;
      const material = new T.MeshBasicMaterial({ color: i < 2 ? 0x184c36 : 0x8b969f });
      const lens = new T.Mesh(new T.SphereGeometry(14, 20, 12), material); lens.scale.z = .35; lens.position.set(x, -88, 9); panel.add(lens); lampMaterials.push(material);
      if (focus === 'panel') panelLabel(shortLabels[i], x, -122);
    }
    // Emergency stop and a compact keypad between display and indicator row.
    const stopBase = cyl(22, 5, 82, -24, 5, 0xe9c52c, 1, panel); stopBase.rotation.x = Math.PI / 2;
    const stop = cyl(15, 12, 82, -24, 12, 0xb81e28, 1, panel); stop.rotation.x = Math.PI / 2;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) box(12, 12, 2, -72 + col * 19, -18 - row * 19, 4, 0xc7ced2, 1, panel);
    box(720, 45, 620, 0, -35, 0, 0x6f7e86);
    if (filter) for (let i = 0; i < 20; i++) { const slat = box(700, 15, 22, 0, -5, -285 + i * 30, 0xb89d74); slat.rotation.x = .45; }
    // Visible longitudinal support (Y direction), carried with the X carriage; no extra motion axis is implied.
    box(650, 18, 26, 0, -20, 0, 0x344551);
    box(90, 20, 570, -pose.x, 3, 0, 0x566b79);
    for (const xOffset of [-32, 32]) {
      box(9, 9, 550, -pose.x + xOffset, 17, 0, 0xb9c8d0);
      for (const zz of [-260,260]) box(22, 24, 28, -pose.x + xOffset, 10, zz, 0x344b5a);
    }
    box(120, 16, 100, -pose.x, 25, 0, 0x8898a1); // Support top at y=39 meets sheet underside; coating lies at y=42.
    // Never overlap these surfaces: coplanar depth values cause a flickering circular patch.
    cyl(37, 12, -pose.x, 33, 0, 0x2d454f);
    // Bridge is connected to both cabin sides, Y rail and carriage are mechanically continuous.
    for (const zz of [-250, 250]) box(740, 22, 35, 0, 675, zz, 0x8d9ba5);
    box(45, 24, 560, 0, 670, 0, 0x8899a4); box(105, 28, 90, 0, 647, (-pose.y) - 25, 0x9ba8ae);
    const outlet = 53 + p.distance, spineBottom = outlet + 20;
    box(32, 645 - spineBottom, 28, 0, (645 + spineBottom) / 2, (-pose.y) - 45, 0xa7b2b9);
    box(10, 645 - spineBottom, 6, 0, (645 + spineBottom) / 2, (-pose.y) - 28, 0x263843);
    box(76, 28, 65, 0, outlet + 35, (-pose.y) - 20, 0x9ba7af); // bottom saddle joins spine and cap
    box(35, 130, 35, -42, 570, (-pose.y) - 45, 0x172e40); // drive motor, connected through gear bracket
    box(65, 24, 40, -20, 635, (-pose.y) - 45, 0x9ca9b2);
    const totalStroke = pistonTravel(100);
    const liftFraction = pose.phase === 'Spritze anfahren' ? Math.max(0, 1 - (time - .8) / .7) : pose.phase === 'Spritze entnehmen' ? Math.min(1, Math.max(0, (time - (duration - 1.5)) / 1.5)) : time <= .8 ? 1 : 0;
    // The syringe is in front of the guide. Needle remains seated; drive rises for removal.
    const barrelBottom = outlet + 65, barrelTop = barrelBottom + totalStroke;
    cyl(16.5, totalStroke, 0, (barrelTop + barrelBottom) / 2, (-pose.y), 0xb1d4df, .23);
    cyl(18, 7, 0, barrelBottom, (-pose.y), 0xe9e7dc); cyl(19, 6, 0, barrelTop, (-pose.y), 0xe5e7e6);
    cyl(5, 18, 0, outlet + 53, (-pose.y), 0xd2d6d8); cyl(1.3, 28, 0, outlet + 31, (-pose.y), 0xa8b7c0);
    const pistonY = barrelTop - pistonTravel(used);
    const liquidHeight = Math.max(0, pistonY - barrelBottom - 4);
    if (liquidHeight > 0) cyl(14, liquidHeight, 0, barrelBottom + 2 + liquidHeight / 2, (-pose.y), 0x173b72, .88);
    for (const side of [-1,1]) { box(5, totalStroke + 16, 8, side * 23, (barrelTop + barrelBottom)/2, (-pose.y) - 8, 0x8d9da8); }
    cyl(14.5, 7, 0, pistonY, (-pose.y), 0xf4f1df);
    const driveY = pistonY + 9 + liftFraction * 28;
    cyl(4, Math.max(4, 640 - driveY), 0, (640 + driveY) / 2, (-pose.y), 0x778b98);
    box(36, 8, 30, 0, driveY, (-pose.y), 0xd5dce0); box(18, 14, 45, 0, 634, (-pose.y) - 20, 0xa9b5bd);
    // Air cap: threaded retaining ring, central nozzle, opposed sculpted horns and air holes.
    cyl(20, 22, 0, outlet + 14, (-pose.y), 0x263b4d); cyl(23, 10, 0, outlet + 3, (-pose.y), 0xb8a78a);
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; box(1.2, 9, 1.2, 22.6 * Math.cos(a), outlet + 3, (-pose.y) + 22.6 * Math.sin(a), 0x88929a); }
    cyl(20, 4, 0, outlet - 3, (-pose.y), 0x3469a6); cyl(15, 3, 0, outlet - 6, (-pose.y), 0xcbd3d8);
    cyl(5, 5, 0, outlet - 9, (-pose.y), 0x7a8d99); cyl(p.nozzle / 2, 1, 0, outlet - 12, (-pose.y), 0x172e40);
    const cap = new T.Group(); cap.position.set(0, outlet - 6, (-pose.y));
    // Horns are perpendicular to fan major axis: the impinging shaping jets flatten the spray.
    cap.rotation.y = p.orientation * Math.PI / 180; scene.add(cap);
    const shape = new T.Shape(); shape.moveTo(10, 0); shape.lineTo(20, 0); shape.lineTo(19, -17); shape.lineTo(14, -21); shape.lineTo(10, -12); shape.closePath();
    for (const sign of [-1, 1]) {
      const geometry = new T.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: true, bevelSize: .7, bevelThickness: .7, bevelSegments: 2, steps: 1 });
      const horn = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0xc5cdd0, metalness: .8, roughness: .28 }));
      horn.rotation.y = sign === 1 ? Math.PI / 2 : -Math.PI / 2; horn.position.x = sign === 1 ? -3 : 3; cap.add(horn);
      const hole = new T.Mesh(new T.SphereGeometry(1.8, 8, 6), new T.MeshBasicMaterial({ color: 0x1a2932 })); hole.position.set(0, -15, sign * 14); cap.add(hole);
    }
    if (focus === 'head') { label(`Flachstrahl ${p.orientation}° · Hörner quer zur langen Strahlachse`, 0, outlet - 35, (-pose.y)); }
    if (pose.on && used < 100) {
      const b = brush(p), spray = new T.Mesh(new T.ConeGeometry(1, p.distance, 36, 1, true), new T.MeshBasicMaterial({ color: 0x2ad89d, transparent: true, opacity: .28, side: T.DoubleSide, depthWrite: false }));
      spray.scale.set(b.sx * 2.5, 1, b.sy * 2.5); spray.rotation.y = p.orientation * Math.PI / 180; spray.position.set(0, outlet - 12 - p.distance / 2, (-pose.y)); scene.add(spray);
      const points = Array.from({length: 81}, (_, i) => { const a=i/80*Math.PI*2, u=b.sx*2.5*Math.cos(a), v=b.sy*2.5*Math.sin(a), t=p.orientation*Math.PI/180; return new T.Vector3(u*Math.cos(t)-v*Math.sin(t), 43, (-pose.y)-u*Math.sin(t)-v*Math.cos(t)); });
      const footprint = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x008b58, depthTest: false, depthWrite: false }));
      footprint.renderOrder = 20; scene.add(footprint); // stays visible above an exaggerated layer
    }
    const group = new T.Group(); group.position.set(-pose.x, 40, 0); group.rotation.y = pose.angle; scene.add(group);
    box(p.width, 2, p.height, 0, 0, 0, 0xc2cbd1, 1, group);
    const geometry = new T.PlaneGeometry(p.width, p.height, nx - 1, ny - 1); geometry.rotateX(Math.PI / 2);
    const colors = new Float32Array(nx * ny * 3);
    // Coating surface sits 2 mm above the sheet centre plane; exaggerated height is linear in µm, scale fixed over time.
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, value = z[k]; geometry.attributes.position.setY(k, 2 + exaggeratedHeight(value, max, exaggeration));
      const col = value <= 1e-9 ? new T.Color('#dbe3e8') : new T.Color().setHSL((235 - 235 * colorFraction(value, max, log)) / 360, .83, .48);
      colors.set([col.r, col.g, col.b], k * 3);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3)); geometry.computeVertexNormals(); group.add(new T.Mesh(geometry, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .75 })));
    if (exaggeration > 0) {
      // Closed body: side walls from the sheet surface up to the layer edge, slightly darker.
      const boundary: number[] = [];
      for (let i = 0; i < nx; i++) boundary.push(i);
      for (let j = 1; j < ny; j++) boundary.push(j * nx + nx - 1);
      for (let i = nx - 2; i >= 0; i--) boundary.push((ny - 1) * nx + i);
      for (let j = ny - 2; j > 0; j--) boundary.push(j * nx);
      const pos = geometry.attributes.position, wall: number[] = [], wallColors: number[] = [];
      boundary.forEach((a, n) => {
        const b = boundary[(n + 1) % boundary.length];
        const top = (k: number) => [pos.getX(k), pos.getY(k), pos.getZ(k)], base = (k: number) => [pos.getX(k), 2, pos.getZ(k)];
        wall.push(...top(a), ...base(a), ...top(b), ...top(b), ...base(a), ...base(b));
        for (const k of [a, a, b, b, a, b]) wallColors.push(colors[k * 3] * .78, colors[k * 3 + 1] * .78, colors[k * 3 + 2] * .78);
      });
      const sides = new T.BufferGeometry(); sides.setAttribute('position', new T.Float32BufferAttribute(wall, 3)); sides.setAttribute('color', new T.Float32BufferAttribute(wallColors, 3)); sides.computeVertexNormals();
      group.add(new T.Mesh(sides, new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .8 })));
      // µm axis at the sheet corner, rotating with the sheet; ticks at 0, ½ and full scale.
      const ax = -p.width / 2 - 14, az = p.height / 2 + 14, axis: T.Vector3[] = [new T.Vector3(ax, 2, az), new T.Vector3(ax, 2 + exaggeration, az)];
      for (const f of [0, .5, 1]) {
        const y = 2 + f * exaggeration; axis.push(new T.Vector3(ax, y, az), new T.Vector3(ax - 8, y, az));
        const div = document.createElement('div'); div.className = 'bls-model-label bls-axis-label'; div.textContent = `${fmtUm(max * f)} µm`;
        const tick = new T.Object3D(); tick.position.set(ax - 14, y, az); tick.add(new CSS2DObject(div)); group.add(tick);
      }
      group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(axis), new T.LineBasicMaterial({ color: 0x173748 })));
    }
    if (showCut) {
      // Same grid row/column as cutValues() and the 2D views; sheet-local, so it rotates with the sheet.
      const along = axis === 'x', count = along ? ny : nx, index = Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
      const xAt = (i: number) => -p.width / 2 + i * p.width / (nx - 1), zAt = (j: number) => p.height / 2 - j * p.height / (ny - 1);
      const top = exaggeration > 0 ? exaggeration * 1.05 + 2 : 15;
      const a = along ? new T.Vector3(xAt(0), 2, zAt(index)) : new T.Vector3(xAt(index), 2, zAt(0));
      const b = along ? new T.Vector3(xAt(nx - 1), 2, zAt(index)) : new T.Vector3(xAt(index), 2, zAt(ny - 1));
      const corners = [a, b, b.clone().setY(top), a.clone().setY(top)];
      const planeGeometry = new T.BufferGeometry().setFromPoints(corners); planeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
      const plane = new T.Mesh(planeGeometry, new T.MeshBasicMaterial({ color: 0x673b9e, transparent: true, opacity: .14, side: T.DoubleSide, depthWrite: false }));
      plane.renderOrder = 15; group.add(plane);
      const border = new T.LineLoop(new T.BufferGeometry().setFromPoints(corners), new T.LineBasicMaterial({ color: 0x673b9e, depthTest: false, depthWrite: false }));
      border.renderOrder = 21; group.add(border);
      if (exaggeration > 0) {
        // Profile follows the exaggerated surface exactly (same vertices as the layer mesh).
        const points = along
          ? Array.from({ length: nx }, (_, i) => new T.Vector3(xAt(i), 2.5 + exaggeratedHeight(z[index * nx + i], max, exaggeration), zAt(index)))
          : Array.from({ length: ny }, (_, j) => new T.Vector3(xAt(index), 2.5 + exaggeratedHeight(z[j * nx + index], max, exaggeration), zAt(j)));
        const curve = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x4a1f80, depthTest: false, depthWrite: false }));
        curve.renderOrder = 22; group.add(curve);
      }
      const fixed = along ? (fraction - .5) * p.height : (fraction - .5) * p.width;
      const div = document.createElement('div'); div.className = 'bls-model-label bls-cut-label'; div.textContent = `Schnitt ${along ? 'y' : 'x'} = ${fixed.toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm`;
      const tag = new T.Object3D(); tag.position.copy(a.clone().setY(top + 6)); tag.add(new CSS2DObject(div)); group.add(tag);
    }
    for (const [direction, name, color] of [[new T.Vector3(1,0,0), 'X', 0xb62332], [new T.Vector3(0,0,-1), 'Y', 0x175fa7]] as const) {
      const origin = new T.Vector3(-pose.x, 48, 0); scene.add(new T.ArrowHelper(direction, origin, 90, color, 12, 7));
      const tip=origin.clone().addScaledVector(direction,105); label(name,tip.x,tip.y,tip.z);
    }
    const grid = new T.GridHelper(900, 18, 0x9bacb8, 0xc5cfd6); grid.position.y = -288; scene.add(grid);
    if (focus === 'head') { camera.position.set(170, outlet + 95, (-pose.y) + 300); controls.target.set(0, outlet + 70, (-pose.y)); }
    if (focus === 'panel') { camera.position.set(-500, 440, 640); controls.target.set(-500, 150, 220); }
    if (saved.current?.focus === focus) { camera.position.copy(saved.current.position); controls.target.copy(saved.current.target); }
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; activeRenderer.setSize(w, h); labelRenderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let id = 0;
    function render() {
      for (let i = 0; i < states.length; i++) {
        const s = states[i], lit = s.state === 'on' || s.state === 'blink' && Math.floor((playing ? performance.now() / 1000 : time) * 4) % 2 === 0;
        lampMaterials[i].color.setHex(i < 2 ? lit ? 0x37ff88 : 0x184c36 : lit ? 0xffffff : 0x8b969f);
      }
      controls.update(); activeRenderer.render(scene, camera); labelRenderer.render(scene, camera); id = requestAnimationFrame(render);
    }
    render();
    return () => {
      saved.current = { focus, position: camera.position.clone(), target: controls.target.clone() }; cancelAnimationFrame(id); ro.disconnect(); labelRenderer.domElement.remove();
      scene.traverse(o => { if ((o instanceof T.Mesh || o instanceof T.Line)) { o.geometry.dispose(); const m = o.material; Array.isArray(m) ? m.forEach(x => x.dispose()) : m.dispose(); } });
    };
  }, [p, pose, z, nx, ny, max, log, cabin, transparent, filter, used, time, duration, playing, focus, exaggeration, axis, fraction, showCut]);
  const layerName = dry ? 'Trockenschicht' : 'Nassschicht';
  return <div><div className="toolbar">{[['overall', 'Gesamtansicht'], ['head', 'Spritzkopf & Hörner'], ['panel', 'Bedienpult']].map(([v, l]) => <button className={focus === v ? 'active' : ''} key={v} onClick={() => { saved.current = null; setFocus(v); }}>{l}</button>)}
      <label className="toggle bls-exaggeration">Überhöhung · Höhe bei Skalenmaximum: {exaggeration === 0 ? 'aus (flach)' : `${exaggeration} mm`}<input type="range" min={0} max={100} step={5} value={exaggeration} aria-label="Darstellungshöhe der Schicht am Skalenmaximum in mm" onChange={e => setExaggeration(Number(e.target.value))} /></label></div>
    <div className="bls-scene" ref={host} aria-label="Drehbares Kabinenmodell mit verbundener Aufhängung, Spritze, Luftkappenhörnern und beschrifteten Leuchten" />
    {exaggeration > 0 && max > .01 && <p className="bls-scene-note">{layerName} überhöht: {fmtUm(max)} µm (Skalenmaximum) entsprechen {exaggeration} mm Darstellungshöhe. Die Höhe ist linear in µm, auch bei logarithmischer Farbskala; Farbe und µm-Achse zeigen die Modellwerte. Der Maßstab bleibt über die Zeit konstant, die Schicht wächst also sichtbar mit.{showCut && ' Violett: Schnittebene mit Profil auf der Schichtoberfläche, gleiche Lage wie in Karte und 3D-Profil.'}</p>}</div>;
}
