// ============================================================================
// Game Lab: moving the view with the mouse (tools/Game-Lab.html)
// ----------------------------------------------------------------------------
// The camera circles a point it looks at (the "target"):
//   drag            turn around it        (in a marking tool: drag with the right button)
//   scroll          zoom in and out, toward whatever is under the mouse
//   right-drag, or shift + drag     slide the view sideways and up/down
//   double-click    look at the spot you clicked (handy in the big levels)
//   W A S D, Q E    slide the view; arrow keys turn it
// three.js has its own version of this (OrbitControls), but it's a module, and modules
// can't be loaded from a plain folder (file:///), so this is a small one written for the lab.
// ============================================================================

window.LAB = window.LAB || {};

LAB.Orbit = class {
  constructor(element) {
    this.element = element;
    this.target = new THREE.Vector3();
    this.yaw = 0;          // turned around the target: 0 = looking from the front (+z), toward -z
    this.pitch = 0.2;      // looking down from above (radians; 0 = level)
    this.distance = 3;     // metres from the target
    this.minDistance = 0.05; this.maxDistance = 6000;
    this.leftTurns = true; // false while a marking tool is using the left button
    this.onDoubleClick = null;   // set by the lab: (event) => a point to look at, or null
    this.onZoomPoint = null;     // set by the lab: (event) => the point under the mouse, or null
    this.changed = true;
    this.listen();
  }

  // Where the camera is, from the target, the turn and the distance.
  position(out = new THREE.Vector3()) {
    const c = Math.cos(this.pitch);
    return out.set(this.target.x + Math.sin(this.yaw) * c * this.distance, this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * c * this.distance);
  }

  // Put a three.js camera where the orbit says (and set how near and far it sees, to suit the distance).
  apply(camera) {
    this.position(camera.position); camera.up.set(0, 1, 0); camera.lookAt(this.target);
    camera.near = Math.max(0.005, this.distance * 0.01); camera.far = Math.max(100, this.distance * 60);
    camera.updateProjectionMatrix();
  }

  set({ target, yaw, pitch, distance }) {
    if (target) this.target.copy(target);
    if (yaw != null) this.yaw = yaw;
    if (pitch != null) this.pitch = pitch;
    if (distance != null) this.distance = distance;
    this.changed = true;
  }

  // Look at a box (THREE.Box3) from a direction, far enough back to see all of it.
  frameBox(box, yaw = this.yaw, pitch = this.pitch, fov = 40) {
    const size = box.getSize(new THREE.Vector3()), radius = size.length() / 2;
    this.set({ target: box.getCenter(new THREE.Vector3()), yaw, pitch, distance: radius / Math.sin(fov / 2 * Math.PI / 180) * 0.75 });
  }

  // Slide the view sideways (right) and up, in metres, as seen on screen.
  slide(right, up) {
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lift = new THREE.Vector3(-Math.sin(this.pitch) * Math.sin(this.yaw), Math.cos(this.pitch), -Math.sin(this.pitch) * Math.cos(this.yaw));
    this.target.addScaledVector(side, right).addScaledVector(lift, up);
    this.changed = true;
  }

  listen() {
    const el = this.element;
    let drag = null;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      const slide = e.button === 1 || e.button === 2 && e.shiftKey || e.button === 0 && e.shiftKey;
      const turn = !slide && (e.button === 2 || e.button === 0 && this.leftTurns);
      if (!slide && !turn) return;
      drag = { x: e.clientX, y: e.clientY, slide };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.slide) {
        const perPixel = this.distance * 1.1 / el.clientHeight;      // metres the view moves per pixel dragged
        this.slide(-dx * perPixel, dy * perPixel);
      } else {
        this.yaw -= dx * 0.008;
        this.pitch = Math.max(-1.5, Math.min(1.55, this.pitch + dy * 0.006));
        this.changed = true;
      }
    });
    el.addEventListener("pointerup", () => (drag = null));
    el.addEventListener("pointercancel", () => (drag = null));
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const k = Math.pow(1.0015, e.deltaY);                            // smooth on touchpads, steps on mouse wheels
      const before = this.distance;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * k));
      // Zooming in moves toward whatever is under the mouse (so you can dive into one spot of a big level).
      const point = k < 1 && this.onZoomPoint ? this.onZoomPoint(e) : null;
      if (point) this.target.lerp(point, 1 - this.distance / before);
      this.changed = true;
    }, { passive: false });
    el.addEventListener("dblclick", (e) => {
      const point = this.onDoubleClick && this.onDoubleClick(e);
      if (point) { this.target.copy(point); this.distance = Math.min(this.distance, Math.max(0.3, this.distance * 0.6)); this.changed = true; }
    });
    addEventListener("keydown", (e) => {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;   // (not while typing a note)
      const step = this.distance * 0.06, turn = 0.06;
      const keys = {
        a: () => this.slide(-step, 0), d: () => this.slide(step, 0), q: () => this.slide(0, -step), e: () => this.slide(0, step),
        w: () => { this.distance = Math.max(this.minDistance, this.distance * 0.92); }, s: () => { this.distance = Math.min(this.maxDistance, this.distance / 0.92); },
        arrowleft: () => { this.yaw += turn; }, arrowright: () => { this.yaw -= turn; },
        arrowup: () => { this.pitch = Math.min(1.55, this.pitch + turn); }, arrowdown: () => { this.pitch = Math.max(-1.5, this.pitch - turn); }
      };
      const act = keys[e.key.toLowerCase()];
      if (act && !e.ctrlKey && !e.metaKey) { act(); this.changed = true; e.preventDefault(); }
    });
  }
};
