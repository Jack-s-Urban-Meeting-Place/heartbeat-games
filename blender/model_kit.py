"""
blender/model_kit.py: shared helpers for building the games' animals in Blender.

Used by blender/build_cat.py (and handy for any new animal). A build script runs it first:
    exec(open(os.path.join(HERE, "model_kit.py")).read(), globals())
then sets up its scene with `start(scene_name, collection_name)`, its materials in MATS, and its
skeleton with `load_skeleton(path)`, and builds parts with loft() and make_mesh().

Coordinates: the numbers a build script gives are in the game's space (three.js: y up). Blender
is Z-up, so B() converts each point as it's made; the export scripts convert back.
"""
import bpy, bmesh, json, math, os, struct, zlib
import numpy as np
from mathutils import Matrix, Vector

TO_B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # three.js space -> Blender space
B = lambda p: tuple(TO_B @ Vector((p[0], p[1], p[2], 1)))[:3]
lerp = lambda a, b, t: a + (b - a) * t
smoothstep = lambda t: 0 if t <= 0 else 1 if t >= 1 else t * t * (3 - 2 * t)
J = {}                                  # the skeleton's joints (filled by load_skeleton)
MATS = {}                               # the build script's materials, by name
COL = None                              # the collection parts go in (set by start)

def load_skeleton(path):
    data = json.load(open(path)); J.clear(); J.update(data["joints"]); return data

def frame(name):
    """A joint's world matrix in the bind pose (three.js space)."""
    e = J[name]
    return Matrix(([e[0], e[4], e[8], e[12]], [e[1], e[5], e[9], e[13]], [e[2], e[6], e[10], e[14]], [0, 0, 0, 1]))

def start(scene_name, collection_name):
    """Switches to (or makes) the scene, and empties (or makes) the collection the parts go in."""
    global COL
    scene = bpy.data.scenes.get(scene_name) or bpy.data.scenes.new(scene_name)
    bpy.context.window.scene = scene
    COL = bpy.data.collections.get(collection_name)
    if COL is None:
        COL = bpy.data.collections.new(collection_name); scene.collection.children.link(COL)
    for ob in list(COL.objects):
        me = ob.data; bpy.data.objects.remove(ob)
        if me and me.users == 0: bpy.data.meshes.remove(me)
    return scene

def resample(table, n):
    """Smooths a table of rows (first column in order) into n evenly spaced rows."""
    rows = []
    for i in range(n):
        f = i / (n - 1) * (len(table) - 1)
        j = min(len(table) - 2, int(f)); u = smoothstep(f - j)
        rows.append(tuple(lerp(a, b, u) for a, b in zip(table[j], table[j + 1])))
    return rows

# ---- Pictures: written straight to small PNG files (exact, and small), then loaded for previews ----
def save_image(folder, name, value):
    """value: rows of 0..1 values (grey, h x w) or colours (h x w x 3), bottom row first as Blender stores pictures."""
    h, w = value.shape[:2]
    rgb = value.ndim == 3
    rows = (np.clip(value, 0, 1)[::-1] * 255 + 0.5).astype(np.uint8)          # PNG rows run top to bottom
    raw = b"".join(b"\x00" + rows[r].tobytes() for r in range(h))
    chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    path = os.path.join(folder, name + ".png")
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2 if rgb else 0, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    old = bpy.data.images.get(name)
    if old: bpy.data.images.remove(old)
    img = bpy.data.images.load(path); img.name = name
    return img

def grid(w, h):
    """u and v for every pixel of a w x h picture (0..1)."""
    return np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)

def noise(w, h, cells_u, cells_v, seed):
    """Smooth random values 0..1 that repeat across the picture (tileable value noise)."""
    rng = np.random.default_rng(seed)
    g = rng.random((cells_v, cells_u))
    U, V = grid(w, h)
    x, y = U * cells_u, V * cells_v
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0 % cells_v, x0 % cells_u]; b = g[y0 % cells_v, (x0 + 1) % cells_u]
    c = g[(y0 + 1) % cells_v, x0 % cells_u]; d = g[(y0 + 1) % cells_v, (x0 + 1) % cells_u]
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)

def fur_streaks(w, h, across, along, seed):
    """Fine fur: thin streaks running along v (the way the fur lies), 0..1."""
    n = noise(w, h, across, max(2, along // 6), seed) * 0.6 + noise(w, h, across * 2, max(2, along // 3), seed + 1) * 0.4
    U, V = grid(w, h)
    wobble = noise(w, h, 6, 4, seed + 2) * 2 - 1
    lines = 0.5 + 0.5 * np.sin(2 * np.pi * (U * across + wobble * 0.6))
    return np.clip(0.55 * n + 0.45 * lines, 0, 1)

def material(name, tex=None, colour=(0.6, 0.6, 0.6), roughness=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    for n in [n for n in nt.nodes if n.type == "TEX_IMAGE"]: nt.nodes.remove(n)
    if tex:
        node = nt.nodes.new("ShaderNodeTexImage"); node.image = bpy.data.images[tex]
        nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return m

# ---- Meshes ----
def make_mesh(name, verts, faces, uvs, groups, mat, smooth=True, subdivide=0):
    """verts in three.js space; uvs: one (u, v) per face corner, in face order; groups: {joint: {vertex: weight}}."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(v) for v in verts], [], faces)
    me.update()
    uv = me.uv_layers.new(name="UV")
    for i, loop_uv in enumerate(uvs): uv.data[i].uv = loop_uv
    bm = bmesh.new(); bm.from_mesh(me)                 # make every face point outward
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    for gname, weights in groups.items():
        vg = ob.vertex_groups.new(name=gname)
        for vi, w in weights.items():
            if w > 0.001: vg.add([vi], w, "REPLACE")
    if subdivide:
        mod = ob.modifiers.new("Smooth", "SUBSURF"); mod.levels = subdivide; mod.render_levels = subdivide
    return ob

def ring_around(centre, side, out, radius_side, radius_out, m, start_angle=-math.pi / 2, shape=None):
    """m points round a centre: `side` and `out` are unit directions; angle 0 points along `side`.
    shape(angle) can return (radius along side, radius along out) for each point."""
    pts = []
    for k in range(m):
        a = start_angle + 2 * math.pi * k / m
        c, s = math.cos(a), math.sin(a)
        rs, ro = (radius_side, radius_out) if shape is None else shape(a)
        pts.append(tuple(Vector(centre) + Vector(side) * c * rs + Vector(out) * s * ro))
    return pts

def loft(name, rings, mat, weights, v_scale=1.0, close_start=True, close_end=True, subdivide=0, smooth=True):
    """A tube through rings of points (each ring the same number of points, three.js space).
    weights(i) gives each ring's {joint: weight}. Texture: u around, v along (times v_scale)."""
    n, m = len(rings), len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces, uvs = [], []
    for i in range(n - 1):
        for k in range(m):
            a, b = i * m + k, i * m + (k + 1) % m
            faces.append((a, b, b + m, a + m))
            u0, u1, v0, v1 = k / m, (k + 1) / m, i / (n - 1) * v_scale, (i + 1) / (n - 1) * v_scale
            uvs += [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    groups = {}
    for i in range(n):
        for g, w in weights(i).items():
            groups.setdefault(g, {}).update({i * m + k: w for k in range(m)})
    for end, ring_i, flip in ((close_start, 0, True), (close_end, n - 1, False)):
        if not end: continue
        ring = rings[ring_i]
        centre = Vector(tuple(sum(p[c] for p in ring) / m for c in range(3)))
        other = rings[1 if ring_i == 0 else n - 2]
        oc = Vector(tuple(sum(p[c] for p in other) / m for c in range(3)))
        d = centre - oc
        r = sum((Vector(p) - centre).length for p in ring) / m
        tip = tuple(centre + d.normalized() * r * 0.6) if d.length > 1e-6 else tuple(centre)
        ci = len(verts); verts.append(tip)
        for g, w in weights(ring_i).items(): groups.setdefault(g, {})[ci] = w
        vv = 0 if ring_i == 0 else v_scale
        for k in range(m):
            a, b = ring_i * m + k, ring_i * m + (k + 1) % m
            faces.append((b, a, ci) if flip else (a, b, ci))
            uvs += [((k + 1) / m, vv), (k / m, vv), ((k + 0.5) / m, vv)] if flip else [(k / m, vv), ((k + 1) / m, vv), ((k + 0.5) / m, vv)]
    return make_mesh(name, verts, faces, uvs, groups, mat, smooth=smooth, subdivide=subdivide)

def solid(name, pts_local, faces, joint_frame, mat, groups, smooth=False, uvs=None):
    """A small solid given in a joint's own frame (three.js space), placed where that joint sits."""
    verts = [tuple(joint_frame @ Vector(p)) for p in pts_local]
    if uvs is None:
        uvs = [(0.5, 0.5)] * sum(len(f) for f in faces)
    return make_mesh(name, verts, faces, uvs, groups, mat, smooth=smooth)

def ellipsoid(centre, radii, frame_m=None, m=12, n=8):
    """Rings for a squashed ball (loft them with close_start and close_end), centred and sized in a frame."""
    rings = []
    for i in range(1, n):
        a = math.pi * i / n
        y = -math.cos(a); r = math.sin(a)
        ring = []
        for k in range(m):
            t = 2 * math.pi * k / m
            p = Vector((centre[0] + radii[0] * r * math.cos(t), centre[1] + radii[1] * r * math.sin(t), centre[2] + radii[2] * y))
            ring.append(tuple(frame_m @ p) if frame_m is not None else tuple(p))
        rings.append(ring)
    return rings
