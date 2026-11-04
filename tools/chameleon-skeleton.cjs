// tools/chameleon-skeleton.cjs: put the chameleon (games/lib/chameleon.js) in its "bind pose"
// (standing still, feet at rest, tail straight down, eyes ahead) and write every joint's world
// matrix to JSON, so the Blender model can be built exactly on the skeleton.
//   node tools/chameleon-skeleton.cjs . blender/chameleon-skeleton.json
// Run it again if the skeleton in chameleon.js changes, then rebuild the model in Blender.
const path = require("path"), fs = require("fs"), vm = require("vm");
const root = path.resolve(process.argv[2] || "."), out = process.argv[3];
global.THREE = require(path.join(root, "js", "vendor", "three.min.js"));
global.HG = {};
for (const f of ["creature-kit.js", "chameleon.js"]) vm.runInThisContext(fs.readFileSync(path.join(root, "games", "lib", f), "utf8"));
const cham = new HG.Chameleon({ model: "v1" });
cham.bindPose();
cham.root.updateMatrixWorld(true);
// Column-major 4x4 matrices, in three.js space (y up the wall, z out of the wall toward the camera).
const joints = {};
for (const [name, j] of Object.entries(cham.joints)) joints[name] = Array.from(j.matrixWorld.elements);
const legs = cham.legs.map((l) => ({ a: l.spec.a, b: l.spec.b }));
fs.writeFileSync(out, JSON.stringify({ joints, legs }));
console.log("Wrote", out, "-", Object.keys(joints).length, "joints");
