"use strict";

const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "admin_panel", "dist");
const dest = path.join(__dirname, "..", "public", "panel");

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.warn("[sync-admin] admin_panel/dist missing — run Vite build first; skipping copy");
  process.exit(0);
}

function copyRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, ent.name);
    const t = path.join(to, ent.name);
    if (ent.isDirectory()) copyRecursive(f, t);
    else fs.copyFileSync(f, t);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
copyRecursive(src, dest);
console.log("[sync-admin] copied admin_panel/dist → public/panel");
