import { Group, Object3D, Vector3 } from 'three';
import { DeferredBone } from './deferred-bone';
import { keeperPose, wallPose, type MotionRig } from './animation';
import type { KeeperState } from './keeper';
import { BALL_RADIUS } from './physics-math';
import type { Vec3, WallPlayer } from './physics';
import { RIG_REST, type PoseMetrics } from './skeleton-layout';

const SIDES = ['left', 'right'] as const;
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
  private readonly a = new Vector3();
  private readonly b = new Vector3();
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
    this.a.set(ax, ay, az).applyMatrix4(bone.matrixWorld);
    this.b.set(bx, by, bz).applyMatrix4(bone.matrixWorld);
    const i = this.count++ * 7,
      d = this.capsules;
    d[i] = this.a.x;
    d[i + 1] = this.a.y;
    d[i + 2] = this.a.z;
    d[i + 3] = this.b.x;
    d[i + 4] = this.b.y;
    d[i + 5] = this.b.z;
    d[i + 6] = r * this.scale;
  }
  private build(keeper: boolean) {
    this.group.updateMatrixWorld(true);
    this.count = 0;
    const r = this.rig;
    this.capsule(r.head, 0, 0.16, -0.015, 0, 0.21, -0.015, 0.11);
    this.capsule(r.body, 0, 1.1, 0, 0, 1.3, 0, 0.172);
    this.capsule(r.body, -0.12, 1.34, 0, 0.12, 1.34, 0, 0.1);
    this.capsule(r.body, 0, 0.88, 0, 0, 0.99, 0, 0.151);
    for (const side of SIDES) {
      this.capsule(r[`${side}Leg`], 0, -0.04, 0, 0, -0.39, 0, 0.073);
      this.capsule(r[`${side}Shin`], 0, -0.03, 0, 0, -0.33, 0, 0.052);
      this.capsule(r[`${side}Foot`]!, 0, -0.02, 0.025, 0, -0.02, -0.13, 0.047);
      this.capsule(r[`${side}Arm`], 0, 0, 0, 0, -0.27, 0, 0.058);
      this.capsule(r[`${side}Forearm`], 0, 0, 0, 0, -0.22, 0, 0.041);
      this.capsule(
        r[`${side}Forearm`],
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
    const d = this.capsules;
    for (let i = 0; i < this.count * 7; i += 7) {
      const radius = d[i + 6] + BALL_RADIUS;
      if (segmentDistanceSquared(a, b, d, i) <= radius * radius) return true;
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
  const wx = a.x - d[i],
    wy = a.y - d[i + 1],
    wz = a.z - d[i + 2];
  const A = ux * ux + uy * uy + uz * uz,
    B = ux * vx + uy * vy + uz * vz,
    C = vx * vx + vy * vy + vz * vz,
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
