"""
blender/export_chameleon.py: writes the chameleon built in Blender (blender/build_chameleon.py) to
games/lib/chameleon-model.js (HG.chameleonModel), which games/lib/chameleon.js wraps round its
skeleton. See blender/export_model.py.

Run it in Blender after build_chameleon.py (or after editing the parts by hand):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/export_chameleon.py").read())
"""
import os
PROJECT = globals().get("PROJECT")
COLLECTION, VAR, PREFIX, SOURCE, EXPORTER = "Chameleon v2", "chameleonModel", "cham_", "build_chameleon.py", "export_chameleon.py"
OUT = os.path.join(PROJECT, "games", "lib", "chameleon-model.js")
# Which pictures each material uses: its colour picture (where it has markings), and its bump picture (soft scales).
MATERIAL_TEXTURES = {
    "skin": "cham_skin", "skinBump": "cham_skin_bump", "headBump": "cham_head_bump",
    "limbBump": "cham_limb_bump", "tail": "cham_tail", "tailBump": "cham_tail_bump", "eye": "cham_eye",
}
exec(open(os.path.join(PROJECT, "blender", "export_model.py")).read(), globals())
