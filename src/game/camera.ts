/** A dolly-back + longer lens keeps the foreground framing while enlarging distant subjects.
 * No mesh scaling, fake depth, extra render target or post-process zoom is involved.
 */
export function broadcastLens(width: number, height: number) {
  const portrait = width < height;
  const fov = portrait ? 38 : height < 500 ? 28 : 24;
  const oldFov = portrait ? 50 : height < 500 ? 40 : 35;
  const oldBack = portrait ? 13.2 : 9.7;
  const ratio = Math.tan(oldFov * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
  return { fov, back: 4.8 + (oldBack - 4.8) * ratio, compression: ratio };
}
