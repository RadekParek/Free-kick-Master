import * as THREE from "three";
/** Euler animation commonly writes x/y/z separately. Derive its quaternion once per pose,
 * or before an intervening localToWorld/updateMatrix (keeper glove alignment). Direct
 * quaternion writes retain Three's usual quaternion->Euler synchronization. */
export class DeferredBone extends THREE.Group {
  private dirty = false;
  constructor() {
    super();
    this.rotation._onChange(() => {
      this.dirty = true;
    });
  }
  flushRotation() {
    if (this.dirty) {
      this.quaternion.setFromEuler(this.rotation, false);
      this.dirty = false;
    }
  }
  override updateMatrix() {
    this.flushRotation();
    super.updateMatrix();
  }
}
