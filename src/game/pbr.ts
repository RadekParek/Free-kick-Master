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
  // Three full-precision scanlines preserve byte output without a full-image height buffer.
  // At 1024 px wide this is 24 KiB rather than 4 MiB for the 1024×512 ball texture.
  const heights = new Float64Array(w * 3);
  const readRow = (sourceY: number, slot: number) => {
    for (let x = 0; x < w; x++) {
      const j = (sourceY * w + x) * 4;
      heights[slot * w + x] = (src[j] + src[j + 1] + src[j + 2]) / 765;
    }
  };
  readRow(0, 0);
  readRow(h - 1, 2);
  for (let y = 0; y < h; y++) {
    const row = (y % 3) * w, above = ((y + 2) % 3) * w, below = ((y + 1) % 3) * w;
    readRow((y + 1) % h, (y + 1) % 3);
    for (let x = 0; x < w; x++) {
      const dx = (heights[row + (x + 1) % w] - heights[row + (x + w - 1) % w]) * strength;
      const dy = (heights[below + x] - heights[above + x]) * strength;
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
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try {
    // Retain the target, not only its texture: its framebuffer also needs disposal.
    return pmrem.fromScene(room, 0.04);
  } finally {
    room.dispose();
    pmrem.dispose();
  }
}

/**
 * Applies the studio environment to the athletes and the ball only. Scene-wide environment lighting
 * was measurably more expensive for the large stadium surfaces with no visible gain there.
 */
export function applyStudioLight(object: THREE.Object3D, environment: THREE.Texture, intensity = 0.5) {
  const seen = new Set<THREE.MeshStandardMaterial>();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      if (material.envMap === environment && material.envMapIntensity === intensity) continue;
      material.envMap = environment;
      material.envMapIntensity = intensity;
      material.needsUpdate = true;
    }
  });
}
