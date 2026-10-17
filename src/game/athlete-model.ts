import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlayerRole } from './animation';
import type { HairStyle } from './appearance';
import { humanHead, hasHumanAnatomy } from './human';

export type Detail = 'high' | 'low';
export type Surface = 'skin' | 'jersey' | 'sleeve' | 'shorts' | 'trim' | 'sock' | 'boot' | 'sole' | 'hair' | 'glove' | 'eyes' | 'iris';
export type AthleteMaterials = Record<Surface, THREE.MeshStandardMaterial>;
export const JOINTS = ['body', 'head', 'torso', 'leftLeg', 'rightLeg', 'leftShin', 'rightShin', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm', 'leftFoot', 'rightFoot'] as const;

/** Three.js normally updates invisible subtrees too. Arena selects LODs BEFORE its scene update. */
export class RigRoot extends THREE.Group {
  override updateMatrixWorld(force?: boolean) {
    if (this.visible) super.updateMatrixWorld(force);
  }
}

// Geometry templates are shared by all athletes of a role/detail. No repeated mesh generation,
// no per-player copies of the vertex/index buffers, and no GPU skinning palette or extra pass.
const templates = new Map<string, RigRoot>();
const hairCache = new Map<string, THREE.BufferGeometry>();

/** Anatomical elliptical sections, with very shallow sewn-cloth folds baked into the surface. */
function sections(rows: number[][], segments: number, cloth = false): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colours: number[] = [], indices: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    const [y, width, depth, z = 0] = rows[r];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const fold = cloth ? Math.sin(a * 7 + r * 1.5) * .00065 * Math.sin(r / (rows.length - 1) * Math.PI) : 0;
      positions.push(Math.sin(a) * (width + fold), y, Math.cos(a) * (depth + fold) + z);
      uvs.push(i / segments, r / (rows.length - 1));
      const shade = .92 + .08 * Math.sin(r / (rows.length - 1) * Math.PI);
      colours.push(shade, shade, shade);
      if (r < rows.length - 1 && i < segments) {
        const n = r * (segments + 1) + i, next = n + segments + 1;
        indices.push(n, n + 1, next, n + 1, next + 1, next);
      }
    }
  }
  // Close every limb/cloth section. Open rings used to expose backfaces at bent joints.
  for (const r of [0, rows.length - 1]) {
    const [y, width, depth, z = 0] = rows[r], base = positions.length / 3;
    positions.push(0, y, z); uvs.push(.5, .5); colours.push(.95, .95, .95);
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      positions.push(Math.sin(a) * width, y, Math.cos(a) * depth + z);
      uvs.push(.5 + Math.sin(a) * .5, .5 + Math.cos(a) * .5); colours.push(.95, .95, .95);
      if (i < segments) {
        if (r === 0) indices.push(base, base + i + 2, base + i + 1);
        else indices.push(base, base + i + 1, base + i + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let r = 0; r < rows.length; r++) {
    const first = r * (segments + 1), last = first + segments;
    const x = normals.getX(first) + normals.getX(last), y = normals.getY(first) + normals.getY(last), z = normals.getZ(first) + normals.getZ(last);
    const length = Math.hypot(x, y, z) || 1;
    normals.setXYZ(first, x / length, y / length, z / length); normals.setXYZ(last, x / length, y / length, z / length);
  }
  return geometry;
}
function vertexColour(geometry: THREE.BufferGeometry, shade = 1) {
  const count = geometry.attributes.position.count;
  const colours = new Float32Array(count * 3); colours.fill(shade);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** Cut an opaque fitted surface from the imported head. Used for rooted hair and close beard. */
function fittedHead(detail: Detail, keep: (x: number, y: number, z: number) => boolean): THREE.BufferGeometry | undefined {
  const source = humanHead(detail);
  if (!source) return undefined;
  const position = source.attributes.position, normal = source.attributes.normal;
  const index = source.index!, retained: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if ([a, b, c].every(n => keep(position.getX(n), position.getY(n), position.getZ(n)))) retained.push(a, b, c);
  }
  for (let i = 0; i < position.count; i++) position.setXYZ(i,
    position.getX(i) + normal.getX(i) * .0015,
    position.getY(i) + normal.getY(i) * .0015,
    position.getZ(i) + normal.getZ(i) * .0015);
  source.setIndex(retained); vertexColour(source); source.computeVertexNormals();
  return source;
}

/** One continuous head surface: jaw, cheek planes, brow ridge, nose and mouth, not stacked balls. */
function sculptHead(high: boolean) {
  const imported = humanHead(high ? 'high' : 'low');
  if (imported) return imported;
  const geometry = new THREE.SphereGeometry(1, high ? 40 : 20, high ? 28 : 14);
  const p = geometry.attributes.position;
  const colours: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const front = Math.max(0, -z);
    const jaw = y < -.22 ? 1 - (-y - .22) * .26 : 1;
    const nose = Math.exp(-(x * x * 100 + (y + .04) ** 2 * 34)) * .036;
    const brow = Math.exp(-((y - .25) ** 2 * 140)) * .009;
    const lips = Math.exp(-(x * x * 45 + (y + .39) ** 2 * 200)) * .006;
    p.setXYZ(i, x * .112 * jaw, y * .146 + .17, z * .104 - (nose + brow + lips) * front ** 5);
    const ao = 1 - Math.exp(-((y + .23) ** 2 * 70 + x * x * 30)) * front ** 6 * .14;
    colours.push(ao, ao * .975, ao * .955);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildTemplate(role: PlayerRole, detail: Detail): RigRoot {
  const high = detail === 'high', radial = high ? 32 : 16;
  const root = new RigRoot();
  const bone = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); parent.add(group); return group;
  };
  const placeholder = Object.fromEntries((['skin', 'jersey', 'sleeve', 'shorts', 'trim', 'sock', 'boot', 'sole', 'hair', 'glove', 'eyes', 'iris'] as Surface[])
    .map(name => { const mat = new THREE.MeshStandardMaterial(); mat.name = name; return [name, mat]; })) as AthleteMaterials;
  const mesh = (geometry: THREE.BufferGeometry, surface: Surface, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    if (!geometry.attributes.color) vertexColour(geometry);
    const m = new THREE.Mesh(geometry, placeholder[surface]); m.position.set(x, y, z);
    m.castShadow = high; m.receiveShadow = true; parent.add(m); return m;
  };
  const ellipsoid = (surface: Surface, parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, segments = 16) => {
    const geometry = new THREE.SphereGeometry(1, high ? segments : 8, high ? Math.max(8, Math.round(segments * .6)) : 6);
    geometry.scale(sx, sy, sz);
    return mesh(geometry, surface, parent, x, y, z);
  };
  const body = bone('body', root);
  const torso = mesh(sections([
    [.94, .148, .095], [.98, .161, .102], [1.04, .17, .108], [1.12, .178, .111],
    [1.22, .201, .123], [1.31, .219, .125], [1.38, .224, .107], [1.445, .181, .083], [1.47, .072, .064],
  ], radial, true), 'jersey', body);
  torso.name = 'torso';
  // Neck, natural shoulder slope and tapered shorts, without separate inflated pecs/glutes.
  mesh(sections([[1.42, .064, .059], [1.49, .058, .054], [1.54, .059, .054]], high ? 20 : 12), 'skin', body);
  const collar = mesh(new THREE.TorusGeometry(.074, .009, 6, high ? 32 : 16), 'trim', body, 0, 1.468, 0);
  collar.rotation.x = Math.PI / 2; collar.scale.y = .88;
  mesh(sections([[.87, .173, .115], [.85, .178, .12], [.93, .159, .101], [.96, .151, .097]], radial, true), 'shorts', body);
  const head = bone('head', body, 0, 1.455, 0);
  const features = bone('features', head);
  const face = sculptHead(high); face.computeBoundingBox();
  mesh(face, 'skin', features);
  ellipsoid('skin', head, 0, .045, .003, .058, .072, .056, 20);
  for (const side of [-1, 1]) {
    if (!hasHumanAnatomy(high ? 'high' : 'low')) {
      ellipsoid('skin', features, side * .108, .17, .004, .016, .032, .02, 14);
    }
    // Eyes stay inside the lids instead of protruding from the face. Dark iris, no toy-like whites.
    ellipsoid('eyes', features, side * .037, .202, -.124, .012, .0035, .003, 14);
    ellipsoid('iris', features, side * .037, .201, -.128, .0055, .0035, .002, 12);
    ellipsoid('skin', features, side * .037, .206, -.124, .014, .0025, .002, 14);
    ellipsoid('iris', features, side * .037, .225, -.125, .022, .0025, .003, 14).rotation.z = side * .09;
  }

  const beardSurface = fittedHead(detail, (x, y, z) => y < .166 - Math.abs(x) * .25 && y > .052 && z < .035 && !(Math.abs(x) < .026 && y > .105 && y < .135));
  const beard = beardSurface ? mesh(beardSurface, 'hair', features) : ellipsoid('hair', features, 0, .084, -.045, .074, .054, .065, 24);
  beard.name = 'beard'; beard.visible = false;
  bone('hairMount', features);
  for (const side of [-1, 1]) {
    const prefix = side === -1 ? 'left' : 'right';
    const leg = bone(`${prefix}Leg`, body, side * .096, .88);
    mesh(sections([[-.25, .076, .076], [-.15, .09, .092], [-.04, .094, .105], [.02, .084, .091]], radial, true), 'shorts', leg);
    mesh(sections([[-.43, .052, .056], [-.35, .058, .063], [-.26, .069, .079], [-.22, .075, .081]], radial), 'skin', leg);
    const shin = bone(`${prefix}Shin`, leg, 0, -.42);
    ellipsoid('skin', shin, 0, -.009, -.005, .053, .057, .058, 16);
    mesh(sections([[-.37, .034, .04], [-.29, .038, .045], [-.2, .056, .06], [-.08, .06, .062], [-.04, .055, .057]], radial), 'sock', shin);
    mesh(new THREE.CylinderGeometry(.057, .058, .018, high ? 24 : 12), 'trim', shin, 0, -.048);
    const foot = bone(`${prefix}Foot`, shin, 0, -.37);
    const boot = ellipsoid('boot', foot, 0, -.02, -.058, .05, .043, .122, 24); boot.rotation.x = -.08;
    ellipsoid('sole', foot, 0, -.049, -.055, .051, .013, .12, 20);
    if (high) for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(.039, .004, .006), 'sock', foot, 0, .019, -.05 - i * .017);
    const arm = bone(`${prefix}Arm`, body, side * .19, 1.397);
    ellipsoid('sleeve', arm, 0, .008, 0, .067, .045, .065, 20);
    mesh(sections([[-.175, .064, .062], [-.1, .069, .069], [-.025, .071, .071], [.015, .066, .066], [.045, .048, .052], [.065, .001, .001]], radial, true), 'sleeve', arm);
    mesh(new THREE.CylinderGeometry(.067, .066, .014, high ? 24 : 12), 'trim', arm, 0, -.167);
    mesh(sections([[-.29, .042, .042], [-.235, .05, .051], [-.17, .057, .055]], radial), role === 'keeper' ? 'sleeve' : 'skin', arm);
    const forearm = bone(`${prefix}Forearm`, arm, 0, -.29);
    ellipsoid(role === 'keeper' ? 'sleeve' : 'skin', forearm, 0, 0, 0, .043, .045, .044, 16);
    mesh(sections([[-.22, .031, .032], [-.14, .041, .043], [-.055, .047, .047], [.01, .042, .043]], radial), role === 'keeper' ? 'sleeve' : 'skin', forearm);
    const hand = role === 'keeper' ? 'glove' : 'skin';
    ellipsoid(hand, forearm, 0, -.266, -.006, role === 'keeper' ? .055 : .036, .061, .022, 16);
    ellipsoid(hand, forearm, -side * .031, -.25, -.018, .013, .033, .014, 12);
    if (high) for (let f = 0; f < 4; f++) ellipsoid(hand, forearm, (f - 1.5) * .015, -.316, -.007, .008, .025, .012, 10);
  }
  // Preserve joints and semantic meshes; merge all other rigid parts per surface at each joint.
  root.traverse(parent => {
    if (!(parent instanceof THREE.Group)) return;
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || child.name === 'torso' || child.name === 'beard') continue;
      const list = batches.get(child.material as THREE.Material) ?? []; list.push(child); batches.set(child.material as THREE.Material, list);
    }
    for (const [material, parts] of batches) {
      if (parts.length < 2) continue;
      const transformed = parts.map(part => { part.updateMatrix(); return part.geometry.clone().applyMatrix4(part.matrix); });
      const combined = new THREE.Mesh(mergeGeometries(transformed), material);
      combined.castShadow = high; combined.receiveShadow = true; parent.add(combined);
      for (const part of parts) { parent.remove(part); part.geometry.dispose(); }
      transformed.forEach(geometry => geometry.dispose());
    }
  });
  root.traverse(object => {
    if (object instanceof THREE.Mesh && object.name !== 'torso') { object.updateMatrix(); object.matrixAutoUpdate = false; }
  });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  root.userData.floor = bounds.min.y;
  root.userData.stature = bounds.max.y - bounds.min.y;
  return root;
}

/** Height is sole-to-skull in metres, excluding hairstyle. Apply equally to both LODs. */
export function fitStature(root: RigRoot, height: number) {
  const scale = height / root.userData.stature;
  root.getObjectByName('body')!.scale.setScalar(scale);
  root.position.y = -root.userData.floor * scale;
  root.userData.height = height;
}

export function athleteModel(role: PlayerRole, detail: Detail, materials: AthleteMaterials): RigRoot {
  const key = `${role === 'keeper' ? 'keeper' : 'outfield'}/${detail}`;
  let template = templates.get(key);
  if (!template) { template = buildTemplate(role, detail); templates.set(key, template); }
  const root = template.clone(true);
  root.traverse(object => {
    if (object instanceof THREE.Mesh) object.material = materials[(object.material as THREE.Material).name as Surface];
  });
  return root;
}

/** Opaque hair masses with directional ridges: no alpha cards, overdraw or strand simulation. */
export function hairGeometry(style: HairStyle, detail: Detail): THREE.BufferGeometry {
  const key = `${style}/${detail}`;
  const cached = hairCache.get(key); if (cached) return cached;
  const high = detail === 'high', segments = high ? 32 : 16;
  const parts: THREE.BufferGeometry[] = [];
  const fitted = fittedHead(detail, (_x, y, z) => {
    const front = Math.max(0, -z / .13), back = Math.max(0, z / .13);
    return y > .165 + front * .085 - back * (style === 'flow' ? .14 : .045);
  });
  const shell = fitted ?? new THREE.SphereGeometry(1, segments, high ? 14 : 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = shell.attributes.position;
  for (let i = 0; !fitted && i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const front = Math.max(0, -z), back = Math.max(0, z);
    const length = style === 'flow' ? .13 * back : style === 'bun' ? .045 * back : 0;
    const height = style === 'crop' || style === 'braids' ? .133 : style === 'quiff' ? .161 : .15;
    // Rooted hairline follows the temples and recedes at the forehead; no floating "hat".
    x *= .114; z *= .108;
    y = .17 + y * height + front * .025 - (1 - p.getY(i)) * (length + back * .038);
    const ridge = Math.sin(Math.atan2(x, z) * (style === 'braids' ? 12 : 18)) * .0018;
    p.setXYZ(i, x + ridge, y, z + .003);
  }
  if (fitted) {
    const normals = shell.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const curl = Math.sin(x * 290 + z * 95) * Math.sin(y * 310 - z * 180);
      const front = Math.max(0, -z / .13);
      const volume = style === 'curls' ? .009 + curl * .0035
        : style === 'quiff' ? .004 + front * Math.max(0, y - .19) * .2
        : style === 'swept' ? .004 + Math.max(0, x + .09) * .035
        : style === 'flow' ? .005 + Math.sin(y * 140 + x * 60) * .0015 : .002;
      p.setXYZ(i, x + normals.getX(i) * volume, y + normals.getY(i) * volume, z + normals.getZ(i) * volume);
    }
  }
  shell.computeVertexNormals(); parts.push(shell);
  const clump = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotate = 0) => {
    const g = new THREE.SphereGeometry(1, high ? 12 : 8, high ? 8 : 5);
    g.scale(sx, sy, sz); g.rotateZ(rotate); g.translate(x, y, z); parts.push(g);
  };
  if (style === 'curls') {
    // Small rooted curls, not the former oversized bead-like clumps. Single merged draw.
    const count = high ? 56 : 20;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996, radius = Math.sqrt((i + .5) / count) * .082;
      const g = new THREE.SphereGeometry(1, high ? 8 : 6, high ? 6 : 4);
      g.scale(.009, .008, .009);
      g.translate(Math.cos(a) * radius, .242 + Math.sqrt(Math.max(0, 1 - radius * radius / .0075)) * .073, Math.sin(a) * radius - .006);
      parts.push(g);
    }
  } else if (style === 'bun') {
    clump(0, .264, .113, .047, .038, .038);
  } else if (style === 'braids') {
    for (let i = 0; i < 6; i++) clump((i - 2.5) * .031, .296 - Math.abs(i - 2.5) * .009, .001, .012, .018, .101, .07);
  } else if (style === 'flow') {
    for (let i = 0; i < 7; i++) clump(Math.sin(i / 6 * Math.PI - Math.PI / 2) * .097, .173, .063, .032, .092, .047, (i - 3) * -.09);
  }
  for (const part of parts) {
    vertexColour(part);
    const position = part.attributes.position, colour = part.attributes.color;
    for (let i = 0; i < position.count; i++) {
      const root = Math.min(1, Math.max(0, (position.getY(i) - .17) / .12));
      const shade = .55 + .45 * root; colour.setXYZ(i, shade, shade, shade);
    }
  }
  const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
  geometry.computeBoundingSphere(); hairCache.set(key, geometry); return geometry;
}

/** Also release bounded cached shapes that were previously shown but are no longer in the scene. */
export function disposeAthleteModelCaches() {
  const geometries = new Set<THREE.BufferGeometry>(hairCache.values());
  for (const root of templates.values()) root.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
  for (const geometry of geometries) geometry.dispose();
  hairCache.clear(); templates.clear();
}
