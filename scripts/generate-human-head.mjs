// Offline build tool. Inputs are the CC0 MakeHuman base.obj and young adult male target.
// See public/models/README.md for pinned sources and exact reproduction commands.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

const [objPath, targetPath] = process.argv.slice(2);
if (!objPath || !targetPath) throw new Error('Usage: node scripts/generate-human-head.mjs base.obj male.target');
const vertices = [], faces = [];
let body = false;
for (const line of readFileSync(objPath, 'utf8').split('\n')) {
  if (line.startsWith('v ')) vertices.push(line.split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith('g ')) body = line.trim() === 'g body';
  else if (body && line.startsWith('f ')) faces.push(line.trim().split(/\s+/).slice(1).map(v => Number(v.split('/')[0]) - 1));
}
for (const line of readFileSync(targetPath, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [index, dx, dy, dz] = line.trim().split(/\s+/).map(Number);
  vertices[index][0] += dx; vertices[index][1] += dy; vertices[index][2] += dz;
}
const bodyIndices = new Set(faces.flat());
const minY = Math.min(...[...bodyIndices].map(i => vertices[i][1]));
const maxY = Math.max(...[...bodyIndices].map(i => vertices[i][1]));
const scale = 1.83 / (maxY - minY);
const selected = faces.filter(face => face.every(i => (vertices[i][1] - minY) * scale - 1.51 > .075 && Math.abs(vertices[i][0]) < 1.35));
const remap = new Map(), positions = [], indices = [];
for (const face of selected) {
  const output = face.map(i => {
    if (!remap.has(i)) {
      remap.set(i, remap.size);
      const [x, y, z] = vertices[i];
      positions.push(-x * scale, (y - minY) * scale - 1.51, -z * scale + .05);
    }
    return remap.get(i);
  });
  for (let i = 1; i < output.length - 1; i++) indices.push(output[0], output[i], output[i + 1]);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setIndex(indices); geometry.computeVertexNormals();
mkdirSync('public/models', { recursive: true });
for (const [detail, mesh] of [['high', geometry], ['low', new SimplifyModifier().modify(geometry, Math.floor(geometry.attributes.position.count * .7))]]) {
  const p = mesh.attributes.position.array, index = mesh.index.array;
  const buffer = Buffer.alloc(8 + p.length * 4 + index.length * 2);
  buffer.writeUInt32LE(p.length / 3, 0); buffer.writeUInt32LE(index.length, 4);
  p.forEach((n, i) => buffer.writeFloatLE(n, 8 + i * 4));
  index.forEach((n, i) => buffer.writeUInt16LE(n, 8 + p.length * 4 + i * 2));
  writeFileSync(`public/models/human-head-${detail}.bin`, buffer);
  console.log(detail, p.length / 3, 'vertices', index.length / 3, 'triangles', buffer.length, 'bytes');
}
