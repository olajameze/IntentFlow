import { rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [
  { path: join(webRoot, ".next"), label: ".next" },
  { path: join(webRoot, ".next-dev"), label: ".next-dev" },
  {
    path: join(webRoot, "node_modules", ".cache"),
    label: "node_modules/.cache",
  },
];

let removed = 0;
for (const { path, label } of dirs) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`Removed ${label}`);
    removed++;
  }
}
if (removed === 0) {
  console.log("Nothing to clean (already absent)");
}
