/**
 * Hostinger / CI: legt data/ neben package.json an — unabhängig vom aktuellen cwd.
 */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");

try {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("build: ok —", dataDir);
  process.exit(0);
} catch (err) {
  console.error("build: failed —", err && err.message ? err.message : err);
  process.exit(1);
}
