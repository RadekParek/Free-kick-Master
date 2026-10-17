import { Group, Object3D } from 'three';
import { DeferredBone } from './deferred-bone';
import { keeperPose, wallPose, type MotionRig } from './animation';
import type { KeeperState } from './keeper';
import { BALL_RADIUS } from './physics-math';
import type { Vec3, WallPlayer } from './physics';
import { RIG_REST, type PoseMetrics } from './skeleton-layout';

const clampUnit = (x: number) => Math.max(0, Math.min(1, x));

/** Mesh-free forward kinematics. No canvas, scene rendering, geometry cloning or per-tick allocation.
 * Capsules follow BOTH arms, fingers, feet, knees, shoulders and skull, not an oversized save ellipse.
 * A broad phase in physics avoids posing bodies while the ball is elsewhere on the pitch.
 */
export class BodyColliders {
  readonly group = new Group();
  readonly model = new Group();
  readonly rig: MotionRig;
  readonly capsules = new Float64Array(16 * 7);
  private count = 0;
  private readonly limbs: Object3D[][];
  private readonly bounds = new Float64Array(16 * 6);
  private readonly axes = new Float64Array(16 * 4);
  private scale = 1;
  constructor() {
    this.group.add(this.model);
    const bones = {} as Record<keyof typeof RIG_REST, Object3D>;
    for (const [name, position] of Object.entries(RIG_REST)) {
      const bone = new DeferredBone();
      bone.name = name;
      bone.position.fromArray(position);
      bones[name as keyof typeof RIG_REST] = bone;
    }
    this.model.add(bones.body);
    bones.body.add(
      bones.head,
      bones.leftLeg,
      bones.rightLeg,
      bones.leftArm,
      bones.rightArm,
    );
    bones.leftLeg.add(bones.leftShin);
    bones.rightLeg.add(bones.rightShin);
    bones.leftShin.add(bones.leftFoot);
    bones.rightShin.add(bones.rightFoot);
    bones.leftArm.add(bones.leftForearm);
    bones.rightArm.add(bones.rightForearm);
    const torso = new Object3D();
    bones.body.add(torso);
    this.rig = { ...bones, torso };
    this.limbs = [
      [bones.leftLeg, bones.leftShin, bones.leftFoot, bones.leftArm, bones.leftForearm],
      [bones.rightLeg, bones.rightShin, bones.rightFoot, bones.rightArm, bones.rightForearm],
    ];
  }
  private configure(
    x: number,
    z: number,
    yaw: number,
    height: number,
    metrics?: PoseMetrics,
  ) {
    // Live gameplay supplies measured template metrics, including the procedural fallback.
    this.scale = metrics?.scale ?? height / 1.726;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    this.group.scale.y = metrics?.yScale ?? 1;
    this.model.position.y = metrics?.rootY ?? -0.026 * this.scale;
    this.rig.body.scale.setScalar(this.scale);
  }
  keeper(k: KeeperState, time: number) {
    this.configure(k.x, 0.7, k.yaw ?? Math.PI, 1.9, k.metrics);
    keeperPose(this.rig, k, time);
    this.build(true);
    return this;
  }
  wall(p: WallPlayer, jump: number, time: number) {
    this.configure(p.x, p.z, p.yaw ?? Math.PI, 1.83, p.metrics);
    this.group.scale.y = p.metrics?.yScale ?? (p.height ?? 1.83) / 1.83;
    wallPose(this.rig, jump, time);
    this.build(false);
    return this;
  }
  private capsule(
    bone: Object3D,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    r: number,
  ) {
    const e = bone.matrixWorld.elements, n = this.count++, i = n * 7, d = this.capsules;
    // Object3D world matrices are affine. Avoid 32 temporary Vector3 transforms and divisions.
    d[i] = e[0] * ax + e[4] * ay + e[8] * az + e[12];
    d[i + 1] = e[1] * ax + e[5] * ay + e[9] * az + e[13];
    d[i + 2] = e[2] * ax + e[6] * ay + e[10] * az + e[14];
    d[i + 3] = e[0] * bx + e[4] * by + e[8] * bz + e[12];
    d[i + 4] = e[1] * bx + e[5] * by + e[9] * bz + e[13];
    d[i + 5] = e[2] * bx + e[6] * by + e[10] * bz + e[14];
    d[i + 6] = r * this.scale;
    const j = n * 4, axis = this.axes;
    const vx = axis[j] = d[i + 3] - d[i], vy = axis[j + 1] = d[i + 4] - d[i + 1], vz = axis[j + 2] = d[i + 5] - d[i + 2];
    axis[j + 3] = vx * vx + vy * vy + vz * vz;
    // Conservative closed bounds, including a roundoff guard. Never replace exact contacts.
    const k = n * 6, bounds = this.bounds, radius = d[i + 6] + BALL_RADIUS + 1e-12;
    bounds[k] = Math.min(d[i], d[i + 3]) - radius;
    bounds[k + 1] = Math.max(d[i], d[i + 3]) + radius;
    bounds[k + 2] = Math.min(d[i + 1], d[i + 4]) - radius;
    bounds[k + 3] = Math.max(d[i + 1], d[i + 4]) + radius;
    bounds[k + 4] = Math.min(d[i + 2], d[i + 5]) - radius;
    bounds[k + 5] = Math.max(d[i + 2], d[i + 5]) + radius;
  }
  private build(keeper: boolean) {
    this.group.updateMatrixWorld(true);
    this.count = 0;
    const r = this.rig;
    this.capsule(r.head, 0, 0.16, -0.015, 0, 0.21, -0.015, 0.11);
    this.capsule(r.body, 0, 1.1, 0, 0, 1.3, 0, 0.172);
    this.capsule(r.body, -0.12, 1.34, 0, 0.12, 1.34, 0, 0.1);
    this.capsule(r.body, 0, 0.88, 0, 0, 0.99, 0, 0.151);
    for (const limb of this.limbs) {
      this.capsule(limb[0], 0, -0.04, 0, 0, -0.39, 0, 0.073);
      this.capsule(limb[1], 0, -0.03, 0, 0, -0.33, 0, 0.052);
      this.capsule(limb[2], 0, -0.02, 0.025, 0, -0.02, -0.13, 0.047);
      this.capsule(limb[3], 0, 0, 0, 0, -0.27, 0, 0.058);
      this.capsule(limb[4], 0, 0, 0, 0, -0.22, 0, 0.041);
      this.capsule(
        limb[4],
        0,
        -0.25,
        -0.006,
        0,
        -0.32,
        -0.006,
        keeper ? 0.05 : 0.035,
      );
    }
  }
  hits(a: Vec3, b: Vec3): boolean {
    const d = this.capsules, bounds = this.bounds, axes = this.axes;
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x),
      minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y),
      minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, A = ux * ux + uy * uy + uz * uz;
    for (let n = 0; n < this.count; n++) {
      const k = n * 6;
      if (minX > bounds[k + 1] || maxX < bounds[k] || minY > bounds[k + 3] || maxY < bounds[k + 2] || minZ > bounds[k + 5] || maxZ < bounds[k + 4]) continue;
      const i = n * 7, j = n * 4, radius = d[i + 6] + BALL_RADIUS;
      if (distanceSquared(a, d, i, ux, uy, uz, A, axes[j], axes[j + 1], axes[j + 2], axes[j + 3]) <= radius * radius) return true;
    }
    return false;
  }
}

/** Closest distance between two finite segments (Ericson); includes point/parallel/zero-length cases. */
export function segmentDistanceSquared(
  a: Vec3,
  b: Vec3,
  d: Float64Array,
  i: number,
): number {
  const ux = b.x - a.x,
    uy = b.y - a.y,
    uz = b.z - a.z,
    vx = d[i + 3] - d[i],
    vy = d[i + 4] - d[i + 1],
    vz = d[i + 5] - d[i + 2];
  return distanceSquared(a, d, i, ux, uy, uz, ux * ux + uy * uy + uz * uz, vx, vy, vz, vx * vx + vy * vy + vz * vz);
}
function distanceSquared(a: Vec3, d: Float64Array, i: number, ux: number, uy: number, uz: number, A: number, vx: number, vy: number, vz: number, C: number): number {
  const wx = a.x - d[i],
    wy = a.y - d[i + 1],
    wz = a.z - d[i + 2];
  const B = ux * vx + uy * vy + uz * vz,
    D = ux * wx + uy * wy + uz * wz,
    E = vx * wx + vy * wy + vz * wz;
  let s = 0,
    t = 0;
  if (A < 1e-12) t = C > 1e-12 ? clampUnit(E / C) : 0;
  else if (C < 1e-12) s = clampUnit(-D / A);
  else {
    const denom = A * C - B * B;
    s = denom > 1e-12 ? clampUnit((B * E - C * D) / denom) : 0;
    t = (B * s + E) / C;
    if (t < 0) {
      t = 0;
      s = clampUnit(-D / A);
    } else if (t > 1) {
      t = 1;
      s = clampUnit((B - D) / A);
    }
  }
  return (
    (wx + s * ux - t * vx) ** 2 +
    (wy + s * uy - t * vy) ** 2 +
    (wz + s * uz - t * vz) ** 2
  );
}
const keeperBody = new BodyColliders(),
  wallBody = new BodyColliders();
export const keeperBodyHits = (
  a: Vec3,
  b: Vec3,
  k: KeeperState,
  time: number,
) => keeperBody.keeper(k, time).hits(a, b);
export const wallBodyHits = (
  a: Vec3,
  b: Vec3,
  p: WallPlayer,
  jump: number,
  time: number,
) => wallBody.wall(p, jump, time).hits(a, b);
