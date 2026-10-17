// Rebuild the original UI preview from the same direction-space pattern as the 3D ball.
// Node 22 + Python/Pillow; PYTHON can name a virtualenv interpreter.
// node --experimental-strip-types scripts/generate-contact-ball.mjs
import { surfacePixel } from "../src/game/ball-surface.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const n = 256,
  color = new Uint8ClampedArray(n * n * 4),
  relief = new Uint8ClampedArray(color.length);
for (let y = 0; y < n; y++)
  for (let x = 0; x < n; x++) {
    const nx = (x - n / 2) / (n * 0.45),
      ny = (n / 2 - y) / (n * 0.45),
      q = nx * nx + ny * ny,
      index = (y * n + x) * 4;
    if (q > 1) continue;
    const nz = -Math.sqrt(1 - q);
    surfacePixel(nx, ny, nz, color, relief, index);
    const shade = 0.46 + 0.54 * Math.max(0, -nx * 0.35 + ny * 0.5 - nz * 0.79);
    const specular =
      Math.pow(Math.max(0, -nx * 0.23 + ny * 0.35 - nz * 0.908), 34) * 48;
    for (let channel = 0; channel < 3; channel++)
      color[index + channel] = color[index + channel] * shade + specular;
  }
mkdirSync(".artifacts", { recursive: true });
writeFileSync(".artifacts/contact-ball.rgba", color);
const result = spawnSync(
  process.env.PYTHON || "python3",
  [
    "-c",
    `from pathlib import Path
from PIL import Image
Image.frombytes('RGBA',(256,256),Path('.artifacts/contact-ball.rgba').read_bytes()).save('public/textures/contact-ball.webp',quality=92)
`,
  ],
  { stdio: "inherit" },
);
if (result.error || result.status !== 0) {
  console.error(
    "Install Pillow in a Python environment and set PYTHON to its interpreter.",
  );
  process.exit(1);
}
