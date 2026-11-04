// ============================================================================
// games/lib/photo-finish.js: the end-of-round photo
// ----------------------------------------------------------------------------
// When a round ends, the last frame freezes, zooms in on the players, then pulls
// back to reveal it as a Polaroid photo on the right of the results screen,
// while the game's own words fade in on the left. Used by Fly Together; any
// game that draws into canvases can use it:
//   in end():          photo = HG.photoFinish.take([canvas, ...], viewEl, focus)
//   in showResults():  HG.photoFinish.show(el, photo, wordsHtml, timing)
// focus is the part of the view to zoom in on, in screen pixels from the view's
// top-left: { x, y, w, h }. The timing numbers live in the game's Tuning block.
// ============================================================================
HG.photoFinish = (function () {
  // The Polaroid's shape, as shares of its width.
  const WINDOW_ASPECT = 1.35;        // the photo inside is this much wider than tall
  const SIDE_BORDER = 0.045;         // white border on the top and sides...
  const BOTTOM_BORDER = 0.15;        // ...and the deeper one along the bottom
  const PULL_BACK_CROP = 1.5;        // the final photo shows this much more around the players than the close-up

  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let showing = 0;                   // which results screen is current, so an old animation stops

  // The styles, added to the page once.
  const css = document.createElement("style");
  css.textContent = `
    .pf-words { position: absolute; left: 0; top: 0; bottom: 0; width: 50%; display: flex; flex-direction: column;
                justify-content: center; gap: 2.2vh; padding-left: 1vw; text-transform: uppercase; font-weight: 800; }
    .pf-words > * { margin: 0; opacity: 0; transform: translateY(1.2rem); transition: opacity .6s ease, transform .6s ease; }
    .pf-words.show > * { opacity: 1; transform: none; }
    .pf-photo { position: fixed; background: #fff; box-sizing: border-box; transform-origin: 50% 50%; z-index: 2;
                will-change: transform; }
    .pf-window { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
    .pf-window canvas { position: absolute; display: block; }
  `;
  document.head.appendChild(css);

  // Copy the view's layers (the 3D picture, then any effects drawn on top) into one picture.
  function take(layers, viewEl, focus) {
    const out = document.createElement("canvas");
    out.width = layers[0].width; out.height = layers[0].height;
    const g = out.getContext("2d");
    for (const layer of layers) if (layer.width && layer.height) g.drawImage(layer, 0, 0, out.width, out.height);
    const r = viewEl.getBoundingClientRect();
    return { canvas: out, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, focus };
  }

  // Run the animation inside el (the results area). timing: { freeze, zoomIn, hold, pullBack, maxZoom, tilt }.
  function show(el, photo, wordsHtml, timing) {
    const me = ++showing;
    el.innerHTML = '<div class="pf-words">' + wordsHtml + '</div><div class="pf-photo"><div class="pf-window"></div></div>';
    const words = el.querySelector(".pf-words"), frame = el.querySelector(".pf-photo"), win = el.querySelector(".pf-window");
    [...words.children].forEach((line, i) => { line.style.transitionDelay = (i * 0.22) + "s"; });
    const pic = photo.canvas;
    win.appendChild(pic);

    // Where it starts (exactly over the frozen game view) and where it ends (the right half, tilted).
    const view = photo.rect, area = el.getBoundingClientRect();
    const outerH = (1 - 2 * SIDE_BORDER) / WINDOW_ASPECT + SIDE_BORDER + BOTTOM_BORDER;   // height as a share of width
    const endW = Math.min(area.width * 0.46, area.height * 0.94 / outerH);
    const end = { cx: area.left + area.width * 0.74, cy: area.top + area.height / 2, w: endW, h: endW * outerH };

    // What part of the picture to show: a centre point and a height (in view pixels).
    const aspect = view.width / view.height, f = photo.focus;
    const zoomH = clamp(Math.max(f.h, f.w / aspect), view.height / timing.maxZoom, view.height);
    const close = { x: f.x + f.w / 2, y: f.y + f.h / 2, h: zoomH };
    const whole = { x: view.width / 2, y: view.height / 2, h: view.height };
    const last = { x: close.x, y: close.y, h: Math.min(view.height, zoomH * PULL_BACK_CROP) };

    const t1 = timing.freeze, t2 = t1 + timing.zoomIn, t3 = t2 + timing.hold, t4 = t3 + timing.pullBack;
    const started = performance.now();

    function draw() {
      if (me !== showing || el.closest("[hidden]") || !el.isConnected) return;   // a new round started, or the screen changed
      const t = (performance.now() - started) / 1000;
      const zoom = smooth(clamp((t - t1) / timing.zoomIn, 0, 1));
      const back = smooth(clamp((t - t3) / timing.pullBack, 0, 1));
      // The frame: from the game view to the Polaroid's place, with its white border growing in.
      const w = lerp(view.width, end.w, back), h = lerp(view.height, end.h, back);
      const cx = lerp(view.left + view.width / 2, end.cx, back), cy = lerp(view.top + view.height / 2, end.cy, back);
      const side = SIDE_BORDER * end.w * back, bottom = BOTTOM_BORDER * end.w * back;
      Object.assign(frame.style, {
        left: (cx - w / 2) + "px", top: (cy - h / 2) + "px", width: w + "px", height: h + "px",
        padding: side + "px " + side + "px " + bottom + "px",
        transform: "rotate(" + (timing.tilt * back) + "deg)",
        borderRadius: lerp(22, 3, back) + "px",
        boxShadow: "0 " + (14 * back) + "px " + (40 * back) + "px rgba(40,25,10," + (0.28 * back) + ")"
      });
      win.style.borderRadius = lerp(22, 1, back) + "px";
      // The picture inside: zoom in on the players, then ease back out a little as it becomes a photo.
      const [from, aim, step] = t < t3 ? [whole, close, zoom] : [close, last, back];
      const crop = { x: lerp(from.x, aim.x, step), y: lerp(from.y, aim.y, step), h: lerp(from.h, aim.h, step) };
      const winW = w - 2 * side, winH = h - side - bottom;
      let ch = crop.h, cw = ch * winW / winH;
      if (cw > view.width) { cw = view.width; ch = cw * winH / winW; }      // never show past the picture's edges
      const left = clamp(crop.x - cw / 2, 0, view.width - cw), top = clamp(crop.y - ch / 2, 0, view.height - ch);
      const scale = winW / cw;
      Object.assign(pic.style, {
        width: view.width * scale + "px", height: view.height * scale + "px",
        left: -left * scale + "px", top: -top * scale + "px"
      });
      if (t >= t4 - 0.25) words.classList.add("show");
      if (t < t4 + 0.1) requestAnimationFrame(draw);
    }
    draw();
  }

  return { take, show };
})();
