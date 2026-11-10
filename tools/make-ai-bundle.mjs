// ============================================================================
// make-ai-bundle.mjs: put the whole project into one text file for AI tools
// ----------------------------------------------------------------------------
// Some AI tools take only one upload, or skip folders. This writes
// HEARTBEAT-GAMES-BUNDLE.md: every document and source file, in a sensible reading
// order, each under a heading with its path, plus a list of the pictures and the
// files left out (large libraries, third-party files, licences).
//
//   node tools/make-ai-bundle.mjs
//
// Run it whenever you ship a change. Needs only Node.js (no packages).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "HEARTBEAT-GAMES-BUNDLE.md";

// Reading order: the guides first, then how a game is made, then the code from the
// shell outwards. Anything else that's text and not excluded is added at the end.
const ORDER = [
  "AGENTS.md", "README.md", "READ ME FIRST.txt", "llms.txt",
  "docs/making-games/README.md", "docs/making-games/storyboards.md",
  "docs/making-games/sensor-and-feel.md", "docs/making-games/testing.md",
  "storyboards/fly-together/README.md", "storyboards/climb-together/README.md", "storyboards/crow-model/README.md", "streamdeck/README.txt",
  "config.js", "heartbeat-games.html", "js/app.js", "js/sensor.js",
  "games/fly-together.js", "games/lib/flight.js", "games/lib/flight3d.js", "games/lib/crow.js", "games/lib/photo-finish.js", "games/lib/glow.js",
  "games/climb-together.js", "games/lib/climb3d.js", "games/lib/chameleon.js", "games/lib/cat.js", "games/lib/creature-kit.js",
  "blender/build_crow.py", "blender/export_crow.py", "tools/crow-skeleton.cjs",
  "blender/build_chameleon.py", "blender/export_chameleon.py", "tools/chameleon-skeleton.cjs", "storyboards/chameleon-model/README.md",
  "blender/model_kit.py", "blender/export_model.py", "blender/build_cat.py", "blender/export_cat.py", "tools/cat-skeleton.cjs", "storyboards/cat-model/README.md",
  "games/examples/game-template.js",
  "heartbeat-launcher.ahk", "setup.bat", "setup.ps1",
  "tools/try-game.mjs", "tools/Game-Lab.html", "tools/game-lab/lab.js", "tools/game-lab/catalog.js", "tools/game-lab/stages.js",
  "tools/game-lab/orbit.js", "tools/game-lab/marks.js", "lab-notes/README.md", "tools/make-ai-bundle.mjs", "tools/ABOUT-TOOLS.txt"
];
// Never included: generated, private, third-party or too large to be useful.
const SKIP_DIRS = ["node_modules", "chrome-profile", "test-output", ".git", "unpublished", "references", "archive"];
const SKIP_FILES = [OUT, "UIA.ahk", "three.min.js", "heartbeat-log.txt", "package.json", "package-lock.json", "CLAUDE.md"];
// Listed by name only, to keep the bundle small enough for most AI tools: the sensor
// troubleshooting pages and old helper scripts, and the animals' generated model data.
const LIST_ONLY = (f) => (/^tools\/.*\.(html|ahk)$/i.test(f) && f !== "tools/Game-Lab.html")
  || f === "games/lib/crow-model.js" || f === "blender/crow-skeleton.json"
  || f === "games/lib/chameleon-model.js" || f === "blender/chameleon-skeleton.json"
  || f === "games/lib/cat-model.js" || f === "blender/cat-skeleton.json";
const TEXT = /\.(md|txt|js|mjs|cjs|py|html|css|json|ahk|ps1|bat|svg)$/i;
const LANG = { js: "js", mjs: "js", cjs: "js", py: "python", html: "html", css: "css", json: "json", ahk: "autohotkey", ps1: "powershell", bat: "bat", svg: "svg", md: "markdown", txt: "text" };

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? dir + "/" + entry.name : entry.name;
    if (entry.isDirectory()) { if (!SKIP_DIRS.includes(entry.name)) walk(rel, out); }
    else out.push(rel);
  }
  return out;
}

const all = walk("").sort();
const isLicence = (f) => /LICEN[SC]E/i.test(path.basename(f));
const included = (f) => TEXT.test(f) && !SKIP_FILES.includes(path.basename(f)) && !isLicence(f) && !LIST_ONLY(f);
const listed = all.filter(LIST_ONLY);
const files = [...ORDER.filter((f) => all.includes(f)), ...all.filter((f) => included(f) && !ORDER.includes(f))];
const pictures = all.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
const version = (fs.readFileSync(path.join(root, "js/app.js"), "utf8").match(/VERSION = "([^"]+)"/) || [])[1] || "?";

// A code fence longer than any run of backticks inside the file, so nothing breaks out.
const fenceFor = (text) => "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));

let md = `# Heartbeat Games: the whole project in one file

Version ${version}, bundled ${new Date().toISOString().slice(0, 10)} by \`tools/make-ai-bundle.mjs\`.
This is a snapshot for AI tools and readers: if it disagrees with the real files, the real files win.
Start with AGENTS.md (the first file below). Each file appears under a heading with its path.

## Contents

${files.map((f) => "- " + f).join("\n")}

## Not included as text

- **Pictures** (look at them in the project folder): ${pictures.join(", ") || "none"}.
- **Licences:** \`LICENSE\` is the MIT License (the code); \`LICENSE-ART.txt\` is CC BY-SA 4.0 (art, storyboards, docs).
- **Third-party and large files:** \`js/vendor/three.min.js\` (three.js r158, MIT) and \`UIA.ahk\` (downloaded separately).
- **By name only** (troubleshooting tools, see tools/ABOUT-TOOLS.txt; and the animals' generated model data): ${listed.join(", ")}.
- **Left out on purpose:** the old prototypes in \`games/archive/\`, private reference photos, logs and test output.
`;
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
  const fence = fenceFor(text), ext = path.extname(f).slice(1).toLowerCase();
  md += `\n---\n\n## File: ${f}\n\n${fence}${LANG[ext] || ""}\n${text.trimEnd()}\n${fence}\n`;
}
fs.writeFileSync(path.join(root, OUT), md);
console.log(`Wrote ${OUT}: ${files.length} files, ${(md.length / 1024).toFixed(0)} KB (about ${Math.round(md.length / 4 / 1000)}k tokens).`);
