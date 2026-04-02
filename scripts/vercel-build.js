const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "frontend", "index.html");
const outDir = path.join(root, "public");
const outFile = path.join(outDir, "index.html");

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, outFile);
console.log("vercel-build: frontend/index.html -> public/index.html");
