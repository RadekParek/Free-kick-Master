/** Metres, shared by the visible athlete and mesh-free collision rig. */
export const RIG_REST = {
  body: [0, 0, 0],
  head: [0, 1.432, 0],
  leftLeg: [-0.096, 0.88, 0],
  rightLeg: [0.096, 0.88, 0],
  leftShin: [0, -0.42, 0],
  rightShin: [0, -0.42, 0],
  leftFoot: [0, -0.37, 0],
  rightFoot: [0, -0.37, 0],
  leftArm: [-0.19, 1.397, 0],
  rightArm: [0.19, 1.397, 0],
  leftForearm: [0, -0.29, 0],
  rightForearm: [0, -0.29, 0],
} as const;
export interface PoseMetrics {
  scale: number;
  rootY: number;
  yScale?: number;
}
