// Launches Vitest with a normalised working directory.
// Windows quirk: terminals opened by VS Code may report the drive as lowercase "c:\",
// which makes Vitest load two copies of itself ("failed to find the current suite").
import { spawnSync } from "node:child_process";

let cwd = process.cwd();
if (process.platform === "win32" && /^[a-z]:/.test(cwd)) cwd = cwd[0].toUpperCase() + cwd.slice(1);
const bin = `${cwd}/node_modules/vitest/vitest.mjs`;
const res = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(res.status ?? 1);
