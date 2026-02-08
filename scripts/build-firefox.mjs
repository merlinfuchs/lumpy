import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  const root = process.cwd();
  const distDir = path.join(root, "dist");
  const outDir = path.join(root, "firefox-dist");
  const artifactsDir = path.join(root, "artifacts");
  const zipOut = path.join(artifactsDir, "lumpy-firefox.zip");

  // Build first (keeps this script as a single command).
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (!(await pathExists(distDir))) {
    throw new Error('Missing "dist/" directory after build.');
  }

  await copyDir(distDir, outDir);

  const manifestFile = path.join(outDir, "manifest.json");
  const raw = await fs.readFile(manifestFile, "utf8");
  const manifest = JSON.parse(raw);

  manifest.background ??= {};
  if (!Array.isArray(manifest.background.scripts)) {
    // Add background script fallback for older Firefox versions.
    manifest.background.scripts = ["js/background.js"];
  }

  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.rm(zipOut, { force: true });

  // Create a zip with manifest.json at the root (AMO accepts zip uploads).
  execFileSync("zip", ["-r", zipOut, "."], {
    cwd: outDir,
    stdio: "inherit",
  });

  console.log(`\nCreated ${path.relative(root, zipOut)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

