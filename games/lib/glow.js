// ============================================================================
// glow.js: a soft glow round the brightest things, and darker corners
// ----------------------------------------------------------------------------
// HG.glow.make(renderer, { from, strength, spread, corners }) for a 3D scene
// (Climb Together since 2.25.0, Fly Together since 2.27.0). Instead of drawing
// straight to the screen, the scene draws into `glow.world`, then calls
// `glow.show()`:
//   const size = renderer.getDrawingBufferSize(new THREE.Vector2());
//   glow.size(size.x, size.y);
//   renderer.setRenderTarget(glow.world); renderer.render(scene, camera);
//   glow.show();
// Settings: from = how bright (0 to 1, as on the screen) something must be to
// glow; strength = how strong the glow is; spread = how far it spreads;
// corners = how much darker the corners are (0 = not at all).
//
// The world picture is finished exactly as it would be on the screen: three.js
// mixes the distant haze in after its final colour step, but only when drawing
// for a screen; marking the picture as a VR headset's picture makes it do the
// same here. One more quirk: drawn into any picture, three.js hands the haze
// (fog) its colour unconverted, so a scene using the glow must convert its fog
// colour to screen colours itself (fog.color.convertLinearToSRGB()) each time
// it sets it. Then: keep only the brightest parts, at a quarter of the size; blur
// them (and again at an eighth, for a wider halo); and lay the blur over the
// picture on its way to the screen, with the darker corners.
// Needs three.js.
// ============================================================================
HG.glow = (function () {
  function make(renderer, settings) {
    const pic = (opts) => new THREE.WebGLRenderTarget(4, 4, Object.assign({ type: THREE.HalfFloatType, depthBuffer: false }, opts));
    const world = pic({ depthBuffer: true, samples: 4, colorSpace: THREE.SRGBColorSpace });   // the world (smoothed edges, like the screen)
    world.isXRRenderTarget = true;                                     // (finish its colours as for a screen: see above)
    const quarter = [pic(), pic()], eighth = [pic(), pic()];             // (each with a spare, for blurring across then down)
    const screen = new THREE.Scene(), flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; screen.add(quad);
    const vertexShader = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    const shader = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
    const bright = shader({ src: { value: null }, from: { value: settings.from } },
      "uniform sampler2D src; uniform float from; varying vec2 vUv;\n" +
      "void main() { vec3 c = texture2D(src, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(from, from + 0.5, l), 1.0); }");
    const blur = shader({ src: { value: null }, step: { value: new THREE.Vector2() } },     // (a 9-point blur, in 5 looks)
      "uniform sampler2D src; uniform vec2 step; varying vec2 vUv;\n" +
      "void main() { vec3 c = texture2D(src, vUv).rgb * 0.227;\n" +
      "  c += (texture2D(src, vUv + step * 1.385).rgb + texture2D(src, vUv - step * 1.385).rgb) * 0.316;\n" +
      "  c += (texture2D(src, vUv + step * 3.231).rgb + texture2D(src, vUv - step * 3.231).rgb) * 0.070;\n" +
      "  gl_FragColor = vec4(c, 1.0); }");
    const finish = shader({ world: { value: world.texture }, near: { value: quarter[0].texture }, far: { value: eighth[1].texture },
      strength: { value: settings.strength }, corners: { value: settings.corners } },
      "uniform sampler2D world, near, far; uniform float strength, corners; varying vec2 vUv;\n" +
      "void main() { vec3 c = texture2D(world, vUv).rgb + strength * (texture2D(near, vUv).rgb + texture2D(far, vUv).rgb);\n" +
      "  vec2 d = vUv - 0.5; c *= 1.0 - corners * smoothstep(0.2, 0.9, dot(d, d) * 2.0);\n" +
      "  gl_FragColor = vec4(c, 1.0); }");                              // (the colours are already finished for the screen)
    finish.toneMapped = false;
    const pass = (material, out) => { quad.material = material; renderer.setRenderTarget(out); renderer.render(screen, flat); };
    const q = new THREE.Vector2(), e = new THREE.Vector2();
    const blurInto = (from, spare, size) => {                          // across into the spare, then down back into `from`
      blur.uniforms.src.value = from.texture; blur.uniforms.step.value.set(settings.spread / size.x, 0); pass(blur, spare);
      blur.uniforms.src.value = spare.texture; blur.uniforms.step.value.set(0, settings.spread / size.y); pass(blur, from);
    };
    return {
      world,
      size(w, h) {                                                     // (match the screen's drawing size)
        if (world.width === w && world.height === h) return;
        world.setSize(w, h);
        for (const t of quarter) t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
        for (const t of eighth) t.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
      },
      show() {                                                         // after the world has been drawn into `world`
        q.set(quarter[0].width, quarter[0].height); e.set(eighth[0].width, eighth[0].height);
        bright.uniforms.src.value = world.texture; pass(bright, quarter[0]);
        blurInto(quarter[0], quarter[1], q);
        blur.uniforms.src.value = quarter[0].texture; blur.uniforms.step.value.set(settings.spread / q.x, 0); pass(blur, eighth[1]);
        blurInto(eighth[1], eighth[0], e); blurInto(eighth[1], eighth[0], e);
        pass(finish, null);
      }
    };
  }
  return { make };
})();
