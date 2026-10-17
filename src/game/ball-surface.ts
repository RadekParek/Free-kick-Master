/** Original unbranded four-panel ball. Flowing red, blue and green ribbons and warm
 * metallic seam pinstripes evoke contemporary match balls; no copied logo or artwork.
 * Direction-space sampling keeps the UV wrap continuous. Shared with the UI ball asset.
 */
const seamColor = [76, 67, 52],
  goldColor = [195, 161, 89],
  outlineColor = [26, 43, 58],
  whiteColor = [241, 243, 238];
const colors = [
  [22, 38, 57],
  [211, 47, 57],
  [31, 104, 184],
  [32, 145, 106],
];
export function surfacePixel(
  nx: number,
  ny: number,
  nz: number,
  color: Uint8ClampedArray,
  relief: Uint8ClampedArray,
  index: number,
) {
  let best = -4,
    next = -4,
    panel = 0;
  for (let i = 0; i < 4; i++) {
    const d =
      i === 0
        ? nx + ny + nz
        : i === 1
          ? nx - ny - nz
          : i === 2
            ? -nx + ny - nz
            : -nx - ny + nz;
    if (d > best) {
      next = best;
      best = d;
      panel = i;
    } else if (d > next) next = d;
  }
  const edge = best - next,
    seam = edge < 0.014;
  const ribbon = Math.abs(
    Math.sin(Math.atan2(nz, nx) * 3 + ny * 1.6 + nx * nz * 1.8),
  );
  const ink = ribbon < 0.3,
    outline = ribbon < 0.35,
    gold = edge < 0.036;
  const rgb = seam
    ? seamColor
    : gold
      ? goldColor
      : ink
        ? colors[panel]
        : outline
          ? outlineColor
          : whiteColor;
  const grain = Math.sin(nx * 310 + ny * 91) * Math.sin(nz * 275 - ny * 111);
  for (let c = 0; c < 3; c++) {
    color[index + c] = rgb[c] + grain * 1.4;
    relief[index + c] = (seam ? 92 : 150) + grain * 3;
  }
  color[index + 3] = relief[index + 3] = 255;
}
export function footballSurface(width = 512, height = 256) {
  const color = new Uint8ClampedArray(width * height * 4),
    relief = new Uint8ClampedArray(color.length);
  // Latitudes/longitudes are separable: no repeated per-pixel trig for sphere construction.
  const sx = new Float64Array(width),
    sz = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const phi = ((x + 0.5) / width) * Math.PI * 2;
    sx[x] = -Math.cos(phi);
    sz[x] = Math.sin(phi);
  }
  for (let y = 0; y < height; y++) {
    const theta = ((y + 0.5) / height) * Math.PI,
      st = Math.sin(theta),
      ny = Math.cos(theta);
    for (let x = 0; x < width; x++)
      surfacePixel(
        sx[x] * st,
        ny,
        sz[x] * st,
        color,
        relief,
        (y * width + x) * 4,
      );
  }
  return { color, relief };
}
