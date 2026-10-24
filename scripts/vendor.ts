// Copies browser-side libraries the print page loads into packages/core/assets/vendor.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const require = createRequire(join(root, "packages/core/package.json"));
const target = join(root, "packages/core/assets/vendor");
mkdirSync(target, { recursive: true });
const mermaid = join(dirname(require.resolve("mermaid/package.json")), "dist/mermaid.min.js");
copyFileSync(mermaid, join(target, "mermaid.min.js"));
console.log(`vendored ${mermaid}`);
