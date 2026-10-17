import type { Aim, Foot, Position } from "./physics";
/** Deterministic shot-local camera family: left/right approach, wide-angle tracking and entry.
 * No actor scaling, random cuts or dependence on mutable rendering frame rate. */
export function replayView(position: Position, aim: Aim, foot: Foot) {
  const angle = Math.atan2(aim.x - position.x, position.z);
  const side =
    Math.abs(position.x) > 0.8
      ? position.x > 0
        ? -1
        : 1
      : foot === "right"
        ? 1
        : -1;
  return { side, angle, wide: Math.abs(angle) > 0.27 };
}
