import * as THREE from 'three';
import { GOAL_HEIGHT, GOAL_WIDTH } from './physics';

const standard = (color: THREE.ColorRepresentation, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
const up = new THREE.Vector3(0, 1, 0);

export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, segments = 8): THREE.Mesh {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  return mesh;
}

function seededRandom(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function grassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(7017);
  for (let y = 0; y < canvas.height; y += 128) {
    ctx.fillStyle = (y / 128) % 2 ? '#3c743b' : '#448442';
    ctx.fillRect(0, y, canvas.width, 128);
  }
  // Fine turf grain, all locally generated (no downloaded textures).
  for (let i = 0; i < 200000; i++) {
    const shade = random() > 0.48 ? 150 : 10;
    ctx.fillStyle = `rgba(${shade},${shade + 30},${shade},${random() * 0.13})`;
    ctx.fillRect(random() * 1024, random() * 2048, 1, random() * 3 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function signageTexture(text: string, dark = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dark ? '#14251e' : '#baf074';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = dark ? '#c2f970' : '#15281d';
  ctx.font = 'italic 700 56px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 66);
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(0, y, 1024, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stadium {
  readonly group = new THREE.Group();
  readonly net: THREE.LineSegments;
  private readonly netRest: Float32Array;
  private impact = new THREE.Vector3();
  private impactTime = -10;
  readonly sun: THREE.DirectionalLight;
  readonly crowd: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    scene.background = new THREE.Color('#bed1d4');
    scene.fog = new THREE.Fog('#cbd4c1', 78, 215);
    scene.add(new THREE.HemisphereLight('#d8efff', '#536143', 2.1));
    this.sun = new THREE.DirectionalLight('#ffdfab', 2.8);
    this.sun.position.set(-32, 42, -25);
    this.sun.target.position.set(0, 0, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -39;
    this.sun.shadow.camera.right = 39;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight('#d5e9ff', 0.55);
    fill.position.set(20, 15, 35);
    scene.add(fill);
    this.makeSky();
    this.makePitch();
    this.net = this.makeGoal();
    this.netRest = (this.net.geometry.attributes.position.array as Float32Array).slice();
    this.crowd = this.makeStands();
    this.makeBoards();
    this.makeDetails();
  }

  private box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, shadow = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    this.group.add(mesh);
    return mesh;
  }

  private makeSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#527d9c') },
        bottomColor: { value: new THREE.Color('#e7dac1') },
      },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 vPosition; uniform vec3 topColor; uniform vec3 bottomColor;
        void main(){vec3 dir=normalize(vPosition); float h=pow(max(dir.y,0.0),0.55);
        vec3 col=mix(bottomColor,topColor,h); float sun=pow(max(dot(dir,normalize(vec3(-0.48,0.24,-0.86))),0.0),160.0);
        col+=vec3(1.0,0.65,0.3)*sun*0.4; gl_FragColor=vec4(col,1.0);}`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 16), material);
    this.group.add(sky);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff2d4', fog: false }));
    sun.position.set(-110, 54, -194);
    this.group.add(sun);
  }

  private makePitch() {
    this.box(100, 0.25, 137, 0, -0.22, 48, standard('#46694a'));
    const grass = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, color: '#d5eac0' });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(78, 118), grass);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, 51);
    pitch.receiveShadow = true;
    this.group.add(pitch);
    const white = new THREE.MeshBasicMaterial({ color: '#e1e5cd', transparent: true, opacity: 0.88 });
    const line = (x1: number, z1: number, x2: number, z2: number, width = 0.095) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), white);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.atan2(x2 - x1, z2 - z1);
      mesh.position.set((x1 + x2) / 2, 0.018, (z1 + z2) / 2);
      this.group.add(mesh);
    };
    const rectangle = (halfWidth: number, from: number, to: number) => {
      line(-halfWidth, from, -halfWidth, to);
      line(halfWidth, from, halfWidth, to);
      line(-halfWidth, to, halfWidth, to);
    };
    rectangle(34, 0, 105);
    line(-34, 0, 34, 0);
    rectangle(20.16, 0, 16.5);
    rectangle(9.16, 0, 5.5);
    rectangle(20.16, 105, 88.5);
    rectangle(9.16, 105, 99.5);
    line(-34, 52.5, 34, 52.5);
    const arc = (cx: number, cz: number, radius: number, from: number, to: number) => {
      const steps = Math.ceil((to - from) * 30);
      for (let i = 0; i < steps; i++) {
        const a = from + (to - from) * i / steps;
        const b = from + (to - from) * (i + 1) / steps;
        line(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius, cx + Math.cos(b) * radius, cz + Math.sin(b) * radius, 0.08);
      }
    };
    const theta = Math.asin((16.5 - 11) / 9.15);
    arc(0, 11, 9.15, theta, Math.PI - theta);
    // Merge the many circle segments into one geometry to keep mobile draw calls low.
    const circle = (radius: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.045, radius + 0.045, 96), white);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.019, z);
      this.group.add(mesh);
    };
    circle(9.15, 52.5);
    for (const z of [11, 52.5, 94]) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), white);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(0, 0.02, z);
      this.group.add(dot);
    }
  }

  private makeGoal(): THREE.LineSegments {
    const frame = standard('#f2f4ea', 0.3);
    const half = GOAL_WIDTH / 2;
    const pole = (a: number[], b: number[], radius = 0.06) => {
      const mesh = cylinderBetween(new THREE.Vector3(...a), new THREE.Vector3(...b), radius, frame, 12);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    pole([-half, 0, 0], [-half, GOAL_HEIGHT, 0]);
    pole([half, 0, 0], [half, GOAL_HEIGHT, 0]);
    pole([-half, GOAL_HEIGHT, 0], [half, GOAL_HEIGHT, 0]);
    for (const x of [-half, half]) {
      pole([x, 0.03, 0], [x, 0.03, -2.4], 0.035);
      pole([x, GOAL_HEIGHT, 0], [x, GOAL_HEIGHT, -1.1], 0.035);
      pole([x, GOAL_HEIGHT, -1.1], [x, 0.03, -2.4], 0.035);
    }
    pole([-half, 0.03, -2.4], [half, 0.03, -2.4], 0.035);
    const vertices: number[] = [];
    const edge = (a: number[], b: number[]) => vertices.push(...a, ...b);
    const spacing = 0.16;
    for (let x = -half; x <= half + 0.01; x += spacing) {
      edge([x, GOAL_HEIGHT, 0], [x, GOAL_HEIGHT, -1.1]);
      edge([x, GOAL_HEIGHT, -1.1], [x, 0.04, -2.4]);
    }
    for (let y = 0; y <= GOAL_HEIGHT; y += spacing) {
      const z = -2.4 + (y / GOAL_HEIGHT) * 1.3;
      edge([-half, y, z], [half, y, z]);
      for (const x of [-half, half]) edge([x, y, 0], [x, y, z]);
    }
    for (let z = 0; z >= -2.4; z -= spacing) {
      const top = z >= -1.1 ? GOAL_HEIGHT : GOAL_HEIGHT * (z + 2.4) / 1.3;
      for (const x of [-half, half]) edge([x, 0.04, z], [x, top, z]);
      if (z >= -1.1) edge([-half, GOAL_HEIGHT, z], [half, GOAL_HEIGHT, z]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const net = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#f7f5df', transparent: true, opacity: 0.52, depthWrite: false }));
    this.group.add(net);
    return net;
  }

  private makeStands(): THREE.InstancedMesh {
    const concrete = standard('#607371');
    const charcoal = standard('#293e41');
    const roofMaterial = standard('#c6c9b4', 0.6);
    const steel = standard('#879990', 0.5);
    const rows = 13;
    const random = seededRandom(2045);
    const places: { x: number; y: number; z: number; rotation: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const y = 1.6 + r * 0.67;
      const z = -12 - r * 1.22;
      this.box(94, 0.6, 1.28, 0, y - 0.25, z, concrete);
      for (let c = 0; c < 120; c++) {
        if (c % 24 < 2) continue;
        places.push({ x: -46 + c * 0.77, y, z, rotation: 0 });
      }
      for (const side of [-1, 1]) {
        const x = side * (40 + r * 1.22);
        this.box(1.28, 0.6, 119, x, y - 0.25, 43, concrete);
        for (let c = 0; c < 140; c++) {
          if (c % 28 < 2) continue;
          places.push({ x, y, z: -12 + c * 0.78, rotation: side * Math.PI / 2 });
        }
      }
    }
    const dummy = new THREE.Object3D();
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.48, 0.42), standard('#9eb9ae'), places.length);
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.35, 2, 4), standard('#ede4c9'), places.length);
    const palette = ['#253c3d', '#688777', '#bdd3ae', '#d6c9a7', '#52675b', '#c2d2cf', '#ab805f', '#314d60', '#678489'];
    places.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.2, p.z);
      dummy.rotation.set(0, p.rotation, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      seats.setColorAt(i, new THREE.Color(i % 9 < 5 ? '#658d79' : '#b8c2a0'));
      dummy.position.y = p.y + 0.52;
      const occupied = random() > 0.16;
      dummy.scale.set(occupied ? 1 : 0, occupied ? 0.75 + random() * 0.45 : 0, occupied ? 1 : 0);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      crowd.setColorAt(i, new THREE.Color(palette[Math.floor(random() * palette.length)]));
    });
    this.group.add(seats, crowd);
    this.box(99, 1, 2, 0, 10.9, -28.5, charcoal);
    this.box(101, 0.32, 21, 0, 15.6, -24, roofMaterial);
    this.box(101, 0.65, 0.4, 0, 15.25, -13.5, charcoal);
    for (const x of [-54, 54]) {
      this.box(18, 0.32, 124, x, 15.6, 44, roofMaterial);
      this.box(0.4, 0.65, 124, x > 0 ? 45 : -45, 15.25, 44, charcoal);
    }
    for (let x = -48; x <= 48; x += 12) {
      const support = cylinderBetween(new THREE.Vector3(x, 0, -29), new THREE.Vector3(x, 16.3, -29), 0.17, steel);
      this.group.add(support);
      const brace = cylinderBetween(new THREE.Vector3(x, 14, -29), new THREE.Vector3(x, 15.5, -13.8), 0.1, steel);
      this.group.add(brace);
      this.box(0.13, 0.2, 19, x, 15.15, -24, steel);
    }
    for (let z = -10; z < 100; z += 18) {
      for (const side of [-1, 1]) {
        this.box(0.2, 16, 0.2, side * 60, 7.9, z, steel);
        this.box(15, 0.18, 0.18, side * 53, 15.15, z, steel);
      }
    }
    // Stadium floodlights are emissive geometry, not dozens of expensive shadow lights.
    const lightMat = new THREE.MeshBasicMaterial({ color: '#fff4cf' });
    for (const x of [-32, -16, 0, 16, 32]) this.box(4, 0.16, 0.65, x, 14.95, -14.4, lightMat);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(31, 1.55), new THREE.MeshBasicMaterial({ map: signageTexture('THE FLOODLIGHT ARENA'), toneMapped: false }));
    name.position.set(0, 11, -27.35);
    this.group.add(name);
    return crowd;
  }

  private makeBoards() {
    const texts = ['FREE KICK MASTER', 'MAKE IT UNSAVEABLE.', 'YOUR MOMENT. YOUR GAME.', 'FREE KICK MASTER', 'PRACTICE MAKES PERFECT.'];
    texts.forEach((text, i) => {
      const material = new THREE.MeshStandardMaterial({ map: signageTexture(text, i % 3 !== 1), roughness: 0.65, emissive: '#b9d592', emissiveIntensity: 0.12 });
      this.box(16.1, 1.1, 0.16, -32.8 + i * 16.4, 0.6, -8.8, material);
    });
    const sideMat = new THREE.MeshStandardMaterial({ map: signageTexture('FREE KICK MASTER  /  FIND YOUR FINESSE'), roughness: 0.6 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const board = this.box(19.5, 1.1, 0.16, side * 37.7, 0.6, 3 + i * 20, sideMat);
        board.rotation.y = -side * Math.PI / 2;
      }
    }
  }

  private makeDetails() {
    const white = standard('#dfe2c8');
    const flagMat = new THREE.MeshStandardMaterial({ color: '#c2f970', side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pole = cylinderBetween(new THREE.Vector3(side * 34, 0, 0), new THREE.Vector3(side * 34, 1.65, 0), 0.022, white);
      this.group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.3), flagMat);
      flag.position.set(side * 34 + 0.23, 1.49, 0);
      flag.rotation.y = 0.5;
      this.group.add(flag);
    }
    // Broadcast camera pods behind the advertising boards.
    const dark = standard('#263c36');
    for (const x of [-11, 11]) {
      this.box(0.42, 0.3, 0.65, x, 1.8, -7, dark);
      const tripod = cylinderBetween(new THREE.Vector3(x, 0, -7), new THREE.Vector3(x, 1.65, -7), 0.05, dark);
      this.group.add(tripod);
    }
  }

  ripple(point: THREE.Vector3, time: number) {
    this.impact.copy(point);
    this.impactTime = time;
  }

  update(time: number) {
    const elapsed = time - this.impactTime;
    if (elapsed > 3) return;
    const vertices = this.net.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = this.netRest[i];
      const y = this.netRest[i + 1];
      const z = this.netRest[i + 2];
      const distance = Math.hypot(x - this.impact.x, y - this.impact.y);
      const edgeDamping = Math.sin((x + GOAL_WIDTH / 2) / GOAL_WIDTH * Math.PI) * Math.sin(y / GOAL_HEIGHT * Math.PI);
      vertices[i + 2] = z - Math.sin(elapsed * 17 - distance * 2.5) * Math.exp(-elapsed * 2.2 - distance * 0.5) * 0.5 * edgeDamping;
    }
    this.net.geometry.attributes.position.needsUpdate = true;
  }
}
