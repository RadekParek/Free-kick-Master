/** Offline, deterministic spherical 32-panel pattern: twelve dark pentagons, twenty light panels.
 * Angular Voronoi seams remain continuous at the UV wrap (no pasted triangular grid). */
export function footballSurface(width = 512, height = 256) {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
  const faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const centres = [...vertices, ...faces.map(face => [0,1,2].map(axis => face.reduce((sum, v) => sum + vertices[v][axis], 0)))].map(v => { const n = Math.hypot(...v); return v.map(x => x / n); });
  const color = new Uint8ClampedArray(width * height * 4), relief = new Uint8ClampedArray(color.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = (x + .5) / width * Math.PI * 2, theta = (y + .5) / height * Math.PI;
    const nx = -Math.cos(phi) * Math.sin(theta), ny = Math.cos(theta), nz = Math.sin(phi) * Math.sin(theta);
    let best = -2, next = -2, panel = 0;
    centres.forEach((c, i) => { const dot = nx*c[0] + ny*c[1] + nz*c[2]; if (dot > best) { next = best; best = dot; panel = i; } else next = Math.max(next, dot); });
    const seam = best - next < .0035, grain = ((x * 13 + y * 7) % 5) - 2;
    const rgb = seam ? [74,78,76] : panel < 12 ? [24,31,35] : [235,236,226];
    const index = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) { color[index+c] = rgb[c] + grain; relief[index+c] = (seam ? 88 : 150) + grain * 2; }
    color[index+3] = relief[index+3] = 255;
  }
  return { color, relief };
}
