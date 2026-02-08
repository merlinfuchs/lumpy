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

async function main() {
  const root = process.cwd();
  const distDir = path.join(root, "dist");
  const artifactsDir = path.join(root, "artifacts");
  const zipOut = path.join(artifactsDir, "lumpy-chrome.zip");

  if (process.env.SKIP_BUILD !== "1") {
    execFileSync("npm", ["run", "build"], {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }

  if (!(await pathExists(distDir))) {
    throw new Error('Missing "dist/" directory. Run `npm run build` first.');
  }

  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.rm(zipOut, { force: true });

  // Create a zip with manifest.json at the root.
  execFileSync("zip", ["-r", zipOut, "."], {
    cwd: distDir,
    stdio: "inherit",
  });

  console.log(`\nCreated ${path.relative(root, zipOut)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

