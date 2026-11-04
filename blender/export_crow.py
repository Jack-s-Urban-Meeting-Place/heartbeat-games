"""
blender/export_crow.py: writes the crow built in Blender to games/lib/crow-model.js.

The games run straight from the folder (file:///), where Chrome won't load model
files, so the model goes into an ordinary script instead: HG.crowModel, holding each
material's triangles (positions, normals, texture coordinates), which skeleton joint
("bone") each corner moves with, and the textures as embedded pictures.
games/lib/crow.js builds the bird's skeleton and drives it; this is just its skin.

Run it in Blender after blender/build_crow.py (or after editing the parts by hand):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/export_crow.py").read())
Each part in the "Crow v2" collection needs a "bone" custom property. The body can
instead have vertex groups named after joints (e.g. "body" and "head"), so it bends
smoothly at the neck.
"""
import bpy, base64, json, os, datetime
import numpy as np

PROJECT = globals().get("PROJECT") or os.path.dirname(os.path.dirname(os.path.abspath(bpy.data.filepath)))
OUT = os.path.join(PROJECT, "games", "lib", "crow-model.js")
TEXTURES = os.path.join(PROJECT, "blender", "textures")
# Which picture each material uses (materials not listed are plain colour).
MATERIAL_TEXTURES = {"plumage": "crow_plumage", "covert": "crow_covert", "feather": "crow_feather", "tip": "crow_feather"}

col = bpy.data.collections["Crow v2"]
deps = bpy.context.evaluated_depsgraph_get()
bones = []                                      # joint names, in the order the indices refer to
def bone_index(name):
    if name not in bones:
        bones.append(name)
    return bones.index(name)

groups = {}                                     # material -> lists of per-vertex data
for ob in sorted(col.objects, key=lambda o: o.name):
    if ob.type != "MESH":
        continue
    me = ob.evaluated_get(deps).to_mesh()
    me.calc_loop_triangles()
    mw = ob.matrix_world
    nmat = mw.to_3x3().inverted_safe().transposed()
    uv_layer = me.uv_layers.active
    vg_names = {vg.index: vg.name for vg in ob.vertex_groups}
    fallback = ob.get("bone")
    corner_normals = me.corner_normals
    for tri in me.loop_triangles:
        mat_name = me.materials[tri.material_index].name.replace("crow_", "") if me.materials else "plumage"
        g = groups.setdefault(mat_name, {"pos": [], "nor": [], "uv": [], "bone": [], "weight": [], "index": [], "seen": {}})
        for li in tri.loops:
            vi = me.loops[li].vertex_index
            p = mw @ me.vertices[vi].co
            n = (nmat @ corner_normals[li].vector).normalized()
            uv = tuple(uv_layer.data[li].uv) if uv_layer else (0.0, 0.0)
            # Up to two joints per corner: the strongest vertex groups, or the part's own "bone".
            weights = sorted(((vg_names[e.group], e.weight) for e in me.vertices[vi].groups if e.group in vg_names and e.weight > 0), key=lambda t: -t[1])[:2]
            if not weights:
                weights = [(fallback, 1.0)]
            total = sum(w for _, w in weights)
            b0, w0 = weights[0][0], weights[0][1] / total
            b1 = weights[1][0] if len(weights) > 1 else b0
            # three.js space: Y up, facing -Z (Blender: Z up, facing +Y).
            key = (round(p.x, 5), round(p.y, 5), round(p.z, 5), round(n.x, 3), round(n.y, 3), round(n.z, 3), round(uv[0], 4), round(uv[1], 4), b0, b1, round(w0, 3))
            idx = g["seen"].get(key)
            if idx is None:
                idx = len(g["pos"]) // 3
                g["seen"][key] = idx
                g["pos"] += [p.x, p.z, -p.y]
                g["nor"] += [n.x, n.z, -n.y]
                g["uv"] += [uv[0], uv[1]]
                g["bone"] += [bone_index(b0), bone_index(b1)]
                g["weight"].append(int(round(w0 * 255)))
            g["index"].append(idx)
    ob.evaluated_get(deps).to_mesh_clear()

b64 = lambda arr: base64.b64encode(arr.tobytes()).decode("ascii")
out_groups = []
for name in sorted(groups):
    g = groups[name]
    count = len(g["pos"]) // 3
    out_groups.append({
        "material": name, "vertices": count, "triangles": len(g["index"]) // 3,
        "position": b64(np.array(g["pos"], dtype="<f4")),
        "normal": b64(np.array(g["nor"], dtype="<f4")),
        "uv": b64(np.array(g["uv"], dtype="<f4")),
        "bones": b64(np.array(g["bone"], dtype="u1")),
        "weight": b64(np.array(g["weight"], dtype="u1")),
        "index": b64(np.array(g["index"], dtype="<u2" if count < 65536 else "<u4")),
        "index32": count >= 65536,
    })
textures = {}
for mat, img in MATERIAL_TEXTURES.items():
    path = os.path.join(TEXTURES, img + ".png")
    if mat in groups and os.path.exists(path):
        textures[mat] = "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode("ascii")

model = {"version": 2, "bones": bones, "groups": out_groups, "textures": textures}
header = (
    "// ============================================================================\n"
    "// games/lib/crow-model.js: the crow's look (version 2), made in Blender.\n"
    "// GENERATED by blender/export_crow.py on %s from the model blender/build_crow.py\n"
    "// builds. Don't edit by hand: change the model in Blender and export again.\n"
    "// games/lib/crow.js builds the skeleton and moves it; this file is the skin.\n"
    "// ============================================================================\n"
) % datetime.date.today().isoformat()
with open(OUT, "w", encoding="utf-8") as f:
    f.write(header + "HG.crowModel = " + json.dumps(model, separators=(",", ":")) + ";\n")
RESULT = {"file": OUT, "kb": round(os.path.getsize(OUT) / 1024), "bones": len(bones),
          "groups": {g["material"]: (g["vertices"], g["triangles"]) for g in out_groups}}
