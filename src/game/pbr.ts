import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Builds a tangent-space normal map from a canvas, using its luminance as a height field.
 * Generated once per texture and cached by the caller, so it costs nothing per frame.
 */
export function normalMapFromCanvas(source: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = source.width, h = source.height;
  const src = source.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const height = (x: number, y: number) => {
    const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / 765;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      img.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(out);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Image-based lighting from a neutral studio room. Shared by every material; generated once. */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

/**
 * Applies the studio environment to the athletes and the ball only. Scene-wide environment lighting
 * was measurably more expensive for the large stadium surfaces with no visible gain there.
 */
export function applyStudioLight(object: THREE.Object3D, environment: THREE.Texture, intensity = 0.5) {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.envMap = environment;
      material.envMapIntensity = intensity;
      material.needsUpdate = true;
    }
  });
}
