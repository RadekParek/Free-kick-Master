import * as THREE from 'three';

const heads = new Map<string, THREE.BufferGeometry>();
let pending: Promise<void> | null = null;

/** Tiny offline CC0 head assets. Preloaded once before constructing the arena, never per frame. */
export function loadHumanAnatomy(): Promise<void> {
  return pending ??= Promise.all(['high', 'low'].map(async detail => {
    const response = await fetch(`${import.meta.env.BASE_URL}models/human-head-${detail}.bin`);
    if (!response.ok) throw new Error(`Human anatomy asset failed to load: ${response.status}`);
    const geometry = decodeHumanHead(await response.arrayBuffer());
    heads.set(detail, geometry);
  })).then(() => undefined).catch(error => { pending = null; throw error; });
}

export function decodeHumanHead(data: ArrayBuffer): THREE.BufferGeometry {
  if (data.byteLength < 8) throw new Error('Truncated human mesh');
  const header = new DataView(data), vertices = header.getUint32(0, true), indices = header.getUint32(4, true);
  if (!vertices || vertices > 65535 || !indices || indices % 3 || data.byteLength !== 8 + vertices * 12 + indices * 2) throw new Error('Invalid human mesh');
  const position = new Float32Array(data, 8, vertices * 3);
  const index = new Uint16Array(data, 8 + vertices * 12, indices);
  if (position.some(value => !Number.isFinite(value)) || index.some(value => value >= vertices)) throw new Error('Invalid human mesh coordinates/indices');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const uv = new Float32Array(vertices * 2), colour = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    uv[i * 2] = x / .3 + .5; uv[i * 2 + 1] = y / .35;
    const lip = Math.exp(-((y - .116) ** 2 * 18000 + x * x * 1900)) * Math.max(0, Math.min(1, (-z - .09) * 40));
    const ao = .92 + .08 * Math.min(1, Math.max(0, y / .12));
    colour[i * 3] = ao; colour[i * 3 + 1] = ao * (1 - lip * .2); colour[i * 3 + 2] = ao * (1 - lip * .15);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  // The CC0 extraction has a single open neck boundary. Seal it under the jaw so
  // looking up or tilting the head cannot reveal the hollow interior/backfaces.
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < index.length; i += 3) for (let e = 0; e < 3; e++) {
    const a = index[i + e], b = index[i + (e + 1) % 3], key = `${Math.min(a,b)}/${Math.max(a,b)}`;
    const old = edges.get(key); if (old) old.count++; else edges.set(key, { a, b, count: 1 });
  }
  const boundary = [...edges.values()].filter(e => e.count === 1 && position[e.a*3+1] < .105 && position[e.b*3+1] < .105);
  if (boundary.length) {
    const append = (name: string, extra: number[]) => {
      const source = geometry.getAttribute(name).array;
      const array = new Float32Array(source.length + extra.length); array.set(source); array.set(extra, source.length);
      geometry.setAttribute(name, new THREE.BufferAttribute(array, extra.length));
    };
    append('position', [0, .065, .005]); append('uv', [.5, .065/.35]); append('color', [.97, .97, .97]);
    geometry.setIndex([...index, ...boundary.flatMap(e => [e.b, e.a, vertices])]);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function humanHead(detail: string): THREE.BufferGeometry | undefined {
  return heads.get(detail)?.clone();
}

export function hasHumanAnatomy(detail: string): boolean { return heads.has(detail); }
