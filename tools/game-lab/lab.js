// ============================================================================
// Game Lab: the page itself (tools/Game-Lab.html)
// ----------------------------------------------------------------------------
// Builds the side menu from catalog.js, shows the chosen asset on its stage (stages.js), moves the view
// with the mouse (orbit.js), and runs the highlighter panel (marks.js). Each frame: move the animal (if
// it's one), then draw.
// Settings can also go in the address, for screenshots and for reopening a saved view:
//   Game-Lab.html?asset=cat&action=walk&t=2&freeze=1&ui=0&cam=0,0.45,0,2.3,0.3,4
//   asset   an id from catalog.js          action  one of its actions (animals)
//   t       run this many seconds first    freeze  1 = then hold still
//   ui      0 = hide the menu and panel    cam     where the view looks: x,y,z of the target, turn, tilt, distance
//   marks   0 = hide the marks
// ============================================================================

(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const viewEl = $("view");
  const orbit = new LAB.Orbit(viewEl);
  const assets = LAB.catalog;
  let asset = null, stage = null, speed = 1;

  // ---- The side menu ------------------------------------------------------------
  function buildMenu(filter = "") {
    const nav = $("list"); nav.innerHTML = "";
    const groups = {};
    for (const a of assets) if ((a.name + " " + a.about + " " + a.group).toLowerCase().includes(filter.toLowerCase())) (groups[a.group] = groups[a.group] || []).push(a);
    for (const [name, list] of Object.entries(groups)) {
      const h = document.createElement("h2"); h.textContent = name; nav.appendChild(h);
      for (const a of list) {
        const b = document.createElement("button");
        b.className = "item" + (asset === a ? " on" : "");
        b.innerHTML = `<span>${a.name}</span>` + (LAB.marks.has(a.id) ? `<i title="Has marks or notes"></i>` : "");
        b.onclick = () => select(a.id);
        nav.appendChild(b);
      }
    }
  }
  $("search").addEventListener("input", (e) => buildMenu(e.target.value));

  // ---- Choosing an asset ----------------------------------------------------------
  async function select(id) {
    const next = assets.find((a) => a.id === id) || assets[0];
    if (!LAB.stagesReady || !LAB.stagesReady[next.stage]) {           // the game scenes take a moment to build the first time
      $("busy").textContent = { climb: "Building Climb Together…", fly: "Building the whole Fly Together canyon…", studio: "Setting up…" }[next.stage];
      $("busy").hidden = false;
      await new Promise((r) => setTimeout(r, 40));                      // (let the message show first)
      (LAB.stagesReady = LAB.stagesReady || {})[next.stage] = true;
    }
    try { stage = LAB.stages.get(next.stage); }
    catch (err) { $("busy").textContent = "Couldn't build it: " + err.message; console.error(err); return; }
    $("busy").hidden = true;
    asset = next;
    LAB.stages.show(asset.stage);
    LAB.marks.show(asset, stage);
    asset.enter(lab);
    const url = new URL(location.href); url.searchParams.set("asset", asset.id); url.searchParams.delete("cam"); history.replaceState(null, "", url);
    buildMenu($("search").value); buildPanel();
  }

  // ---- The panel on the right ------------------------------------------------------
  function row(label, choices, isOn, choose) {
    const box = document.createElement("div"); box.className = "group";
    if (label) { const h = document.createElement("h3"); h.textContent = label; box.appendChild(h); }
    const r = document.createElement("div"); r.className = "row";
    for (const [key, text] of choices) {
      const b = document.createElement("button"); b.textContent = text; b.className = isOn(key) ? "on" : "";
      b.onclick = () => { choose(key); [...r.children].forEach((x, i) => x.classList.toggle("on", isOn(choices[i][0]))); };
      r.appendChild(b);
    }
    box.appendChild(r); return box;
  }
  function buildPanel() {
    $("title").textContent = asset.name; $("about").textContent = asset.about;
    const c = $("controls"); c.innerHTML = "";
    const f = asset.frontYaw || 0;
    c.appendChild(row("View", [["front", "Front"], ["side", "Side"], ["back", "Back"], ["top", "Top"], ["start", "Start view"]], () => false, (k) => {
      if (k === "start") return asset.enter(lab);
      orbit.set({ front: { yaw: f, pitch: 0.12 }, side: { yaw: f + Math.PI / 2, pitch: 0.12 }, back: { yaw: f + Math.PI, pitch: 0.12 }, top: { yaw: f, pitch: 1.5 } }[k]);
    }));
    for (const ctl of asset.controls || []) c.appendChild(row(ctl.label, ctl.choices, (k) => ctl.get() === k, (k) => ctl.choose(k, lab)));
    if (asset.update) c.appendChild(row("Speed", [["1", "1×"], ["0.5", "½×"], ["0.25", "¼×"], ["0", "Pause"]], (k) => Number(k) === speed, (k) => { speed = Number(k); }));
    buildMarks();
  }

  // The highlighter: tools, brush size, pins with their notes, a general note, and saving.
  function buildMarks() {
    const t = $("tools"); t.innerHTML = "";
    t.appendChild(row(null, [["look", "👀 Look"], ["paint", "🖌 Paint"], ["pin", "📍 Pin"], ["erase", "🧽 Erase"]], (k) => LAB.marks.tool === k, setTool));
    t.appendChild(row("Brush", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], (k) => LAB.marks.brush === k, (k) => LAB.marks.setBrush(k)));
    const d = LAB.marks.current, pins = $("pins"); pins.innerHTML = "";
    for (const p of d.pins) {
      const box = document.createElement("div"); box.className = "pin";
      const on = p.on ? Object.values(p.on).filter((v) => typeof v === "string" || typeof v === "number").join(" · ") : "";
      box.innerHTML = `<b>${p.n}</b><div><small>${on}</small><textarea rows="2" placeholder="What should change here?"></textarea></div><button title="Remove this pin">✕</button>`;
      const ta = box.querySelector("textarea"); ta.value = p.note;
      ta.oninput = () => LAB.marks.setPinNote(p.n, ta.value);
      box.querySelector("button").onclick = () => LAB.marks.removePin(p.n);
      pins.appendChild(box);
    }
    $("note").value = d.note;
    $("hint").textContent = {
      look: "Drag: turn · Scroll: zoom · Right-drag: move · Double-click: look here",
      paint: "Painting: drag over the model · Right-drag: turn · Scroll: zoom · Esc: stop",
      pin: "Pins: click a spot to drop a numbered pin, then write its note on the right · Right-drag: turn",
      erase: "Erasing: drag over paint or pins · Right-drag: turn"
    }[LAB.marks.tool];
  }
  function setTool(k) {
    LAB.marks.setTool(k); orbit.leftTurns = k === "look";
    viewEl.dataset.tool = k; buildMarks();
  }
  $("note").addEventListener("input", (e) => { LAB.marks.setNote(e.target.value); buildMenu($("search").value); });
  $("clear").onclick = () => { if (confirm("Remove all the marks and notes on " + asset.name + "?")) LAB.marks.clear(); };
  LAB.marks.onChange = (newPin) => {
    buildMarks(); buildMenu($("search").value);
    // A new pin: put the typing cursor in its note (a moment later: the click itself would take the focus away again).
    if (newPin) setTimeout(() => { const boxes = $("pins").querySelectorAll("textarea"); const last = boxes[boxes.length - 1]; if (last) last.focus(); }, 60);
  };
  addEventListener("keydown", (e) => { if (e.key === "Escape") { document.activeElement.blur(); setTool("look"); } });

  // Save for Claude: a picture of the view as it is now, with the marks, and the notes file.
  $("save").onclick = async () => {
    $("saved").textContent = "Saving…";
    stage.render(orbit, asset.options ? asset.options() : {});        // (drawn now, and copied straight away)
    const picture = document.createElement("canvas");
    picture.width = stage.canvas.width; picture.height = stage.canvas.height;
    picture.getContext("2d").drawImage(stage.canvas, 0, 0);
    const view = camParam();
    try {
      $("saved").textContent = await LAB.marks.save(picture, { view: { target: [orbit.target.x, orbit.target.y, orbit.target.z].map((v) => +v.toFixed(3)), turn: +orbit.yaw.toFixed(3), tilt: +orbit.pitch.toFixed(3), distance: +orbit.distance.toFixed(3) },
        link: `tools/Game-Lab.html?asset=${asset.id}&cam=${view}` });
    } catch (err) { $("saved").textContent = "Couldn't save: " + err.message; console.error(err); }
  };
  $("folder").onclick = async () => { await LAB.marks.forgetFolder(); $("saved").textContent = "The next save will ask which folder to use."; };
  const camParam = () => [orbit.target.x, orbit.target.y, orbit.target.z, orbit.yaw, orbit.pitch, orbit.distance].map((v) => +v.toFixed(3)).join(",");

  // ---- The mouse over the view: the highlighter's tools (the orbit has the rest) -----------
  viewEl.addEventListener("pointerdown", (e) => { if (e.button === 0 && LAB.marks.tool !== "look" && !e.shiftKey) { viewEl.setPointerCapture(e.pointerId); LAB.marks.pointer("down", e, stage.camera); } });
  viewEl.addEventListener("pointermove", (e) => { if (LAB.marks.tool !== "look") LAB.marks.pointer("move", e, stage.camera); });
  viewEl.addEventListener("pointerup", (e) => { if (e.button === 0 && LAB.marks.tool !== "look") LAB.marks.pointer("up", e, stage.camera); });
  const pointUnder = (e) => { const h = stage && LAB.marks.hitAt(e, stage.camera); return h ? h.point : null; };
  orbit.onDoubleClick = pointUnder;
  orbit.onZoomPoint = pointUnder;

  // ---- Each frame -------------------------------------------------------------------
  let last = performance.now(), frozen = params.get("freeze") === "1";
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (stage && asset) {
      // (an animal holds still while you mark it, so the marks land where you see them)
      if (asset.update && speed > 0 && !frozen && LAB.marks.tool === "look") asset.update(dt * speed, lab);
      stage.render(orbit, asset.options ? asset.options() : {});
    }
    requestAnimationFrame(frame);
  }

  const lab = window.lab = {
    orbit, select, setTool,
    get stage() { return stage; }, get asset() { return asset; },
    // For scripts: put the view exactly somewhere (as in the cam= address setting).
    setCamera: (x, y, z, yaw, pitch, distance) => orbit.set({ target: new THREE.Vector3(x, y, z), yaw, pitch, distance })
  };

  // ---- Start ---------------------------------------------------------------------------
  if (params.get("ui") === "0") document.body.classList.add("bare");
  (async () => {
    await select(params.get("asset") || "chameleon");
    const action = params.get("action"), ctl = (asset.controls || []).find((c) => c.label === "Action");
    if (action && ctl) { ctl.choose(action, lab); buildPanel(); }
    if (params.get("cam")) { const v = params.get("cam").split(",").map(Number); lab.setCamera(...v); }
    if (params.get("marks") === "0") LAB.marks.setVisible(false);
    const ahead = Number(params.get("t") || 0);
    if (asset.update) for (let k = 0; k < ahead * 60; k++) asset.update(1 / 60, lab);
    requestAnimationFrame(frame);
  })();
})();
