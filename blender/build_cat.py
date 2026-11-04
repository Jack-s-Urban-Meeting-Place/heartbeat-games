"""
blender/build_cat.py: builds the Heartbeat Games cat (version 2) in Blender.

The cat's skeleton and movement live in games/lib/cat.js. This script builds its *look* on
that skeleton, following the references and the designer's choices in
storyboards/cat-model/README.md: a fluffy-faced grey tabby (tufty cheeks and a pale chest bib,
as in the Cat_walking storyboard), with painted fur: a dark stripe down the spine, narrow
stripes down the sides, bars on the legs, rings down the tail to a dark tip, an "M" on the
forehead and dark lines from the eyes; a pale muzzle, chin and belly. Big yellow-green eyes
with slit pupils and lids that close into a squint; ears with pink insides; a jaw that opens
to show four fangs when it hisses.

Every part is placed from blender/cat-skeleton.json (written by tools/cat-skeleton.cjs) and
carries vertex groups named after the joints it moves with. blender/export_cat.py then writes
games/lib/cat-model.js for the games.

Run it in Blender (Scripting workspace, or through the Blender MCP connector):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/build_cat.py").read())
It works in a scene called "Cat" and only replaces its own "Cat v2" collection, so it's safe
to run again after changing a number below.

Coordinates: the numbers below are in the game's space (three.js: y up, the cat facing -z),
mostly measured from a joint. Size: 1 unit = from the cat's chest to its hips, as in cat.js.
"""
import bpy, math, os
import numpy as np
from mathutils import Matrix, Vector

PROJECT = globals().get("PROJECT") or os.path.dirname(os.path.dirname(os.path.abspath(bpy.data.filepath)))
HERE = os.path.join(PROJECT, "blender")
TEXTURES = os.path.join(HERE, "textures")
exec(open(os.path.join(HERE, "model_kit.py")).read(), globals())
SK = load_skeleton(os.path.join(HERE, "cat-skeleton.json"))

# ---- Tuning: the shape -----------------------------------------------------------------------
# The torso, hips to chest, from the body joint: (z, half width, half height, centre height).
TORSO = [
    (0.62, 0.060, 0.060, 0.04),
    (0.55, 0.140, 0.160, 0.01),
    (0.42, 0.175, 0.205, -0.005),   # hips and haunches
    (0.22, 0.165, 0.195, -0.02),
    (0.02, 0.155, 0.185, -0.03),    # waist
    (-0.18, 0.165, 0.200, -0.02),
    (-0.36, 0.185, 0.225, 0.00),    # shoulders and chest
    (-0.50, 0.165, 0.215, 0.03),
    (-0.58, 0.125, 0.165, 0.07),    # base of the neck
]
# The head, back to nose, from the head joint: (z, half width, half height, centre height, cheekiness).
HEAD = [
    (0.13, 0.090, 0.090, 0.03, 0.0),
    (0.07, 0.165, 0.150, 0.01, 0.3),
    (0.01, 0.200, 0.165, 0.00, 1.0),   # fluffy cheeks, widest
    (-0.05, 0.188, 0.157, -0.005, 1.0),
    (-0.10, 0.168, 0.142, -0.01, 0.6),
    (-0.14, 0.142, 0.122, -0.015, 0.25),   # the face: fairly flat, with the eyes set into it
    (-0.163, 0.100, 0.088, -0.035, 0.0),
    (-0.185, 0.064, 0.060, -0.045, 0.0),   # the short bridge of the nose
    (-0.203, 0.034, 0.034, -0.042, 0.0),
]
WHISKER_PADS = ((0.031, -0.072, -0.188), (0.036, 0.029, 0.03))   # the two round pads under the nose: centre (x mirrored), size
BROWS = ((0.074, 0.068, -0.135), (0.05, 0.018, 0.034))            # a soft ridge above each eye: centre (x mirrored), size
CHEEK_TUFTS = 13                       # fluffy tufts round each cheek (the storyboard's zigzag cheeks)
TAIL_RADIUS = (0.062, 0.048)           # the tail's thickness at its base and toward the tip (fluffy, a little thick)
EYE_RADII = (0.043, 0.037, 0.031)      # the eyes: across, up, deep
# Colours (sRGB 0..1)
GREY = np.array([0.57, 0.55, 0.52]); STRIPE = np.array([0.3, 0.28, 0.26]); CREAM = np.array([0.9, 0.85, 0.76])
# -------------------------------------------------------------------------------------------------

start("Cat", "Cat v2")
body_f, neck_f, head_f, jaw_f = frame("body"), frame("neck"), frame("head"), frame("jaw")

# ---- Skin pictures: the tabby pattern, painted in code ----
def colourise(value_mix, base, other):
    """Mixes two colours by a 0..1 amount per pixel."""
    return base[None, None, :] * (1 - value_mix[..., None]) + other[None, None, :] * value_mix[..., None]

def body_picture():
    w, h = 384, 192
    U, V = grid(w, h)                                   # u round the body (0 belly, 0.5 the spine), v hips (0) to chest (1)
    across = np.abs(U - 0.5)                            # 0 on the spine, 0.5 on the belly
    wob = noise(w, h, 8, 6, 11) * 2 - 1
    bands = np.sin(2 * np.pi * (V * 10 + 0.1 * wob + 0.05 * np.sin(U * 25)))
    broken = np.clip((noise(w, h, 24, 14, 21) - 0.3) / 0.25, 0, 1)                                  # mackerel stripes break up a little
    stripes = np.clip((bands - 0.55) / 0.25, 0, 1) * np.clip(1 - (across - 0.06) / 0.26, 0, 1) * broken   # down the sides, fading below
    spine = np.clip(1 - (across - 0.02) / 0.03, 0, 1) * np.clip(V / 0.05, 0, 1) * np.clip((1 - V) / 0.08, 0, 1)
    dark = np.clip(np.maximum(stripes, spine), 0, 1)
    pale = np.clip((across - 0.36) / 0.08, 0, 1)                                                   # cream belly
    pale = np.maximum(pale, np.clip((V - 0.82) / 0.08, 0, 1) * np.clip((across - 0.22) / 0.08, 0, 1))  # and chest
    col = colourise(dark * 0.7, GREY, STRIPE)
    col = col * (1 - pale[..., None]) + CREAM[None, None, :] * pale[..., None]
    streak = fur_streaks(w, h, 90, 40, 12)
    return np.clip(col * (0.97 + 0.05 * streak[..., None]), 0, 1)

def head_picture():
    w, h = 192, 192
    U, V = grid(w, h)                                   # u round the head (0 under the chin, 0.5 the top), v back (0) to nose (1)
    across = np.abs(U - 0.5)
    m = (np.cos(2 * np.pi * (U - 0.5) * 30) > 0.55) * (across < 0.11) * (V > 0.45) * (V < 0.8)       # the "M" lines on the forehead
    cheek = np.zeros_like(U)
    for c in (0.29, 0.71):                                                                          # lines from the eyes back across the cheeks
        cheek = np.maximum(cheek, np.clip(1 - np.abs((U - c) - (V - 0.7) * 0.25) / 0.012, 0, 1) * (V > 0.55) * (V < 0.78))
    back = (np.sin(2 * np.pi * V * 7) > 0.5) * np.clip(1 - across / 0.2, 0, 1) * (V < 0.45)        # stripes over the back of the head
    dark = np.clip(np.maximum(np.maximum(m * 1.0, cheek), back * 0.8), 0, 1)
    muzzle = np.clip((V - 0.76) / 0.05, 0, 1) * np.clip((across - 0.05) / 0.05, 0, 1)               # pale muzzle (but a grey bridge to the nose)
    chin = np.clip((across - 0.36) / 0.06, 0, 1) * np.clip((V - 0.3) / 0.1, 0, 1)                   # pale chin and throat
    pale = np.maximum(muzzle, chin)
    col = colourise(dark * 0.8, GREY, STRIPE)
    col = col * (1 - pale[..., None]) + CREAM[None, None, :] * pale[..., None]
    streak = fur_streaks(w, h, 60, 40, 13)
    return np.clip(col * (0.97 + 0.05 * streak[..., None]), 0, 1)

def tail_picture():
    w, h = 48, 320
    U, V = grid(w, h)
    rings = np.clip((np.sin(2 * np.pi * (V * 7.5 - 0.2)) - 0.2) / 0.35, 0, 1)
    tip = np.clip((V - 0.86) / 0.05, 0, 1)
    dark = np.maximum(rings * 0.7, tip)
    col = colourise(dark, GREY, STRIPE)
    streak = fur_streaks(w, h, 14, 120, 14)
    return np.clip(col * (0.97 + 0.05 * streak[..., None]), 0, 1)

def leg_picture():
    w, h = 96, 160
    U, V = grid(w, h)
    bars = np.clip((np.sin(2 * np.pi * V * 4.5) - 0.3) / 0.3, 0, 1) * np.clip((np.sin(2 * np.pi * U) + 0.2) / 0.6, 0, 1)
    col = colourise(bars * 0.55, GREY, STRIPE)
    streak = fur_streaks(w, h, 24, 60, 15)
    return np.clip(col * (0.97 + 0.05 * streak[..., None]), 0, 1)

def tuft_picture():
    w, h = 32, 64
    U, V = grid(w, h)                                   # v from the tuft's root (0) to its tip (1)
    col = colourise(np.clip((V - 0.55) / 0.45, 0, 1) * 0.7, GREY, CREAM)   # the head's grey, only paler at the very tips
    streak = fur_streaks(w, h, 10, 40, 16)
    return np.clip(col * (0.85 + 0.25 * streak[..., None]), 0, 1)

def eye_picture():
    w, h = 128, 128
    U, V = grid(w, h)                                   # v from the front of the eye (0) back (1)
    iris = np.array([0.78, 0.82, 0.22]); edge = np.array([0.42, 0.58, 0.12]); rim = np.array([0.12, 0.12, 0.08])
    t = np.clip(V / 0.42, 0, 1)
    col = colourise(t ** 1.5, iris, edge)
    col *= (0.9 + 0.12 * (0.5 + 0.5 * np.cos(2 * np.pi * U * 36)))[..., None]   # fine streaks in the iris
    col = col * (1 - np.clip((V - 0.4) / 0.05, 0, 1))[..., None] + rim[None, None, :] * np.clip((V - 0.4) / 0.05, 0, 1)[..., None]
    return np.clip(col, 0, 1)

for name, pic in (("cat_body", body_picture), ("cat_head", head_picture), ("cat_tail", tail_picture),
                  ("cat_leg", leg_picture), ("cat_tuft", tuft_picture), ("cat_eye", eye_picture)):
    save_image(TEXTURES, name, pic())
save_image(TEXTURES, "cat_fur_bump", fur_streaks(128, 128, 40, 40, 17))

for key, tex, col in (("body", "cat_body", None), ("head", "cat_head", None), ("tail", "cat_tail", None), ("leg", "cat_leg", None),
                      ("tuft", "cat_tuft", None), ("eye", "cat_eye", None)):
    MATS[key] = material("cat_" + key, tex)
for key, col in (("cream", (0.78, 0.7, 0.56)), ("pink", (0.69, 0.35, 0.35)), ("pupil", (0.01, 0.01, 0.01)), ("mouth", (0.3, 0.03, 0.05)),
                 ("teeth", (0.9, 0.88, 0.8)), ("lid", (0.27, 0.25, 0.23)), ("paw", (0.62, 0.58, 0.52)),
                 ("brow", (0.29, 0.27, 0.24))):                 # (brows and ears: plain grey, the head's colour)
    MATS[key] = material("cat_" + key, None, col)

# ---- Torso: one smooth tube, a little fuller underneath at the chest ----
rows = resample(TORSO, 18)
def torso_ring(row):
    z, w, h, yc = row
    def shape(a):
        s = math.sin(a)
        return w * (1 + 0.06 * max(0.0, -s)), h * (1.0 if s > 0 else 0.95)
    return [tuple(body_f @ Vector(p)) for p in ring_around((0, yc, z), (1, 0, 0), (0, 1, 0), 0, 0, 22, -math.pi / 2, shape)]
def torso_weights(i):
    z = rows[i][0]
    to_neck = smoothstep((-0.44 - z) / 0.14) * 0.7
    to_tail = smoothstep((z - 0.55) / 0.07) * 0.4
    return {"body": 1 - to_neck - to_tail, "neck": to_neck, "tail.0": to_tail}
loft("torso", [torso_ring(r) for r in rows], "body", torso_weights, subdivide=1)

# ---- Neck: from the chest up into the head ----
p0 = body_f @ Vector((0, 0.06, -0.46)); p1 = head_f @ Vector((0, -0.02, 0.06))
d = (p1 - p0).normalized(); side = Vector((1, 0, 0)); out = d.cross(side).normalized()
neck_rings, neck_w = [], []
for k in range(6):
    t = k / 5
    c = p0.lerp(p1, t)
    neck_rings.append(ring_around(tuple(c), tuple(side), tuple(out), lerp(0.135, 0.125, t), lerp(0.15, 0.13, t), 16))
    neck_w.append({"neck": 1 - smoothstep((t - 0.4) / 0.6), "head": smoothstep((t - 0.4) / 0.6)})
loft("neck", neck_rings, "body", lambda i: neck_w[i], subdivide=1)

# ---- Head: round, wide at the fluffy cheeks, narrowing to a short muzzle ----
hrows = resample(HEAD, 14)
def head_ring(row):
    z, w, h, yc, cheek = row
    def shape(a):
        s = math.sin(a)
        wide = 1 + 0.12 * cheek * max(0.0, -s) ** 0.7       # the cheeks puff out low on each side
        return w * wide * (0.92 if s > 0.4 else 1.0), h * (0.9 if s < 0 else 1.0)
    return [tuple(head_f @ Vector(p)) for p in ring_around((0, yc, z), (1, 0, 0), (0, 1, 0), 0, 0, 20, -math.pi / 2, shape)]
loft("head", [head_ring(r) for r in hrows], "head", lambda i: {"head": 1.0}, subdivide=1)

# The muzzle: two round whisker pads under the nose, a pink triangular nose, and soft brows over the eyes.
(px, py, pz), pr = WHISKER_PADS
for sx in (-1, 1):
    loft("pad_%d" % sx, ellipsoid((sx * px, py, pz), pr, head_f, 12, 7), "cream", lambda i: {"head": 1.0}, subdivide=1)
(bx, by, bz), br = BROWS
for sx in (-1, 1):
    loft("brow_%d" % sx, ellipsoid((sx * bx, by, bz), br, head_f, 12, 6), "brow", lambda i: {"head": 1.0}, subdivide=1)
nose_pts = [(-0.027, -0.024, -0.214), (0.027, -0.024, -0.214), (0, -0.054, -0.212),     # the front: a triangle, point down
            (-0.022, -0.02, -0.18), (0.022, -0.02, -0.18), (0, -0.045, -0.185)]          # (and its back, inside the face)
solid("nose", nose_pts, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], head_f, "pink",
      {"head": {v: 1.0 for v in range(6)}}, smooth=False, uvs=[(0.5, 0.5)] * 18)
# The dark inside of the upper mouth (seen when the jaw drops).
loft("mouth_top", ellipsoid((0, -0.088, -0.125), (0.05, 0.018, 0.05), head_f, 10, 6), "mouth", lambda i: {"head": 1.0})
# Upper fangs (hidden by the chin until the jaw opens).
def cone(name, base_c, tip, r, frame_m, mat, group, sides=5):
    base_c, tip = Vector(base_c), Vector(tip)
    d = (tip - base_c).normalized(); s = d.cross(Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))).normalized(); o = d.cross(s)
    pts = [base_c + (s * math.cos(2 * math.pi * k / sides) + o * math.sin(2 * math.pi * k / sides)) * r for k in range(sides)]
    verts = [tuple(frame_m @ p) for p in pts] + [tuple(frame_m @ tip), tuple(frame_m @ base_c)]
    faces = [(k, (k + 1) % sides, sides) for k in range(sides)] + [((k + 1) % sides, k, sides + 1) for k in range(sides)]
    uvs = []
    for f in faces: uvs += [(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)]
    return make_mesh(name, verts, faces, uvs, {group: {i: 1.0 for i in range(len(verts))}}, mat, smooth=False)
for sx in (-1, 1):
    cone("fang_top_%d" % sx, (sx * 0.03, -0.082, -0.17), (sx * 0.029, -0.112, -0.172), 0.008, head_f, "teeth", "head")

# ---- Jaw: chin and lower mouth, with lower fangs ----
loft("chin", ellipsoid((0, -0.004, -0.06), (0.062, 0.028, 0.072), jaw_f, 12, 7), "cream", lambda i: {"jaw": 1.0})
loft("mouth_low", ellipsoid((0, 0.012, -0.07), (0.05, 0.018, 0.058), jaw_f, 10, 6), "mouth", lambda i: {"jaw": 1.0})
for sx in (-1, 1):
    cone("fang_low_%d" % sx, (sx * 0.028, 0.01, -0.145), (sx * 0.027, 0.036, -0.147), 0.007, jaw_f, "teeth", "jaw")

# ---- Fluffy tufts round the cheeks (the storyboard's zigzag cheeks) ----
def tuft(name, root, tip, r, frame_m, group_w, sides=6, flat=0.35):
    """A flat, pointed lick of fur from root to tip (in a joint's frame); the root sits just inside the skin."""
    root, tip = Vector(root), Vector(tip)
    d = (tip - root); length = d.length; d.normalize()
    s = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized(); o = d.cross(s)
    rings = []
    for t, rr in ((0.0, r), (0.4, r * 0.85), (0.75, r * 0.45), (0.95, r * 0.12)):
        c = root + d * (length * t)
        rings.append([tuple(frame_m @ (c + s * math.cos(2 * math.pi * j / sides) * rr + o * math.sin(2 * math.pi * j / sides) * rr * flat)) for j in range(sides)])
    return loft(name, rings, "tuft", lambda i: group_w, close_start=True, close_end=True)
cheek_row = HEAD[2]                                            # the widest part of the head
for sx in (-1, 1):
    for k in range(CHEEK_TUFTS):
        a = -1.05 + 0.95 * k / (CHEEK_TUFTS - 1)                # round the lower side of the face, from the chin up to the cheek
        s = math.sin(a)
        # a point on the cheek's surface (the same shape as head_ring), then the tuft grows from just inside it,
        # poking only a little way out and sweeping back, so it never floats off the face
        sxs = cheek_row[1] * (1 + 0.12 * max(0.0, -s) ** 0.7) * math.cos(a) * 0.93   # (smoothing pulls the surface in a little)
        sys_ = cheek_row[3] + cheek_row[2] * (0.9 if s < 0 else 1.0) * s * 0.93
        root = (sx * sxs * 0.88, sys_ * 0.88, cheek_row[0] - 0.02)
        tip = (sx * sxs * 1.04, sys_ * 1.04 - 0.01, cheek_row[0] + 0.035)
        tuft("cheek_%d_%d" % (sx, k), root, tip, 0.034, head_f, {"head": 1.0}, flat=0.8)
# (The pale bib on the chest is painted on: tufts there looked like a necklace of teeth.)

# ---- Ears: pointed and thin, pink inside ----
for i in (0, 1):
    ef = frame("ear.%d" % i)
    # A broad, thin pyramid whose base runs well down inside the head (y < 0), so the ear always
    # looks rooted, even when it turns flat back.
    pts = [(-0.075, -0.06, 0.03), (0.075, -0.06, 0.03), (0.068, -0.06, -0.026), (-0.068, -0.06, -0.026), (0, 0.16, 0.006)]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)]
    solid("ear_%d" % i, pts, faces, ef, "brow", {"ear.%d" % i: {v: 1.0 for v in range(5)}}, smooth=False,
          uvs=[(0.5, 0.1)] * 16)
    inner = [(-0.048, 0.0, -0.021), (0.048, 0.0, -0.021), (0, 0.128, -0.004)]
    solid("ear_inner_%d" % i, inner, [(0, 1, 2)], ef, "pink", {"ear.%d" % i: {0: 1.0, 1: 1.0, 2: 1.0}}, smooth=False)

# ---- Eyes: almond-shaped, yellow-green, slit pupils; lids that close into a squint ----
for i in (0, 1):
    eyef = frame("eye.%d" % i)
    rings = ellipsoid((0, 0, 0), EYE_RADII, eyef, 16, 8)
    loft("eye_%d" % i, rings, "eye", lambda k, i=i: {"eye.%d" % i: 1.0})
    loft("pupil_%d" % i, ellipsoid((0, 0, -EYE_RADII[2] + 0.002), (0.0065, 0.03, 0.004), eyef, 8, 5), "pupil", lambda k, i=i: {"eye.%d" % i: 1.0})
    for lid in ("lidU", "lidL"):
        lf = frame("%s.%d" % (lid, i)); r = 0.047
        cap = [ring_around((0, r * math.cos(t), 0), (1, 0, 0), (0, 0, 1), r * math.sin(t), r * math.sin(t), 14, 0)
               for t in (0.35, 0.8, 1.2, 1.5708)]
        loft("%s_%d" % (lid, i), [[tuple(lf @ Vector(p)) for p in ring] for ring in cap], "lid", lambda k, n="%s.%d" % (lid, i): {n: 1.0},
             close_start=True, close_end=False)

# ---- Legs: tapering bones (thick haunches at the back), then paws ----
for li, leg in enumerate(SK["legs"]):
    names = ["leg.%d.upper" % li, "leg.%d.lower" % li] + ([] if leg["front"] else ["leg.%d.hock" % li])
    frames = [frame(n) for n in names]
    lens = [leg["a"], leg["b"]] + ([] if leg["front"] else [frames[2].translation.__sub__(frame("leg.%d.paw" % li).translation + Vector((0, 0.01, 0.03))).length])
    radii = ([(0.085, 0.062), (0.056, 0.042)] if leg["front"] else [(0.13, 0.075), (0.066, 0.05), (0.048, 0.04)])
    rings, wts = [], []
    for s, (fr, ln, (r0, r1), nm) in enumerate(zip(frames, lens, radii, names)):
        x_axis, z_axis, y_axis = fr.col[0].to_3d().normalized(), fr.col[2].to_3d().normalized(), fr.col[1].to_3d().normalized()
        last = s == len(names) - 1
        steps = (-0.03 if s == 0 else 0.06, 0.35, 0.7, 1.08 if last else 0.96)   # the last bone runs on into the paw
        for t in steps:
            c = fr.translation + y_axis * (ln * t)
            rr = lerp(r0, r1, min(1.0, max(0.0, t)))
            rings.append(ring_around(tuple(c), tuple(x_axis), tuple(z_axis), rr, rr * 0.92, 12, 0))
            w = {nm: 1.0}
            if t >= 0.96 and s + 1 < len(names): w = {nm: 0.55, names[s + 1]: 0.45}
            if t <= 0.06 and s > 0: w = {nm: 0.7, names[s - 1]: 0.3}
            wts.append(w)
    loft("leg_%d" % li, rings, "leg", lambda k, wts=wts: wts[k], subdivide=1)
    pf = frame("leg.%d.paw" % li)
    loft("paw_%d" % li, ellipsoid((0, 0.021, -0.012), (0.058, 0.04, 0.072), pf, 12, 7), "paw", lambda k, li=li: {"leg.%d.paw" % li: 1.0})

# ---- Tail: thick and fluffy, ringed, with a dark tip ----
tail = [frame("tail.%d" % i) for i in range(14)]
rings, wts = [], []
PER = 2
for i in range(14):
    for s in range(PER):
        if i == 13 and s > 0: break
        fr = tail[i]
        nxt = tail[i + 1].translation if i < 13 else fr.translation + fr.col[1].to_3d() * 0.06
        t = s / PER
        c = fr.translation.lerp(nxt, t)
        k = (i * PER + s) / (13 * PER)
        r = lerp(TAIL_RADIUS[0], TAIL_RADIUS[1], k) * (1 - 0.35 * smoothstep((k - 0.85) / 0.15))
        rings.append(ring_around(tuple(c), tuple(fr.col[0].to_3d().normalized()), tuple(fr.col[2].to_3d().normalized()), r, r, 12, -math.pi / 2))
        w = {"tail.%d" % i: 1 - t}
        if t > 0 and i < 13: w["tail.%d" % (i + 1)] = t
        wts.append(w)
loft("tail", rings, "tail", lambda i: wts[i], close_start=False)

RESULT = {"objects": len(COL.objects), "triangles": sum(len(o.data.polygons) for o in COL.objects)}
