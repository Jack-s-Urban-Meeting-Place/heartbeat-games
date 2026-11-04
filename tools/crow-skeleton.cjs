// tools/crow-skeleton.cjs: put the crow (games/lib/crow.js) in its "bind pose" (wings straight out,
// fingers spread, tail half fanned, legs down) and write every joint's world matrix to JSON,
// so the Blender model can be built exactly on the skeleton.
//   node tools/crow-skeleton.cjs . blender/crow-skeleton.json
// Run it again if the skeleton in crow.js changes, then rebuild the model in Blender.
const path = require("path"), fs = require("fs"), vm = require("vm");
const [root, out] = process.argv.slice(2);
global.THREE = require(path.join(root, "js", "vendor", "three.min.js"));
global.HG = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "games", "lib", "crow.js"), "utf8"));
const crow = new HG.Crow({});
const wing = { up: 0, sweep: 0, twist: 0, elbow: 0, wrist: 0, handUp: 0, spread: 1 };
crow.apply({
  body: { pitch: 0, roll: 0, bob: 0 }, head: { pitch: 0, yaw: 0, level: 0 },
  tail: { spread: 0.5, pitch: 0, twist: 0 }, legs: { extend: 1, reach: 0 }, beak: 0,
  wings: [{ ...wing }, { ...wing }]
});
crow.root.updateMatrixWorld(true);
const m = (o) => Array.from(o.matrixWorld.elements);   // column-major 4x4, three.js space (y up, facing -z)
const joints = {
  body: m(crow.body), head: m(crow.head), beakTop: m(crow.beakTop), beakLow: m(crow.beakLow), tail: m(crow.tail),
  tailFeathers: crow.tailFeathers.map((f) => m(f.holder)),
  legs: crow.legs.map((l) => ({ hip: m(l.hip), foot: m(l.foot) })),
  wings: crow.wings.map((w) => ({
    side: w.side, shoulder: m(w.shoulder), elbow: m(w.elbow), wrist: m(w.wrist),
    tertials: w.tertials.map(m), secondaries: w.secondaries.map(m), primaries: w.primaries.map(m)
  }))
};
fs.writeFileSync(out, JSON.stringify(joints));
console.log("Wrote", out, "-", Object.keys(joints).join(", "));
