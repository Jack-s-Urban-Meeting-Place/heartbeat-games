"""
blender/build_chameleon.py: builds the Heartbeat Games chameleon (version 2) in Blender.

The chameleon's skeleton and movement live in games/lib/chameleon.js. This script builds
its *look* on that skeleton, following the panther-chameleon references and the designer's
choices in storyboards/chameleon-model/README.md: a tall, rounded body (about 1.5 times a
real one's width, so it reads from behind), a spiky back ridge, a low rounded helmet head
with a pale lip line, turret eyes with rings of scales, thin legs with mitten feet, and a
tapering tail. Skin pictures are painted in code here: soft scale bumps, and the pale
stripe of blotches along each side. They're grey: the game tints them in the player's colour.

Every part is placed from blender/chameleon-skeleton.json (written by
tools/chameleon-skeleton.cjs) and carries vertex groups named after the joints it moves
with. blender/export_chameleon.py then writes games/lib/chameleon-model.js for the games.

Run it in Blender (Scripting workspace, or through the Blender MCP connector):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/build_chameleon.py").read())
It works in a scene called "Chameleon" and only replaces its own "Chameleon v2" collection,
so it's safe to run again after changing a number below.

Coordinates: the numbers below are in the game's space (three.js): y runs up the wall from
tail to snout, z comes out of the wall toward the camera, x is sideways. Blender is Z-up,
so the chameleon stands upright here, head up (+Z), back toward -Y.
Size: 1 unit = snout to the base of the tail, as in chameleon.js.
"""
import bpy, bmesh, json, math, os
import numpy as np
from mathutils import Matrix, Vector

PROJECT = globals().get("PROJECT") or os.path.dirname(os.path.dirname(os.path.abspath(bpy.data.filepath)))
HERE = os.path.join(PROJECT, "blender")
TEXTURES = os.path.join(HERE, "textures")
SK = json.load(open(os.path.join(HERE, "chameleon-skeleton.json")))
J = SK["joints"]

# ---- Tuning: the shape --------------------------------------------------------------------
PREVIEW_COLOUR = (0.75, 0.22, 0.06)    # orange (linear), for previews here only: the games tint the model themselves
# How wide it is from behind, compared with the numbers in the tables below (which are about 1.5x a real
# chameleon's width). The designer asked for "a bit wider" so it reads from across the room.
BODY_WIDTH = 1.35                      # the body
HEAD_WIDTH = 1.12                      # the head
TAIL_WIDTH = 1.15                      # the tail
RIDGE_NARROWING = 0.32                 # how much the body narrows toward the spiky ridge (0 = not at all)
# Where the body bends (round corners, over edges): from here up the body moves with the chest joint,
# blending from the hips' joint over this length, so the bend is soft.
CHEST_FROM = -0.16
CHEST_BLEND = 0.24
# The body, tail end to neck: (y up the wall, half width, centre height out from the wall, half depth).
BODY = [
    (-0.47, 0.035, 0.075, 0.035),
    (-0.42, 0.060, 0.095, 0.070),
    (-0.32, 0.085, 0.125, 0.115),
    (-0.18, 0.098, 0.150, 0.148),
    (-0.04, 0.100, 0.158, 0.155),   # deepest: the back arches highest here
    (0.10, 0.095, 0.152, 0.140),
    (0.20, 0.086, 0.143, 0.118),
    (0.29, 0.066, 0.135, 0.085),
    (0.36, 0.054, 0.128, 0.070),    # neck (the back of the head overhangs it)
    (0.42, 0.050, 0.128, 0.064),    # (hidden inside the head)
]
BODY_RING = 20                         # points around the body (more = smoother, heavier)
# The head, from just behind it to the snout tip, measured from the head joint:
# (y, half width, chin below the joint, mouth-line height, ridge height, top of the helmet).
HEAD = [
    (-0.075, 0.066, -0.080, -0.018, 0.045, 0.092),
    (-0.02, 0.078, -0.088, -0.020, 0.054, 0.102),   # the low, rounded helmet, highest at the back
    (0.04, 0.084, -0.078, -0.016, 0.058, 0.085),
    (0.09, 0.083, -0.070, -0.013, 0.058, 0.070),    # eyes
    (0.14, 0.074, -0.060, -0.011, 0.050, 0.056),
    (0.18, 0.060, -0.048, -0.008, 0.038, 0.042),
    (0.21, 0.044, -0.034, -0.005, 0.024, 0.026),
    (0.228, 0.022, -0.018, -0.003, 0.010, 0.011),   # a blunt snout tip
]
EYE_RADIUS = 0.047                     # the turret eyes
PUPIL_RADIUS = 0.011
CREST_SPIKES = 18                      # little spikes along the back ridge
LEG_RADIUS = (0.033, 0.026, 0.020)     # thickness at the shoulder or hip, the elbow or knee, and the wrist
TAIL_RADIUS = (0.048, 0.007)           # the tail's thickness at its base and tip
# ---------------------------------------------------------------------------------------

TO_B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # three.js space -> Blender space
B = lambda p: tuple(TO_B @ Vector((p[0], p[1], p[2], 1)))[:3]

def frame(name):
    """A joint's world matrix from chameleon-skeleton.json (three.js, column-major), still in three.js space."""
    e = J[name]
    return Matrix(([e[0], e[4], e[8], e[12]], [e[1], e[5], e[9], e[13]], [e[2], e[6], e[10], e[14]], [0, 0, 0, 1]))

lerp = lambda a, b, t: a + (b - a) * t
smoothstep = lambda t: 0 if t <= 0 else 1 if t >= 1 else t * t * (3 - 2 * t)

def resample(table, n):
    """Smooths a table of rows (first column ascending) into n evenly spaced rows."""
    rows = []
    for i in range(n):
        f = i / (n - 1) * (len(table) - 1)
        j = min(len(table) - 2, int(f)); u = smoothstep(f - j)
        rows.append(tuple(lerp(a, b, u) for a, b in zip(table[j], table[j + 1])))
    return rows

# ---- The scene and collection we work in ----------------------------------------------
scene = bpy.data.scenes.get("Chameleon") or bpy.data.scenes.new("Chameleon")
bpy.context.window.scene = scene
COL = bpy.data.collections.get("Chameleon v2")
if COL is None:
    COL = bpy.data.collections.new("Chameleon v2")
    scene.collection.children.link(COL)
for ob in list(COL.objects):
    me = ob.data
    bpy.data.objects.remove(ob)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)

# ---- Textures: grey pictures the games tint in the player's colour ----------------------
def save_image(name, value):
    """Saves a grey picture (values 0..1, bottom row first, as Blender stores pictures) as a small
    one-channel PNG, written directly (so it stays exact and small), and loads it for the preview."""
    import struct, zlib
    h, w = value.shape
    rows = (np.clip(value, 0, 1)[::-1] * 255 + 0.5).astype(np.uint8)          # PNG rows run top to bottom
    raw = b"".join(b"\x00" + rows[r].tobytes() for r in range(h))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    path = os.path.join(TEXTURES, name + ".png")
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.load(path); img.name = name
    return img

def grey(v):
    return np.clip(v, 0, 1)

def scales(w, h, cells_u, cells_v, seed):
    """Soft round bumps in a jittered grid (the skin's small scales): returns (height 0..1, a random tone per scale)."""
    rng = np.random.default_rng(seed)
    U, V = np.meshgrid((np.arange(w) + 0.5) / w * cells_u, (np.arange(h) + 0.5) / h * cells_v)
    height = np.zeros((h, w)); tone = np.zeros((h, w))
    jit = rng.uniform(-0.25, 0.25, (cells_v + 2, cells_u + 2, 2)); tones = rng.uniform(-1, 1, (cells_v + 2, cells_u + 2))
    for dv in (-1, 0, 1):
        for du in (-1, 0, 1):
            cu = np.floor(U).astype(int) + du; cv = np.floor(V).astype(int) + dv
            jx = jit[cv % cells_v, cu % cells_u, 0]; jy = jit[cv % cells_v, cu % cells_u, 1]
            d = np.hypot(U - (cu + 0.5 + jx), V - (cv + 0.5 + jy))
            bump = np.clip(1 - d / 0.62, 0, 1) ** 1.5
            mask = bump > height
            height = np.where(mask, bump, height); tone = np.where(mask, tones[cv % cells_v, cu % cells_u], tone)
    return height, tone

def skin_texture(name, w, h, cells_u, cells_v, seed, extra=None):
    """A skin picture (u around, v along): soft scales, each a slightly different shade, darker in the gaps.
    `extra(U, V, value)` adds markings. Also saves a matching bump picture (name + "_bump")."""
    height, tone = scales(w, h, cells_u, cells_v, seed)
    U, V = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    val = 0.82 + 0.035 * tone - 0.07 * (1 - height) ** 3
    if extra:
        val = extra(U, V, val)
    save_image(name, grey(val))
    save_image(name + "_bump", grey(0.25 + 0.75 * height))
    return name

def body_marks(U, V, val):
    # u runs round the body from the belly (0), past the right flank (0.25), over the back (0.5), to the left flank (0.75).
    across = np.minimum(np.abs(U - 0.5), 0.5)                                   # 0 on the back, 0.5 on the belly
    val = val * (1 - 0.12 * np.clip((0.12 - across) / 0.12, 0, 1))              # a little darker along the ridge
    val = val + 0.1 * np.clip((across - 0.36) / 0.14, 0, 1)                     # paler belly
    # The pale stripe: a row of separate blotches along each side, just above the middle, from shoulder to hip.
    for centre in (0.29, 0.71):
        k = np.floor(V * 9); jitter = np.sin(k * 12.9) * 0.15
        dv = (V * 9 - k - 0.5 - jitter) / 0.36; du = (U - centre - 0.01 * np.sin(k * 7.1)) / 0.035
        blotch = np.clip(1 - (du ** 2 + dv ** 2), 0, 1) ** 0.6
        blotch *= np.clip((V - 0.12) / 0.1, 0, 1) * np.clip((0.86 - V) / 0.1, 0, 1)
        val = val + (1.0 - val) * 0.9 * blotch
    return val

def tail_marks(U, V, val):
    across = np.minimum(np.abs(U - 0.5), 0.5)
    band = 0.5 + 0.5 * np.cos(2 * np.pi * V * 3.2)                              # faint bands along the tail
    return val * (1 - 0.1 * band * np.clip((0.4 - across) / 0.2, 0, 1)) + 0.08 * np.clip((across - 0.36) / 0.14, 0, 1)

def eye_texture(name):
    """The turret eye, from the pupil (v = 0) back to where it meets the head (v = 1): rings of tiny scales."""
    w, h = 128, 256
    U, V = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    rings = 0.5 + 0.5 * np.cos(2 * np.pi * (V * 14))
    spokes = 0.5 + 0.5 * np.cos(2 * np.pi * U * 40)
    val = 0.82 + 0.1 * rings * (0.6 + 0.4 * spokes)
    val = np.where(V < 0.08, 1.15, val)                                        # a pale ring round the pupil
    save_image(name, grey(val))
    return name

skin_texture("cham_skin", 320, 320, 46, 40, 1, body_marks)
skin_texture("cham_head", 192, 192, 30, 26, 2)
skin_texture("cham_limb", 128, 160, 18, 22, 3)
skin_texture("cham_tail", 128, 448, 16, 70, 4, tail_marks)
eye_texture("cham_eye")

def material(name, tex=None, colour=PREVIEW_COLOUR):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    for n in [n for n in nt.nodes if n.type == "TEX_IMAGE"]:
        nt.nodes.remove(n)
    if tex:                                            # (shown grey here; the games tint it)
        node = nt.nodes.new("ShaderNodeTexImage"); node.image = bpy.data.images[tex]
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return m

MATS = {
    "skin": material("cham_skin", "cham_skin"), "head": material("cham_head", "cham_head"),
    "limb": material("cham_limb", "cham_limb"), "tail": material("cham_tail", "cham_tail"),
    "crest": material("cham_crest", None, tuple(c * 0.8 for c in PREVIEW_COLOUR)),
    "eye": material("cham_eye", "cham_eye"), "pupil": material("cham_pupil", None, (0.01, 0.01, 0.01)),
    "mouth": material("cham_mouth", None, (0.9, 0.7, 0.5)),
}

# ---- Building meshes ----------------------------------------------------------------------
def make_mesh(name, verts, faces, uvs, groups, mat, smooth=True, subdivide=0):
    """verts in three.js space; uvs: one (u, v) per face corner, in face order; groups: {joint: {vertex: weight}}."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(v) for v in verts], [], faces)
    me.update()
    uv = me.uv_layers.new(name="UV")
    for i, loop_uv in enumerate(uvs):
        uv.data[i].uv = loop_uv
    bm = bmesh.new(); bm.from_mesh(me)                 # make every face point outward
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    for gname, weights in groups.items():
        vg = ob.vertex_groups.new(name=gname)
        for vi, w in weights.items():
            if w > 0.001:
                vg.add([vi], w, "REPLACE")
    if subdivide:
        mod = ob.modifiers.new("Smooth", "SUBSURF"); mod.levels = subdivide; mod.render_levels = subdivide
    return ob

def loft(name, rings, mat, weights, v_scale=1.0, close_start=True, close_end=True, subdivide=0, u_start=0.0):
    """A tube through rings of points (each ring a list of the same number of points, three.js space).
    weights(i) gives each ring's {joint: weight}. Texture: u around (from u_start), v along (times v_scale)."""
    n, m = len(rings), len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces, uvs = [], []
    for i in range(n - 1):
        for k in range(m):
            a, b = i * m + k, i * m + (k + 1) % m
            faces.append((a, b, b + m, a + m))
            u0, u1 = k / m, (k + 1) / m
            uvs += [(u0, i / (n - 1) * v_scale), (u1, i / (n - 1) * v_scale), (u1, (i + 1) / (n - 1) * v_scale), (u0, (i + 1) / (n - 1) * v_scale)]
    groups = {}
    for i in range(n):
        for g, w in weights(i).items():
            groups.setdefault(g, {}).update({i * m + k: w for k in range(m)})
    for end, ring_i, flip in ((close_start, 0, True), (close_end, n - 1, False)):
        if not end:
            continue
        ring = rings[ring_i]
        centre = tuple(sum(p[c] for p in ring) / m for c in range(3))
        # push the cap's centre out a little, so the end is rounded
        other = rings[1 if ring_i == 0 else n - 2]
        oc = tuple(sum(p[c] for p in other) / m for c in range(3))
        d = Vector(centre) - Vector(oc)
        r = sum((Vector(p) - Vector(centre)).length for p in ring) / m
        centre = tuple(Vector(centre) + d.normalized() * r * 0.6) if d.length > 1e-6 else centre
        ci = len(verts); verts.append(centre)
        for g, w in weights(ring_i).items():
            groups.setdefault(g, {})[ci] = w
        for k in range(m):
            a, b = ring_i * m + k, ring_i * m + (k + 1) % m
            faces.append((b, a, ci) if flip else (a, b, ci))
            vv = 0 if ring_i == 0 else v_scale
            uvs += [((k + 1) / m, vv), (k / m, vv), ((k + 0.5) / m, vv)] if flip else [(k / m, vv), ((k + 1) / m, vv), ((k + 0.5) / m, vv)]
    return make_mesh(name, verts, faces, uvs, groups, mat, subdivide=subdivide)

def ring_around(centre, side, out, radius_side, radius_out, m, start_angle=-math.pi / 2, shape=None):
    """m points round a centre: `side` and `out` are unit directions; angle 0 points along `side`."""
    pts = []
    for k in range(m):
        a = start_angle + 2 * math.pi * k / m
        c, s = math.cos(a), math.sin(a)
        rs, ro = (radius_side, radius_out) if shape is None else shape(a)
        pts.append(tuple(Vector(centre) + Vector(side) * c * rs + Vector(out) * s * ro))
    return pts

head_frame = frame("head")
head_y = head_frame.translation.y

# ---- Body: tall and rounded, narrower toward the back ridge, belly close to the wall ----
rows = resample(BODY, 16)
def body_section(row):
    y, hw, zc, hd = row
    hw *= BODY_WIDTH
    def shape(a):
        s = math.sin(a)
        narrow = 1 - RIDGE_NARROWING * max(0.0, s) ** 1.4    # the body narrows toward the ridge (flattened side to side)
        return hw * narrow, hd * (0.88 if s < 0 else 1.0)     # and is a little flatter underneath
    # start at the belly (angle -90°), so the texture's seam is underneath, out of sight
    return ring_around((0, y, zc), (1, 0, 0), (0, 0, 1), 0, 0, BODY_RING, -math.pi / 2, shape)
def chest_share(y):
    """How much of the body at height y moves with the chest (the front half, which bends round corners)."""
    return smoothstep((y - CHEST_FROM) / CHEST_BLEND)
def body_weights(i):
    y = rows[i][0]
    to_head = smoothstep((y - 0.30) / 0.11)
    to_tail = smoothstep((-0.40 - y) / 0.06)
    chest = chest_share(y) * (1 - to_head)
    return {"body": 1 - chest - to_head - to_tail, "chest": chest, "head": to_head, "tail.0": to_tail}
loft("body", [body_section(r) for r in rows], "skin", body_weights, subdivide=1)

# ---- The back ridge: small cone spikes along the top ----
def ridge_top(y):
    y = max(rows[0][0], min(rows[-1][0], y))
    for a, b in zip(rows, rows[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return lerp(a[2], b[2], t) + lerp(a[3], b[3], t)
verts, faces, uvs, groups = [], [], [], {"body": {}, "chest": {}}
for k in range(CREST_SPIKES):
    y = lerp(-0.40, 0.30, k / (CREST_SPIKES - 1))
    h = 0.018 + 0.016 * math.sin(math.pi * (k + 0.5) / CREST_SPIKES)
    base_z = ridge_top(y) - 0.006
    i0 = len(verts)
    verts += [(-0.009, y - 0.016, base_z), (0.009, y - 0.016, base_z), (0.0, y + 0.018, base_z), (0.0, y - 0.004, base_z + h)]
    for f in ((i0, i0 + 1, i0 + 3), (i0 + 1, i0 + 2, i0 + 3), (i0 + 2, i0, i0 + 3)):
        faces.append(f); uvs += [(0, 0), (1, 0), (0.5, 1)]
    for v in range(i0, i0 + 4):
        groups["chest"][v] = chest_share(y); groups["body"][v] = 1 - chest_share(y)
make_mesh("crest", verts, faces, uvs, groups, "crest", smooth=False)

# ---- Head: a wedge with a ridge over each eye, a big mouth, and a low, rounded helmet ----
def head_section(row):
    y, w, chin, mouth, ridge, top = row
    w *= HEAD_WIDTH
    hz = head_frame.translation.z
    # around the section, starting under the chin, going up the right side and over the top:
    # the jaw, a groove along the mouth (where the pale lip line sits), the cheek, the bony ridge
    # over the eye, and the rounded helmet on top
    pts2d = [(0, chin), (w * 0.55, chin * 0.95), (w * 0.9, chin * 0.55), (w, mouth - 0.013), (w * 0.84, mouth),
             (w, mouth + 0.013), (w * 1.03, ridge * 0.45), (w * 0.96, ridge * 0.82), (w * 1.04, ridge),
             (w * 0.72, ridge * 1.08), (w * 0.36, (ridge + top) / 2), (0, top)]
    left = [(-x, z) for x, z in reversed(pts2d[1:-1])]
    loop = pts2d + left
    return [(x, head_y + y, hz + z) for x, z in loop]
head_rows = resample(HEAD, 12)
loft("head", [head_section(r) for r in head_rows], "head", lambda i: {"head": 1.0}, subdivide=1)

# The pale lip line: a thin rounded strip along the mouth on each side.
for side in (-1, 1):
    pts = [(side * r[1] * HEAD_WIDTH * 0.86, head_y + r[0], head_frame.translation.z + r[3]) for r in head_rows[2:-1]]
    rings = [ring_around(p, (0, 0, 1), (side, 0, 0), 0.008, 0.006, 6) for p in pts]
    loft("lip_" + ("L" if side < 0 else "R"), rings, "mouth", lambda i: {"head": 1.0})

# ---- Eyes: turrets covered in rings of tiny scales, with a small pupil; they turn with "look" ----
for i in (0, 1):
    look = frame("look.%d" % i)
    centre = look.translation
    side = -1 if i == 0 else 1
    axis = Vector((side, 0, 0))                     # the pupil points straight out to the side (as in chameleon.js)
    up, fwd = Vector((0, 0, 1)), Vector((0, 1, 0))
    rings = []
    steps = 9
    for s in range(steps + 1):                      # from the pupil (s = 0) back into the head
        a = 0.18 + (math.pi * 0.62) * s / steps
        r = EYE_RADIUS * math.sin(a); d = EYE_RADIUS * math.cos(a)
        rings.append(ring_around(tuple(centre + axis * d), tuple(fwd), tuple(up), r, r, 14, 0))
    loft("eye_%d" % i, rings, "eye", lambda k, i=i: {"look.%d" % i: 1.0}, close_start=False, close_end=True)
    pupil_c = centre + axis * (EYE_RADIUS * math.cos(0.18) - 0.002)
    prings = [ring_around(tuple(pupil_c + axis * dz), tuple(fwd), tuple(up), rr, rr, 10, 0) for dz, rr in ((-0.004, PUPIL_RADIUS * 1.05), (0.0015, PUPIL_RADIUS))]
    loft("pupil_%d" % i, prings, "pupil", lambda k, i=i: {"look.%d" % i: 1.0}, close_start=False)

# ---- Legs: an upper and a lower bone each, tapering, bending at the elbow or knee, then mitten feet ----
for li, leg in enumerate(SK["legs"]):
    upper, lower, foot = frame("leg.%d.upper" % li), frame("leg.%d.lower" % li), frame("leg.%d.foot" % li)
    rings, wts = [], []
    def add(fr, along, radius, w):
        x_axis = fr.col[0].to_3d().normalized(); z_axis = fr.col[2].to_3d().normalized(); y_axis = fr.col[1].to_3d().normalized()
        c = fr.translation + y_axis * along
        rings.append(ring_around(tuple(c), tuple(x_axis), tuple(z_axis), radius, radius, 10, 0)); wts.append(w)
    a, b = leg["a"], leg["b"]
    upper_name, lower_name = "leg.%d.upper" % li, "leg.%d.lower" % li
    add(upper, -0.02, LEG_RADIUS[0] * 1.1, {upper_name: 1.0})            # (starts inside the body)
    for t in (0.25, 0.5, 0.75):
        add(upper, a * t, lerp(LEG_RADIUS[0], LEG_RADIUS[1], t), {upper_name: 1.0})
    add(upper, a * 0.97, LEG_RADIUS[1] * 1.08, {upper_name: 0.6, lower_name: 0.4})   # the elbow or knee
    add(lower, b * 0.08, LEG_RADIUS[1], {upper_name: 0.2, lower_name: 0.8})
    for t in (0.35, 0.7, 0.95):
        add(lower, b * t, lerp(LEG_RADIUS[1], LEG_RADIUS[2], t), {lower_name: 1.0})
    loft("leg_%d" % li, rings, "limb", lambda i: wts[i])
    # Mitten feet: two bundles of toes splayed apart, gripping toward the wall.
    fname = "leg.%d.foot" % li
    for turn in (-0.55, 0.55):
        d = Vector((-math.sin(turn), math.cos(turn), 0))
        pts = []
        for s in range(5):
            t = s / 4
            p = d * (0.012 + 0.065 * t) + Vector((0, 0, 0.012 - 0.018 * t * t))   # curling down to grip
            pts.append(foot @ p)
        frs = []
        for s, p in enumerate(pts):
            nxt = pts[min(s + 1, 4)] - pts[max(s - 1, 0)]
            side_v = nxt.cross(foot.col[2].to_3d()).normalized()
            out_v = side_v.cross(nxt).normalized()
            r = lerp(0.017, 0.008, s / 4)
            frs.append(ring_around(tuple(p), tuple(side_v), tuple(out_v), r * 1.15, r * 0.8, 8, 0))
        loft("foot_%d_%s" % (li, "a" if turn < 0 else "b"), frs, "limb", lambda i, f=fname: {f: 1.0})

# ---- Tail: thick at the base, tapering to a fine tip, a little taller than wide ----
tail = [frame("tail.%d" % i) for i in range(16)]
rings, wts = [], []
PER = 3                                               # rings per tail joint (so it bends smoothly)
total = 16 * PER
for i in range(16):
    for s in range(PER):
        if i == 15 and s > 0:
            break
        fr = tail[i]
        nxt = tail[i + 1].translation if i < 15 else fr.translation + fr.col[1].to_3d() * 0.04
        t = s / PER
        c = fr.translation.lerp(nxt, t)
        k = (i * PER + s) / (15 * PER)
        r = lerp(TAIL_RADIUS[0], TAIL_RADIUS[1], k ** 0.8)
        x_axis = fr.col[0].to_3d().normalized(); z_axis = fr.col[2].to_3d().normalized()
        rings.append(ring_around(tuple(c), tuple(x_axis), tuple(z_axis), r * 0.85 * TAIL_WIDTH, r, 10, -math.pi / 2))
        w = {"tail.%d" % i: 1 - t}
        if t > 0 and i < 15:
            w["tail.%d" % (i + 1)] = t
        wts.append(w)
loft("tail", rings, "tail", lambda i: wts[i], v_scale=3.2, close_start=False)

# ---- A preview: the chameleon on a wall, lit ----
if "Chameleon wall" not in bpy.data.objects:
    wall_me = bpy.data.meshes.new("Chameleon wall")
    wall_me.from_pydata([B((-1.2, -1.6, -0.002)), B((1.2, -1.6, -0.002)), B((1.2, 0.9, -0.002)), B((-1.2, 0.9, -0.002))], [], [(0, 1, 2, 3)])
    wall = bpy.data.objects.new("Chameleon wall", wall_me)
    scene.collection.objects.link(wall)
    wm = bpy.data.materials.new("Chameleon wall"); wm.diffuse_color = (0.55, 0.45, 0.32, 1)
    wm.use_nodes = True; wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.4, 0.28, 1)
    wall_me.materials.append(wm)

RESULT = {"objects": len(COL.objects), "triangles": sum(len(o.data.polygons) for o in COL.objects)}
