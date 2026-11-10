// ============================================================================
// Game Lab: the 3D highlighter (tools/Game-Lab.html)
// ----------------------------------------------------------------------------
// Mark what you'd like changed, right on the model:
//   Paint   drag over a surface: a bright glow is painted onto it (for "this area")
//   Pin     click a spot: a numbered pin goes there, with its own note (for "this exact spot")
//   Erase   drag over paint or pins to remove them
// Marks are kept per asset (and remembered by the browser between visits). "Save for Claude" saves a
// picture of the view with the marks, and a notes file saying what each mark is on (the part, its
// material, the animal's joint, how far down the canyon...) and exactly where in 3D, into the folder
// you choose (the project's lab-notes folder), or into Downloads.
// ============================================================================

window.LAB = window.LAB || {};

LAB.marks = (function () {
  // ---- Tuning ----
  const PAINT_COLOUR = 0xff2fa8;      // the highlighter's colour (a bright pink that no asset uses)
  const PAINT_OPACITY = 0.6;          // how see-through the paint is (0 = invisible, 1 = solid)
  const PIN_COLOUR = "#ff2fa8";       // the pins' colour
  const PIN_SIZE = 0.05;              // how big pins look, as a share of the view's height
  const BRUSH_SIZES = { small: 0.006, medium: 0.016, large: 0.04 };   // brush radius, as a share of the distance to the spot
  const STORAGE_KEY = "game-lab-marks";

  const raycaster = new THREE.Raycaster();
  raycaster.layers.enableAll();                                      // (the animals are on layer 1 in Climb Together)
  const all = load();                                                 // { assetId: { paint: [...], pins: [...], note } }
  let asset = null, stage = null, group = null, dots = null, pinsGroup = null;
  const discGeo = new THREE.CircleGeometry(1, 18);
  const paintMat = new THREE.MeshBasicMaterial({ color: PAINT_COLOUR, transparent: true, opacity: PAINT_OPACITY, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const dotMat = new THREE.MeshBasicMaterial({ color: PAINT_COLOUR, toneMapped: false, fog: false });

  function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; } }
  function store() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { /* private window: kept for this visit only */ } }
  const data = () => (all[asset.id] = all[asset.id] || { paint: [], pins: [], note: "" });

  // ---- Showing the marks -------------------------------------------------------------
  // The marks live in the stage's own scene, in a group of their own, rebuilt when the asset changes.
  function show(newAsset, newStage) {
    if (group && group.parent) group.parent.remove(group);
    asset = newAsset; stage = newStage;
    group = new THREE.Group(); group.name = "lab marks"; group.renderOrder = 10;
    stage.scene.add(group);
    pinsGroup = new THREE.Group(); group.add(pinsGroup);
    rebuildPaint(); rebuildPins();
  }

  // All the paint is one shape drawn many times (one round dot per brush dab, flat on the surface).
  function rebuildPaint() {
    if (dots) { group.remove(dots); dots.dispose(); }
    const list = data().paint, room = Math.max(256, 2 ** Math.ceil(Math.log2(list.length + 1)));
    dots = new THREE.InstancedMesh(discGeo, paintMat, room); dots.count = 0; dots.frustumCulled = false;
    group.add(dots);
    for (const d of list) placeDot(d);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  function placeDot(d) {
    if (dots.count >= dots.instanceMatrix.count) return rebuildPaint();
    const n = new THREE.Vector3(...d.n), p = new THREE.Vector3(...d.p).addScaledVector(n, d.r * 0.05);
    q.setFromUnitVectors(zAxis, n);
    dots.setMatrixAt(dots.count++, m4.compose(p, q, new THREE.Vector3(d.r, d.r, d.r)));
    dots.instanceMatrix.needsUpdate = true;
  }

  // A pin: a numbered tag standing on the spot (always drawn on top, so it's never hidden), and a small dot.
  function pinTexture(n) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 88;
    const g = c.getContext("2d");
    g.fillStyle = PIN_COLOUR; g.strokeStyle = "#fff"; g.lineWidth = 5;
    g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(20, 54); g.lineTo(32, 86); g.lineTo(44, 54); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 32px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(n), 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function rebuildPins() {
    for (const o of [...pinsGroup.children]) { pinsGroup.remove(o); if (o.material.map) o.material.map.dispose(); }
    for (const pin of data().pins) {
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(pin.n), depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }));
      tag.center.set(0.5, 0); tag.scale.set(PIN_SIZE * 64 / 88, PIN_SIZE, 1); tag.position.set(...pin.p); tag.renderOrder = 1000;
      pinsGroup.add(tag);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), dotMat);
      dot.position.set(...pin.p); dot.scale.setScalar(pin.r || 0.01); pinsGroup.add(dot);
    }
  }

  // ---- Finding what's under the mouse ------------------------------------------------
  const isShown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  function hitAt(event, camera) {
    const rect = event.target.getBoundingClientRect();
    raycaster.setFromCamera({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: -(event.clientY - rect.top) / rect.height * 2 + 1 }, camera);
    const hits = raycaster.intersectObjects(stage.pickable(), true).filter((h) => isShown(h.object) && h.object.isMesh && !h.object.isSprite && h.face);
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(raycaster.ray.direction) > 0) n.negate();               // (always facing the camera)
    return { point: h.point, normal: n, object: h.object, instanceId: h.instanceId, distance: h.distance };
  }

  // What a spot is on, in words, for the notes file.
  function whatIsAt(hit) {
    const what = {}, o = hit.object;
    for (let p = o; p; p = p.parent) if (p.userData.part) { what.part = p.userData.part; break; }
    const mats = [].concat(o.material || []).map((m) => m.name).filter(Boolean);
    if (mats.length) what.material = mats.join(", ");
    if (o.name) what.object = o.name;
    if (o.geometry && o.geometry.name) what.shape = o.geometry.name;
    if (hit.instanceId != null) what.copy = "copy " + hit.instanceId + " of a shape drawn many times";
    if (o.isSkinnedMesh && o.skeleton) {                               // an animal: the nearest joint
      let best = null, d = Infinity;
      const p = new THREE.Vector3();
      for (const bone of o.skeleton.bones) { bone.getWorldPosition(p); const k = p.distanceTo(hit.point); if (k < d) { d = k; best = bone; } }
      if (best) what.joint = best.name || "(unnamed joint)";
    }
    if (asset.describe) Object.assign(what, asset.describe(hit.point));
    return what;
  }

  // ---- The tools ------------------------------------------------------------------------
  let tool = "look", brush = "medium", painting = false, lastDab = null, changed = false, onChange = () => {};
  function setTool(t) { tool = t; }
  function setBrush(b) { brush = b; }

  // Called by the lab for left-button presses and drags over the view (when a tool is chosen).
  function pointer(type, event, camera) {
    if (tool === "look") return;
    if (type === "down") painting = true;
    // (only redraw the panel when a stroke changed something: a new pin's note box must keep the typing focus)
    if (type === "up") { painting = false; lastDab = null; if (changed) { changed = false; store(); onChange(); } return; }
    if (!painting) return;
    const hit = hitAt(event, camera);
    if (!hit) return;
    const r = hit.distance * BRUSH_SIZES[brush];
    if (tool === "paint") {
      if (lastDab && lastDab.distanceTo(hit.point) < r * 0.45) return;   // (dabs a little apart, so a stroke stays smooth but light)
      lastDab = hit.point.clone();
      const d = { p: round(hit.point), n: round(hit.normal, 3), r: +r.toFixed(4), on: whatIsAt(hit) };
      data().paint.push(d); placeDot(d); changed = true;
    } else if (tool === "pin" && type === "down") {
      const list = data().pins, n = list.reduce((m, p) => Math.max(m, p.n), 0) + 1;
      list.push({ n, p: round(hit.point), r: +(hit.distance * 0.004).toFixed(4), note: "", on: whatIsAt(hit) });
      rebuildPins(); painting = false; store(); onChange(n);
    } else if (tool === "erase") {
      const d = data(), before = d.paint.length + d.pins.length, near = (p) => hit.point.distanceTo(new THREE.Vector3(...p)) < r * 1.5;
      d.paint = d.paint.filter((x) => !near(x.p)); d.pins = d.pins.filter((x) => !near(x.p));
      if (d.paint.length + d.pins.length !== before) { rebuildPaint(); rebuildPins(); changed = true; }
    }
  }
  const round = (v, places = 4) => [v.x, v.y, v.z].map((x) => +x.toFixed(places));

  // ---- Saving for Claude ---------------------------------------------------------------
  // A picture of the view (with the marks) and a notes file, into the chosen folder (remembered), or Downloads.
  async function save(picture, extra) {
    const d = data(), stamp = new Date(), pad = (n) => String(n).padStart(2, "0");
    const name = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}_${asset.id}`;
    const notes = {
      what: "Notes left in tools/Game-Lab.html for Claude (or anyone working on the game).",
      asset: asset.id, assetName: asset.name, savedAt: stamp.toISOString(),
      picture: name + ".png",
      note: d.note,
      pins: d.pins.map((p) => ({ number: p.n, note: p.note, on: p.on, at: p.p })),
      paint: d.paint.length ? {
        dabs: d.paint.length,
        covers: summarise(d.paint),                                   // what the paint is on, in words, and how many dabs
        box: boxOf(d.paint),
        dabsAt: d.paint.map((x) => x.p)
      } : null,
      view: extra.view,
      reopen: extra.link,
      howToRead: "Points are [x, y, z] in metres in the game's own 3D space (y is up). Each pin's and paint area's 'on' says what it touches. Open 'reopen' (relative to the project folder) to see the same view; the marks are remembered in that browser."
    };
    const json = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const png = await new Promise((done) => picture.toBlob(done, "image/png"));
    return writeFiles([[name + ".json", json], [name + ".png", png]]);
  }
  // Paint dabs, grouped by what they're on.
  function summarise(paint) {
    const groups = {};
    for (const dab of paint) { const key = JSON.stringify(dab.on || {}); (groups[key] = groups[key] || { on: dab.on || {}, dabs: 0 }).dabs++; }
    return Object.values(groups).sort((a, b) => b.dabs - a.dabs);
  }
  function boxOf(paint) {
    const b = new THREE.Box3();
    for (const d of paint) b.expandByPoint(new THREE.Vector3(...d.p));
    return { from: round(b.min, 3), to: round(b.max, 3), middle: round(b.getCenter(new THREE.Vector3()), 3) };
  }

  // The folder to save into: picked once (the project's lab-notes folder is best), remembered by the browser.
  // Browsers can't write into a folder without asking, so the first save asks; if that's not possible, Downloads.
  async function folder() {
    if (!window.showDirectoryPicker) return null;
    let handle = await remembered();
    if (handle && (await handle.queryPermission({ mode: "readwrite" })) !== "granted" && (await handle.requestPermission({ mode: "readwrite" })) !== "granted") handle = null;
    if (!handle) {
      try { handle = await showDirectoryPicker({ id: "game-lab-notes", mode: "readwrite", startIn: "documents" }); }
      catch (e) { return null; }                                       // (they closed the picker: use Downloads)
      remember(handle);
    }
    return handle;
  }
  async function writeFiles(files) {
    const dir = await folder().catch(() => null);
    if (dir) {
      for (const [name, blob] of files) { const f = await dir.getFileHandle(name, { create: true }); const w = await f.createWritable(); await w.write(blob); await w.close(); }
      return "Saved into the folder “" + dir.name + "”: " + files.map((f) => f[0]).join(" and ");
    }
    for (const [name, blob] of files) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    return "Saved to Downloads: " + files.map((f) => f[0]).join(" and ");
  }
  // (The chosen folder is kept in the browser's own small database, so it's only asked for once.)
  function db() { return new Promise((ok, fail) => { const r = indexedDB.open("game-lab", 1); r.onupgradeneeded = () => r.result.createObjectStore("handles"); r.onsuccess = () => ok(r.result); r.onerror = fail; }); }
  async function remembered() { try { const d = await db(); return await new Promise((ok) => { const r = d.transaction("handles").objectStore("handles").get("notes"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } }
  async function remember(h) { try { const d = await db(); d.transaction("handles", "readwrite").objectStore("handles").put(h, "notes"); } catch (e) { /* asked again next time */ } }
  async function forgetFolder() { try { const d = await db(); d.transaction("handles", "readwrite").objectStore("handles").delete("notes"); } catch (e) { /* nothing kept */ } }

  return {
    show, pointer, setTool, setBrush, save, forgetFolder, hitAt,
    get tool() { return tool; }, get brush() { return brush; },
    set onChange(f) { onChange = f; },
    get current() { return data(); },
    has: (id) => { const d = all[id]; return !!d && (d.paint.length || d.pins.length || d.note); },
    setNote(text) { data().note = text; store(); },
    setPinNote(n, text) { const p = data().pins.find((x) => x.n === n); if (p) { p.note = text; store(); } },
    removePin(n) { const d = data(); d.pins = d.pins.filter((x) => x.n !== n); rebuildPins(); store(); onChange(); },
    clear() { const d = data(); d.paint = []; d.pins = []; d.note = ""; rebuildPaint(); rebuildPins(); store(); onChange(); },
    setVisible(v) { if (group) group.visible = v; }
  };
})();
