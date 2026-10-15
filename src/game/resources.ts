import * as THREE from 'three';

/** Dispose shared scene allocations once. Render-target textures belong to their owner. */
export function disposeSceneResources(scene: THREE.Object3D, ownedElsewhere = new Set<THREE.Texture>()) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    // InstancedMesh owns instance buffers in addition to its shared geometry/material.
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight || object instanceof THREE.PointLight) object.shadow.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) if (!ownedElsewhere.has(texture)) texture.dispose();
}
