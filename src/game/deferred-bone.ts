import * as THREE from "three";
/** Euler animation commonly writes x/y/z separately. Derive its quaternion once per pose,
 * or before an intervening localToWorld/updateMatrix (keeper glove alignment). Direct
 * quaternion writes retain Three's usual quaternion->Euler synchronization. */
export class DeferredBone extends THREE.Group {
  private dirty = false;
  private lastX = 0; private lastY = 0; private lastZ = 0;
  private lastOrder: THREE.EulerOrder = 'XYZ';
  private readonly lastQuaternion = new THREE.Quaternion();
  constructor() {
    super();
    this.rotation._onChange(() => {
      this.dirty = true;
    });
  }
  flushRotation() {
    if (this.dirty) {
      const r = this.rotation, q = this.quaternion;
      if (r.x !== this.lastX || r.y !== this.lastY || r.z !== this.lastZ || r.order !== this.lastOrder || !q.equals(this.lastQuaternion)) {
        q.setFromEuler(r, false);
        this.lastX = r.x; this.lastY = r.y; this.lastZ = r.z; this.lastOrder = r.order;
        this.lastQuaternion.copy(q);
      }
      this.dirty = false;
    }
  }
  override updateMatrix() {
    this.flushRotation();
    super.updateMatrix();
  }
}
