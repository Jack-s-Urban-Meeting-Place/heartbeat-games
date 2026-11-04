"""
blender/export_cat.py: writes the cat built in Blender (blender/build_cat.py) to games/lib/cat-model.js
(HG.catModel), which games/lib/cat.js wraps round its skeleton. See blender/export_model.py.

Run it in Blender after build_cat.py (or after editing the parts by hand):
    PROJECT = r"C:/path/to/HeartbeatGames"
    exec(open(PROJECT + "/blender/export_cat.py").read())
"""
import os
PROJECT = globals().get("PROJECT")
COLLECTION, VAR, PREFIX, SOURCE, EXPORTER = "Cat v2", "catModel", "cat_", "build_cat.py", "export_cat.py"
OUT = os.path.join(PROJECT, "games", "lib", "cat-model.js")
# The pictures: each part's tabby colours, the eyes, and one bump picture of fine fur for all the fur.
MATERIAL_TEXTURES = {"body": "cat_body", "head": "cat_head", "tail": "cat_tail", "leg": "cat_leg", "tuft": "cat_tuft",
                     "eye": "cat_eye", "furBump": "cat_fur_bump"}
exec(open(os.path.join(PROJECT, "blender", "export_model.py")).read(), globals())
