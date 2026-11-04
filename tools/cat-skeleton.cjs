// tools/cat-skeleton.cjs: put the cat (games/lib/cat.js) in its "bind pose" (standing, tail out
// behind and a little up, eyes open, mouth shut) and write every joint's world matrix to JSON,
// so the Blender model can be built exactly on the skeleton.
//   node tools/cat-skeleton.cjs . blender/cat-skeleton.json
// Run it again if the skeleton in cat.js changes, then rebuild the model in Blender.
const path = require("path"), fs = require("fs"), vm = require("vm");
const root = path.resolve(process.argv[2] || "."), out = process.argv[3];
global.THREE = require(path.join(root, "js", "vendor", "three.min.js"));
global.HG = {};
for (const f of ["creature-kit.js", "cat.js"]) vm.runInThisContext(fs.readFileSync(path.join(root, "games", "lib", f), "utf8"));
const cat = new HG.Cat({ model: "v1" });
cat.bindPose();
cat.root.updateMatrixWorld(true);
// Column-major 4x4 matrices, in three.js space (y up, the cat facing -z).
const joints = {};
for (const [name, j] of Object.entries(cat.joints)) joints[name] = Array.from(j.matrixWorld.elements);
const legs = cat.legs.map((l) => ({ a: l.spec.a, b: l.spec.b, front: l.spec.front }));
fs.writeFileSync(out, JSON.stringify({ joints, legs }));
console.log("Wrote", out, "-", Object.keys(joints).length, "joints");
