"""
blender/build_crow.py: builds the Heartbeat Games crow (version 2) in Blender.

The crow's skeleton and movement live in games/lib/crow.js. This script builds the
crow's *look* on that skeleton: a smooth one-piece body, neck and head; a hooked beak;
flight feathers and rows of covert feathers with painted textures; legs and eyes.
Every part is placed exactly where its joint sits (blender/crow-skeleton.json, written
by tools/crow-skeleton.cjs) and tagged with that joint's name in a custom property
"bone". blender/export_crow.py then writes games/lib/crow-model.js for the games.

Run it in Blender (Scripting workspace, or through the Blender MCP connector):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/build_crow.py").read())
It works in a scene called "Crow" and only replaces its own "Crow v2" collection,
so it's safe to run again after changing a number below. Once you're happy, edit the
parts by hand in Blender if you like (keep each part's "bone" property), then export.

Coordinates: Blender is Z-up, so here the crow faces +Y with its right wing along +X.
(The game uses three.js, Y-up and facing -Z; the scripts convert between the two.)
Sizes: wingspan 1 unit, as in crow.js; the games scale the bird up.
"""
import bpy, json, math, os
import numpy as np
from mathutils import Matrix, Vector

PROJECT = globals().get("PROJECT") or os.path.dirname(os.path.dirname(os.path.abspath(bpy.data.filepath)))
HERE = os.path.join(PROJECT, "blender")
TEXTURES = os.path.join(HERE, "textures")
SK = json.load(open(os.path.join(HERE, "crow-skeleton.json")))

# ---- Tuning: the look -------------------------------------------------------------
PREVIEW_COLOUR = (0.75, 0.22, 0.06)    # orange (linear), for previews here only: the games tint the model themselves
# The body, neck and head as one loft: (along the body y, half width, half height, centre height z).
# y runs from the tail end (negative) to the face (positive); see the profile drawn in comments.
BODY = [
    (-0.105, 0.008, 0.006, 0.004),
    (-0.090, 0.024, 0.020, 0.004),
    (-0.060, 0.040, 0.034, 0.002),
    (-0.030, 0.050, 0.043, 0.000),
    (0.000, 0.055, 0.047, 0.000),
    (0.030, 0.054, 0.047, 0.001),
    (0.055, 0.048, 0.044, 0.004),
    (0.078, 0.042, 0.040, 0.011),   # base of the neck (crows have short, thick necks)
    (0.098, 0.036, 0.035, 0.018),   # neck
    (0.116, 0.032, 0.033, 0.024),
    (0.134, 0.034, 0.034, 0.030),   # head, widest
    (0.150, 0.031, 0.031, 0.032),
    (0.163, 0.022, 0.024, 0.029),   # face, where the beak starts
    (0.170, 0.010, 0.013, 0.027),
]
RING = 12                              # points around each body section (more = smoother, heavier)
# The beak (upper and lower halves): (y, half width, height above the split, height below, split height z)
BEAK = [
    (0.158, 0.016, 0.013, 0.010, 0.026),
    (0.178, 0.013, 0.011, 0.008, 0.025),
    (0.198, 0.009, 0.008, 0.005, 0.021),
    (0.213, 0.005, 0.005, 0.003, 0.016),
    (0.224, 0.0012, 0.0012, 0.0, 0.010),   # hooked tip
]
FEATHER_STEPS = 8                      # points along each flight feather
# ---------------------------------------------------------------------------------------

TO_B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # three.js space -> Blender space

def frame(e):
    """A joint's world matrix from crow-skeleton.json (three.js, column-major) as a Blender-space matrix."""
    m = Matrix(([e[0], e[4], e[8], e[12]], [e[1], e[5], e[9], e[13]], [e[2], e[6], e[10], e[14]], [0, 0, 0, 1]))
    return TO_B @ m

def place(fr, pts):
    """Points given in a joint's own (three.js) frame, moved to where that joint sits, in Blender space."""
    return [tuple(fr @ Vector(p)) for p in pts]

lerp = lambda a, b, t: a + (b - a) * t
smoothstep = lambda t: 0 if t <= 0 else 1 if t >= 1 else t * t * (3 - 2 * t)

# ---- The scene and collection we work in ----------------------------------------------
scene = bpy.data.scenes.get("Crow") or bpy.data.scenes.new("Crow")
bpy.context.window.scene = scene
COL = bpy.data.collections.get("Crow v2")
if COL is None:
    COL = bpy.data.collections.new("Crow v2")
    scene.collection.children.link(COL)
for ob in list(COL.objects):
    me = ob.data
    bpy.data.objects.remove(ob)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)

# ---- Textures: painted in code here, near-white so the games can tint them -------------
def save_image(name, rgba):
    h, w = rgba.shape[:2]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if img.size[0] != w or img.size[1] != h:
        img.scale(w, h)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEXTURES, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img

def grey(v):
    v = np.clip(v, 0, 1)
    return np.dstack([v, v, v, np.ones_like(v)])

def feather_texture():
    """A flight feather, base (left) to tip (right): a darker shaft down the middle,
    fine barbs angled toward the tip, and slightly darker vane edges."""
    w, h = 512, 128
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    U, V = np.meshgrid(u, v)
    d = np.abs(V - 0.5)
    barbs = 0.5 + 0.5 * np.cos(2 * np.pi * (U * 30 + d * 10))
    val = 0.9 + 0.1 * barbs
    val *= 1 - 0.2 * np.clip((d - 0.3) / 0.2, 0, 1)                      # edges darker, so each feather reads
    val *= 1 - 0.22 * np.clip((U - 0.55) / 0.45, 0, 1) ** 1.5           # and darker toward the tip
    shaft = np.clip(1 - d / (0.014 * (1 - 0.6 * U) + 0.004), 0, 1)
    val = val * (1 - 0.4 * shaft)
    val *= 1 - 0.08 * np.clip((0.08 - U) / 0.08, 0, 1)                   # the quill end
    return save_image("crow_feather", grey(val))

def scallop_texture(name, rows, cols, strength, size=256):
    """Overlapping rows of small rounded feathers (coverts, body plumage). Tiles seamlessly.
    strength: how strongly the feather edges show (0.2 = clear, 0.08 = subtle)."""
    s = (np.arange(size) + 0.5) / size
    U, V = np.meshgrid(s, s)
    vv = V * rows
    row = np.floor(vv)
    f = vv - row                                                       # 0 at a row's base, 1 at its tips
    uu = U * cols + 0.5 * (row % 2)
    g = (uu - np.floor(uu)) - 0.5                                      # -0.5..0.5 across one feather
    tip = 1 - 4 * g * g * 0.9                                          # each feather's rounded tip line
    edge = np.clip((f - tip * 0.85) * 5, 0, 1)                         # just past a feather's tip: shadow
    side = np.clip((np.abs(g) - 0.46) * 25, 0, 1)                      # thin line between neighbours
    val = 0.95 - strength * (0.5 * f + 0.9 * edge + 0.3 * side)
    return save_image(name, grey(val))

os.makedirs(TEXTURES, exist_ok=True)
IMG = {
    "feather": feather_texture(),
    "covert": scallop_texture("crow_covert", 3, 9, 0.24),
    "plumage": scallop_texture("crow_plumage", 7, 12, 0.07),     # subtle: a soft feathery texture, not scales
}

# ---- Materials (for previews in Blender; the games make their own from the same names) ----
def material(name, colour, image=None, rough=0.55):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = rough
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if image is None:
        bsdf.inputs["Base Color"].default_value = (*colour, 1)
    else:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        sock = lambda node, ident, outs=False: next(s for s in (node.outputs if outs else node.inputs) if s.identifier == ident)
        sock(mix, "Factor_Float").default_value = 1.0
        sock(mix, "B_Color").default_value = (*colour, 1)
        nt.links.new(tex.outputs["Color"], sock(mix, "A_Color"))
        nt.links.new(sock(mix, "Result_Color", True), bsdf.inputs["Base Color"])
    try:
        mat.use_backface_culling = False
    except AttributeError:
        pass
    return mat

c = PREVIEW_COLOUR
MATS = {
    "plumage": material("crow_plumage", tuple(x * 0.82 for x in c), IMG["plumage"]),
    "covert": material("crow_covert", tuple(x * 0.9 for x in c), IMG["covert"]),
    "feather": material("crow_feather", c, IMG["feather"], 0.5),
    "tip": material("crow_tip", c, IMG["feather"], 0.5),           # finger tips (the player's colour on the black crow)
    "edge": material("crow_edge", c),                              # wing leading edges (likewise)
    "bare": material("crow_bare", (0.03, 0.028, 0.035), None, 0.6),  # beak and legs
    "eye": material("crow_eye", (0.005, 0.005, 0.006), None, 0.15),
}

# ---- Making a part ----------------------------------------------------------------------
def make_part(name, verts, faces, uvs, mat, bone, smooth=False, groups=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(MATS[mat])
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    ob["bone"] = bone
    for gname, weights in (groups or {}).items():
        vg = ob.vertex_groups.new(name=gname)
        for i, wt in enumerate(weights):
            if wt > 0:
                vg.add([i], wt, "REPLACE")
    return ob

# ---- Shapes, in a joint's own frame (three.js axes: x along the bone, y up, z back) ----
def feather(length, width, finger=False, u0=0.0, u1=1.0, bend=0.02):
    """A flight feather lying flat, its shaft along +x. Finger feathers (the crow's
    separated outer primaries) are narrow on the outer vane toward the tip."""
    rnd = lambda u: math.sqrt(max(0.0, (1 - u) / 0.3)) if u > 0.7 else 1.0
    base = lambda u: 0.45 + 0.55 * u / 0.12 if u < 0.12 else 1.0
    lead = lambda u: width * 0.5 * base(u) * rnd(u) * (0.5 if finger and u > 0.5 else 0.8)
    trail = lambda u: width * 0.5 * base(u) * rnd(u) * (0.75 if finger and u > 0.55 else 1.0)
    pts, uvs, faces = [], [], []
    for k in range(FEATHER_STEPS + 1):
        u = lerp(u0, u1, k / FEATHER_STEPS)
        for off in (-lead(u), trail(u)):
            y = bend * length * u * u - 0.12 * abs(off)          # the tip lifts; the vanes curve down a little
            pts.append((u * length, y, off))
            uvs.append((u, 0.5 + off / width))
    for k in range(FEATHER_STEPS):
        a = 2 * k
        faces.append((a, a + 2, a + 3, a + 1))
    return pts, uvs, faces

def covert_row(x0, x1, lead, d0, d1, scallops, y):
    """A row of small covering feathers: straight leading edge, scalloped trailing edge."""
    pts, uvs, faces = [], [], []
    n = 2 * scallops
    for j in range(n + 1):
        t = j / n
        x = lerp(x0, x1, t)
        front = -lead * lerp(1, 0.7, t)
        back = lerp(d0, d1, t) + (0.005 if j % 2 else 0)          # gently rounded feather tips
        pts += [(x, y, front), (x, y - 0.002, back)]
        uvs += [(t, 0.0), (t, 1.0)]
    for j in range(n):
        a = 2 * j
        faces.append((a, a + 2, a + 3, a + 1))
    return pts, uvs, faces

def strip(x0, x1, lead, width, y):
    pts = [(x0, y, -lead - width * 0.4), (x1, y, -lead * 0.7 - width * 0.4), (x1, y, -lead * 0.7 + width * 0.6), (x0, y, -lead + width * 0.6)]
    return pts, [(0, 0), (1, 0), (1, 1), (0, 1)], [(0, 1, 2, 3)]

def tube(p0, p1, r0, r1, sides=6, caps=True):
    """A tapered tube from p0 to p1 (for legs, toes and the thigh)."""
    a, b = Vector(p0), Vector(p1)
    axis = (b - a).normalized()
    side = axis.orthogonal().normalized()
    other = axis.cross(side)
    pts, faces = [], []
    for k in range(sides):
        ang = 2 * math.pi * k / sides
        d = side * math.cos(ang) + other * math.sin(ang)
        pts += [tuple(a + d * r0), tuple(b + d * r1)]
    for k in range(sides):
        i, j = 2 * k, 2 * ((k + 1) % sides)
        faces.append((i, j, j + 1, i + 1))
    if caps:
        pts += [tuple(a), tuple(b)]
        ca, cb = len(pts) - 2, len(pts) - 1
        for k in range(sides):
            i, j = 2 * k, 2 * ((k + 1) % sides)
            faces += [(ca, j, i), (cb, i + 1, j + 1)]
    return pts, None, faces

def ball(centre, radius, scale=(1, 1, 1), rings=5, segs=8):
    pts, faces = [], []
    pts.append((centre[0], centre[1] + radius * scale[1], centre[2]))
    for r in range(1, rings):
        phi = math.pi * r / rings
        for s in range(segs):
            th = 2 * math.pi * s / segs
            pts.append((centre[0] + radius * scale[0] * math.sin(phi) * math.cos(th),
                        centre[1] + radius * scale[1] * math.cos(phi),
                        centre[2] + radius * scale[2] * math.sin(phi) * math.sin(th)))
    pts.append((centre[0], centre[1] - radius * scale[1], centre[2]))
    last = len(pts) - 1
    for s in range(segs):
        faces.append((0, 1 + (s + 1) % segs, 1 + s))
    for r in range(rings - 2):
        for s in range(segs):
            a = 1 + r * segs + s
            b = 1 + r * segs + (s + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    base = 1 + (rings - 2) * segs
    for s in range(segs):
        faces.append((last, base + s, base + (s + 1) % segs))
    return pts, None, faces

def add(name, shape, fr, mat, bone, smooth=False):
    pts, uvs, faces = shape
    return make_part(name, place(fr, pts), faces, uvs, mat, bone, smooth)

# ---- The body, neck and head: one smooth loft, bending at the neck -----------------------
def build_body():
    pts, uvs, faces = [], [], []
    for (y, hw, hh, cz) in BODY:
        for k in range(RING + 1):                        # one extra column so the texture wraps cleanly
            ang = 2 * math.pi * k / RING
            s = math.sin(ang)
            pts.append((hw * math.cos(ang), y, cz + hh * s * (0.92 if s < 0 else 1.0)))
            uvs.append((k / RING * 3, (y - BODY[0][0]) / (BODY[-1][0] - BODY[0][0]) * 5))
    cols = RING + 1
    for r in range(len(BODY) - 1):
        for k in range(RING):
            a = r * cols + k
            faces.append((a, a + 1, a + cols + 1, a + cols))
    tail_end = len(pts); pts.append((0, BODY[0][0] - 0.004, BODY[0][3])); uvs.append((0.5, 0))
    face_end = len(pts); pts.append((0, BODY[-1][0] + 0.003, BODY[-1][3])); uvs.append((0.5, 5))
    last = (len(BODY) - 1) * cols
    for k in range(RING):
        faces.append((tail_end, k + 1, k))
        faces.append((face_end, last + k, last + k + 1))
    # The head joint carries the neck and head; the body joint the rest, blending smoothly between.
    head_w = [smoothstep((p[1] - 0.072) / 0.045) for p in pts]
    make_part("body", pts, faces, uvs, "plumage", "body", smooth=True,
              groups={"body": [1 - w for w in head_w], "head": head_w})

def build_beak():
    for half, bone, sign in (("beak_top", "beakTop", 1), ("beak_low", "beakLow", -1)):
        sections = BEAK if sign > 0 else BEAK[:-1]
        n = 5
        pts, faces = [], []
        for (y, hw, up, down, z) in sections:
            h = up if sign > 0 else down
            for k in range(n + 1):
                ang = math.pi * k / n                       # half an ellipse, from one side to the other
                pts.append((hw * math.cos(ang), y, z + sign * h * math.sin(ang)))
        cols = n + 1
        for r in range(len(sections) - 1):
            for k in range(n):
                a = r * cols + k
                faces.append((a, a + 1, a + cols + 1, a + cols) if sign > 0 else (a, a + cols, a + cols + 1, a + 1))
        flat = list(range(0, len(pts), cols)) + list(range(cols - 1, len(pts), cols))[::-1]   # close the split side
        faces.append(tuple(flat) if sign > 0 else tuple(reversed(flat)))
        make_part(half, pts, faces, None, "bare", bone)

def build_eyes():
    head = frame(SK["head"])
    for side in (-1, 1):
        # Set into the side of the head, slightly flattened, so they don't bulge out like beads.
        add("eye_" + ("L" if side < 0 else "R"), ball((side * 0.0235, 0.024, -0.068), 0.0058, (0.55, 1, 1), rings=4, segs=8), head, "eye", "head", smooth=True)

def build_tail():
    for i, m in enumerate(SK["tailFeathers"]):
        off = i - 3
        add("tail_%d" % i, feather(0.178 - abs(off) * 0.006, 0.05, bend=-0.02), frame(m), "feather", "tail.%d" % i)

def build_legs():
    for i, leg in enumerate(SK["legs"]):
        hip, foot = frame(leg["hip"]), frame(leg["foot"])
        add("thigh_%d" % i, tube((0, 0.012, 0), (0, -0.022, 0), 0.015, 0.009, 8), hip, "plumage", "leg.%d.hip" % i, smooth=True)
        add("shin_%d" % i, tube((0, -0.015, 0), (0, -0.07, 0), 0.0055, 0.0045), hip, "bare", "leg.%d.hip" % i)
        for t, (ang, ln) in enumerate([(-0.35, 0.038), (0, 0.042), (0.35, 0.036), (math.pi, 0.028)]):
            d = (math.sin(ang) * ln, 0, -math.cos(ang) * ln)
            add("toe_%d_%d" % (i, t), tube((0, 0, 0), d, 0.0035, 0.0022, 5), foot, "bare", "leg.%d.foot" % i)

ARM, FOREARM, HAND = 0.095, 0.115, 0.08   # must match crow.js
PRIMARY_LENGTHS = [0.14, 0.155, 0.175, 0.205, 0.225, 0.232, 0.222, 0.19]

def build_wing(w, idx):
    tag = "wing.%d." % idx
    sh, el, wr = frame(w["shoulder"]), frame(w["elbow"]), frame(w["wrist"])
    for i, m in enumerate(w["tertials"]):
        add("wing%d_tertial_%d" % (idx, i), feather(0.135 + i * 0.008, 0.042), frame(m), "feather", tag + "tertial.%d" % i)
    for i, m in enumerate(w["secondaries"]):
        add("wing%d_secondary_%d" % (idx, i), feather(0.158 - i * 0.002, 0.042), frame(m), "feather", tag + "secondary.%d" % i)
    for i, m in enumerate(w["primaries"]):
        finger = i >= 3
        ln, wd = PRIMARY_LENGTHS[i], (0.036 if finger else 0.04)
        fr = frame(m)
        if finger:
            add("wing%d_primary_%d" % (idx, i), feather(ln, wd, True, 0.0, 0.8, 0.06), fr, "feather", tag + "primary.%d" % i)
            add("wing%d_primary_%d_tip" % (idx, i), feather(ln, wd, True, 0.8, 1.0, 0.06), fr, "tip", tag + "primary.%d" % i)
        else:
            add("wing%d_primary_%d" % (idx, i), feather(ln, wd), fr, "feather", tag + "primary.%d" % i)
    # Coverts: two overlapping rows on each wing bone (they slim down as the wing folds, in crow.js).
    for k, (fr, x0, x1, lead, d0, d1, sc) in enumerate([
        (sh, -0.03, ARM + 0.006, 0.026, 0.072, 0.062, 5),
        (el, -0.004, FOREARM + 0.006, 0.022, 0.064, 0.052, 6),
        (wr, -0.006, HAND + 0.004, 0.014, 0.047, 0.022, 4),
    ]):
        add("wing%d_covert_%d_greater" % (idx, k), covert_row(x0, x1, lead, d0, d1, sc, 0.009 + 0.001 * k), fr, "covert", tag + "covert.%d" % k)
        add("wing%d_covert_%d_lesser" % (idx, k), covert_row(x0, x1, lead, d0 * 0.5, d1 * 0.5, sc + 3, 0.0115 + 0.001 * k), fr, "covert", tag + "covert.%d" % k)
        add("wing%d_edge_%d" % (idx, k), strip(-0.002, (ARM + 0.006, FOREARM + 0.006, HAND)[k], lead, 0.011, 0.0135 + 0.001 * k), fr, "edge", tag + ("shoulder", "elbow", "wrist")[k])

build_body()
build_beak()
build_eyes()
build_tail()
build_legs()
for idx, w in enumerate(SK["wings"]):
    build_wing(w, idx)

RESULT = {"parts": len(COL.objects), "triangles": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COL.objects)}
