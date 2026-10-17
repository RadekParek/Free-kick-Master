/** Shared numerics for physics and mesh-free pose evaluation; no renderer or DOM dependency. */
export const BALL_RADIUS = 0.11;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
