// Bundles scripts/web-demo/build.ts with esbuild (so it can import the plugin's TypeScript
// modules) and runs it. Output: ../docs/demo/index.html. Usage: npm run web-demo
import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", ".tmp", "build-web-demo.cjs");
fs.mkdirSync(path.dirname(out), { recursive: true });
await esbuild.build({
  entryPoints: [path.join(here, "web-demo", "build.ts")],
  bundle: true,
  outfile: out,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  logLevel: "warning",
});
execFileSync(process.execPath, [out], { stdio: "inherit", env: { ...process.env, WEB_DEMO_SRC: path.join(here, "web-demo") } });
