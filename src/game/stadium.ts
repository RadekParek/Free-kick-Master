import * as THREE from 'three';
import { disposeSceneResources } from './resources';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Atmosphere, Quality } from '../state';
import { GOAL_HEIGHT, GOAL_WIDTH, POST_RADIUS } from './physics';
import { NetRipple } from './net-ripple';

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
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  fillGrassPixels(pixels.data, canvas.width, canvas.height);
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 16;
  return texture;
}
/** Deterministic full-detail turf generation, separated for byte-equivalence tests. */
export function fillGrassPixels(data: Uint8ClampedArray, width: number, height: number): void {
  const random = seededRandom(7017);
  // One contiguous image-data write instead of 200,000 expensive canvas draw calls.
  for (let y = 0; y < height; y++) {
    const stripe = Math.floor(y / 128) % 2 ? .9 : 1.06;
    const rowCurve = Math.cos(y * .009) * 2;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Low-frequency mowing patches and worn spots break up the uniform colour, like real turf.
      const patch = 1 + Math.sin(x * .013 + rowCurve) * Math.cos(y * .011 + x * .004) * .055 - (Math.sin(x * .047 + y * .031) > .92 ? .08 : 0);
      const grain = (random() - .5) * 19 + Math.sin(x * .31 + y * .1) * 2.2;
      data[i] = (43 * stripe + grain * .66) * patch;
      data[i + 1] = (91 * stripe + grain) * patch;
      data[i + 2] = (43 * stripe + grain * .52) * patch;
      data[i + 3] = 255;
    }
  }
}

function turfNormal(): THREE.DataTexture {
  const size = 128; const data = new Uint8Array(size * size * 4); const random = seededRandom(54);
  for (let i = 0; i < data.length; i += 4) { data[i] = 128 + (random() - .5) * 75; data[i + 1] = 128 + (random() - .5) * 75; data[i + 2] = 248; data[i + 3] = 255; }
  const texture = new THREE.DataTexture(data, size, size); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(45, 70); texture.needsUpdate = true; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  return texture;
}

function signageTexture(text: string, dark = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = dark ? '#101724' : '#b4ff37';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = dark ? '#b4ff37' : '#132113';
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

/** Only one vec4/particle is uploaded each frame; flutter/rotation are evaluated on the GPU. */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly count = 90;
  private readonly position = new Float32Array(90 * 3);
  private readonly velocity = new Float32Array(90 * 3);
  private readonly life = new Float32Array(90);
  private readonly particle = new THREE.InstancedBufferAttribute(new Float32Array(90 * 4), 4).setUsage(THREE.DynamicDrawUsage);
  private readonly clock = { value: 0 };
  private active = false;

  constructor(parent: THREE.Object3D) {
    const geometry = new THREE.PlaneGeometry(.09, .05);
    geometry.setAttribute('aParticle', this.particle);
    geometry.setAttribute('aIndex', new THREE.InstancedBufferAttribute(Float32Array.from({length:90}, (_,i)=>i), 1));
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.uParticleTime = this.clock;
      shader.vertexShader = 'attribute vec4 aParticle; attribute float aIndex; uniform float uParticleTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float a = uParticleTime * aParticle.w;
        float flutter = max(.15, abs(sin(a*.5+aIndex)));
        transformed.y *= flutter;
        // Same XYZ Euler transform as the former per-particle Object3D matrix.
        float cy=cos(a*.7), sy=sin(a*.7), cx=cos(a), sx=sin(a);
        transformed = vec3(cy*transformed.x+sy*transformed.z, transformed.y, -sy*transformed.x+cy*transformed.z);
        transformed.yz = mat2(cx,sx,-sx,cx)*transformed.yz;
        if(aParticle.y < -99.) transformed=vec3(0.);
        transformed += aParticle.xyz;
      `);
    };
    material.customProgramCacheKey = () => 'gpu-confetti-euler-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = 'gpu-confetti'; this.mesh.frustumCulled = false; this.mesh.visible = false;
    const palette = ['#b4ff37', '#2fd8c8', '#ffffff', '#ffd166', '#ef476f'].map(c => new THREE.Color(c));
    for (let i=0;i<this.count;i++) { this.mesh.setColorAt(i,palette[i%palette.length]); this.particle.setY(i,-100); }
    parent.add(this.mesh);
  }
  burst(origin: THREE.Vector3) {
    for(let i=0;i<this.count;i++) {
      const a=Math.random()*Math.PI*2, up=2.5+Math.random()*4, j=i*3;
      this.position[j]=origin.x;this.position[j+1]=origin.y;this.position[j+2]=origin.z;
      this.velocity[j]=Math.cos(a)*(1+Math.random()*2.5);this.velocity[j+1]=up;this.velocity[j+2]=Math.sin(a)*(1+Math.random()*2.5)-1;
      this.life[i]=2.2+Math.random()*1.6;
      this.particle.setXYZW(i,origin.x,origin.y,origin.z,(Math.random()-.5)*12);
    }
    this.particle.needsUpdate=true; this.active=true; this.mesh.visible=true;
  }
  update(dt:number,time:number) {
    if(!this.active)return;
    this.clock.value=time;let alive=0;
    for(let i=0;i<this.count;i++) {
      if(this.life[i]<=0)continue;
      this.life[i]-=dt;
      if(this.life[i]<=0) {this.particle.setXYZ(i,0,-100,0);continue;}
      alive++; const j=i*3;
      this.velocity[j]*=1-dt*1.6;this.velocity[j+1]=this.velocity[j+1]*(1-dt*1.2)-2.2*dt;this.velocity[j+2]*=1-dt*1.6;
      this.position[j]+=this.velocity[j]*dt;this.position[j+1]+=this.velocity[j+1]*dt;this.position[j+2]+=this.velocity[j+2]*dt;
      this.particle.setXYZ(i,this.position[j],Math.max(.02,this.position[j+1]),this.position[j+2]);
    }
    this.particle.needsUpdate=true;
    if(!alive){this.active=false;this.mesh.visible=false;}
  }
}

/** Explicit immutable-world contract: shaders animate; the movable grass patch writes its own world matrix. */
export class FrozenStadiumGroup extends THREE.Group {
  private frozen = false;
  freezeWorld() { super.updateMatrixWorld(true); this.frozen = true; }
  override updateMatrixWorld(force?: boolean) { if (!this.frozen) super.updateMatrixWorld(force); }
}

export class Stadium {
  readonly group = new FrozenStadiumGroup();
  readonly net: THREE.LineSegments;
  private readonly netRipple: NetRipple;
  readonly sun: THREE.DirectionalLight;
  readonly crowd: THREE.Group;
  private crowdHeads!: THREE.Group;
  private crowdSeats!: THREE.Group;
  private readonly photoCrowd = new THREE.Group();
  private photoCrowdReady = false;
  private disposed = false;
  private quality: Quality = 'high';
  private readonly photoCrowdMaterial = new THREE.MeshBasicMaterial({ color: '#bac9da' });
  private readonly hemisphere = new THREE.HemisphereLight('#bcd2f2', '#264131', 1.7);
  private readonly fill = new THREE.DirectionalLight('#8eb8fc', .65);
  private skyMaterial!: THREE.ShaderMaterial;
  private sunDisc!: THREE.Mesh;
  private readonly glows = new THREE.Group();
  private readonly crowdMotion = { value: new THREE.Vector4(1,0,1,0) };
  private readonly photoMotion = { value: new THREE.Vector2(1,0) };
  private readonly flagTime = { value: 0 };
  private readonly crowdEnergy = { value: 0 };
  private cheerStart = -100;
  private cheerStrength = 0;
  private flags: { geometry: THREE.PlaneGeometry; base: Float32Array }[] = [];
  private confetti!: Confetti;
  private lastUpdate = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
    scene.background = new THREE.Color('#bed1d4');
    scene.fog = new THREE.Fog('#cbd4c1', 78, 215);
    scene.add(this.hemisphere);
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
    this.fill.position.set(22, 18, 32);
    scene.add(this.fill);
    this.makeSky();
    this.makePitch();
    this.net = this.makeGoal();
    this.netRipple = new NetRipple(this.net as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>);
    // Culling bounds include the maximum net displacement; they never need a per-frame rebuild.
    this.net.geometry.computeBoundingSphere();
    this.net.geometry.boundingSphere!.radius += 0.5;
    this.crowd = this.makeStands();
    this.makeBoards();
    this.makeDetails();
    this.makeGrassBlades();
    this.makePhotoCrowd();
    this.confetti = new Confetti(this.group);
    this.batchStaticGeometry();
    this.setAtmosphere('night');
    // Stadium transforms are fixed. Crowd/grass/flags animate in shaders, including the net,
    // and confetti via instance matrices; none needs Object3D matrix recomposition each frame.
    this.group.updateMatrixWorld(true);
    this.group.traverse(object => {
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
    });
    this.group.freezeWorld();
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
    const material = this.skyMaterial = new THREE.ShaderMaterial({
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
        col+=vec3(1.0,0.65,0.3)*sun*0.08; gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 16), material);
    this.group.add(sky);
    const sun = this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff2d4', fog: false }));
    sun.position.set(-110, 54, -194);
    this.group.add(sun);
  }

  private makePitch() {
    this.box(100, 0.25, 137, 0, -0.22, 48, standard('#46694a'));
    const grass = new THREE.MeshStandardMaterial({ map: grassTexture(), normalMap: turfNormal(), normalScale: new THREE.Vector2(.18,.18), roughness: .92, color: '#cbd9c2' });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(78, 118), grass);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, 51);
    pitch.receiveShadow = true;
    this.group.add(pitch);
    const white = new THREE.MeshBasicMaterial({ color: '#e5eeec', transparent: true, opacity: 0.83 });
    const markings: THREE.BufferGeometry[] = [];
    const addMarking = (mesh: THREE.Mesh) => {
      mesh.updateMatrix();
      markings.push(mesh.geometry.applyMatrix4(mesh.matrix));
    };
    const line = (x1: number, z1: number, x2: number, z2: number, width = 0.095) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), white);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.atan2(x2 - x1, z2 - z1);
      mesh.position.set((x1 + x2) / 2, 0.018, (z1 + z2) / 2);
      addMarking(mesh);
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
      addMarking(mesh);
    };
    circle(9.15, 52.5);
    for (const z of [11, 52.5, 94]) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), white);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(0, 0.02, z);
      addMarking(dot);
    }
    this.group.add(new THREE.Mesh(mergeGeometries(markings), white));
    markings.forEach(geometry => geometry.dispose());
  }

  private makeGoal(): THREE.LineSegments {
    const frame = standard('#f2f4ea', 0.3);
    const half = GOAL_WIDTH / 2;
    const pole = (a: number[], b: number[], radius = POST_RADIUS) => {
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

  private makeStands(): THREE.Group {
    const concrete = standard('#454f5b');
    const charcoal = standard('#1b2737');
    const roof = standard('#354350', .65);
    const steel = standard('#788796', .42);
    const random = seededRandom(2045);
    const places: { x: number; y: number; z: number; rotation: number }[] = [];
    for (let r = 0; r < 22; r++) {
      const tier = r >= 11 ? 1 : 0;
      const y = 1.8 + r * .59 + tier * 2.2;
      const z = -12 - r * 1.03 - tier * 1.2;
      this.box(100, .5, 1.07, 0, y - .2, z, concrete);
      for (let c = 0; c < 132; c++) if (c % 22 > 1) places.push({ x: -49 + c * .75, y, z, rotation: 0 });
      for (const side of [-1, 1]) {
        const x = side * (40 + r * 1.03 + tier * 1.2);
        this.box(1.07, .5, 78, x, y - .2, 25, concrete);
        for (let c = 0; c < 99; c++) if (c % 22 > 1) places.push({ x, y, z: -12 + c * .76, rotation: side * Math.PI / 2 });
      }
    }
    const dummy = new THREE.Object3D();
    const seatMat = standard('#30465b');
    const crowdMat = standard('#e8ebec');
    const headMat = standard('#ceb698');
    for (const mat of [crowdMat, headMat]) mat.onBeforeCompile = shader => {
      shader.uniforms.crowdMotion = this.crowdMotion;
      shader.uniforms.crowdEnergy = this.crowdEnergy;
      shader.vertexShader = 'uniform vec4 crowdMotion; attribute vec4 aCrowdPhase;\nuniform float crowdEnergy;\n' + shader.vertexShader;
      // Idle bob, a slow travelling wave along the stands, and a stronger jump after a goal.
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float wave = max(0.0, dot(aCrowdPhase.xy,crowdMotion.xy)) * 0.05;
        float bob = (0.025 + crowdEnergy * 0.2) * dot(aCrowdPhase.zw,crowdMotion.zw);
        transformed.y += bob + wave * (0.6 + crowdEnergy);`);
    };
    const clothes = ['#d8dee2','#d6d4c6','#1b2940','#334860','#ae3d45','#56758f','#87939c','#203448','#a6b6c3','#a57044'];
    const skin = ['#c38d65','#a97555','#794c36','#d4ad87','#49392e'];
    // Random draws keep the original per-seat order, so the crowd looks exactly as before.
    const occupied: boolean[] = [], scales: number[] = [], clothing: string[] = [], skinTone: string[] = [];
    places.forEach(() => {
      const isOccupied = random() > .07;
      occupied.push(isOccupied);
      scales.push(isOccupied ? .85 + random() * .3 : 0);
      clothing.push(clothes[Math.floor(random() * clothes.length)]);
      skinTone.push(skin[Math.floor(random() * skin.length)]);
    });
    // Seats are grouped into 30 m cells, one instanced mesh per cell and part. Cells that are behind or
    // beside the camera are then skipped by frustum culling instead of drawing the whole stadium crowd.
    const cells = new Map<string, number[]>();
    places.forEach((pl, i) => {
      const key = `${Math.floor(pl.x / 30)}/${Math.floor(pl.z / 30)}/${pl.y > 10 ? 1 : 0}`;
      const list = cells.get(key) || [];
      list.push(i);
      cells.set(key, list);
    });
    const seatGeometry = new THREE.BoxGeometry(.48,.43,.4), crowdGeometry = new THREE.CapsuleGeometry(.16,.24,1,5), headGeometry = new THREE.SphereGeometry(.104,6,4);
    const seatsGroup = this.crowdSeats = new THREE.Group(), crowdGroup = new THREE.Group(), headsGroup = this.crowdHeads = new THREE.Group();
    for (const indices of cells.values()) {
      const seats = new THREE.InstancedMesh(seatGeometry, seatMat, indices.length);
      const crowd = new THREE.InstancedMesh(crowdGeometry.clone(), crowdMat, indices.length);
      const heads = new THREE.InstancedMesh(headGeometry.clone(), headMat, indices.length);
      indices.forEach((i, j) => {
        const pl = places[i];
        dummy.position.set(pl.x,pl.y+.12,pl.z); dummy.rotation.set(0,pl.rotation,0); dummy.scale.set(1,1,1); dummy.updateMatrix();
        seats.setMatrixAt(j,dummy.matrix); seats.setColorAt(j,new THREE.Color(i%13<7?'#315678':'#263d57'));
        dummy.position.y=pl.y+.48; dummy.scale.set(occupied[i]?1:0,scales[i],occupied[i]?1:0); dummy.updateMatrix();
        crowd.setMatrixAt(j,dummy.matrix); crowd.setColorAt(j,new THREE.Color(clothing[i]));
        dummy.position.y=pl.y+.76; dummy.scale.setScalar(occupied[i]?1:0); dummy.updateMatrix();
        heads.setMatrixAt(j,dummy.matrix); heads.setColorAt(j,new THREE.Color(skinTone[i]));
      });
      const phase = new Float32Array(indices.length*4);
      indices.forEach((i,j)=>{ const p=places[i],a=p.x*.085,b=p.x*1.7+p.z;phase.set([Math.sin(a),Math.cos(a),Math.sin(b),Math.cos(b)],j*4); });
      for(const mesh of [crowd,heads]) mesh.geometry.setAttribute('aCrowdPhase',new THREE.InstancedBufferAttribute(phase,4));
      seatsGroup.add(seats); crowdGroup.add(crowd); headsGroup.add(heads);
    }
    this.group.add(seatsGroup,crowdGroup,headsGroup);
    crowdGeometry.dispose(); headGeometry.dispose();
    // Continuous upper tier and hospitality band; no flat wall of repeated blocks.
    this.box(103,1.4,.5,0,8.6,-24.4,charcoal);
    this.box(105,1.0,1,0,17.4,-35.2,charcoal);
    this.box(109,.35,25,0,21,-26,roof);
    this.box(109,.75,.5,0,20.55,-13.6,charcoal);
    for(const side of [-1,1]) {
      this.box(22,.35,92,side*54,21,27,roof);
      this.box(.5,.75,92,side*42.9,20.55,27,charcoal);
      this.box(.5,1.4,80,side*53,8.6,25,charcoal);
    }
    for(let x=-50;x<=50;x+=10) {
      this.group.add(cylinderBetween(new THREE.Vector3(x,0,-35),new THREE.Vector3(x,21,-35),.13,steel));
      this.group.add(cylinderBetween(new THREE.Vector3(x,21,-35),new THREE.Vector3(x,20.8,-13.6),.075,steel));
      this.group.add(cylinderBetween(new THREE.Vector3(x,19.1,-35),new THREE.Vector3(x,20.8,-14),.055,steel));
      this.box(.12,.17,23,x,20.8,-25,steel);
    }
    for(let z=-10;z<73;z+=14) for(const side of [-1,1]) {
      this.box(.14,21,.14,side*65,10.5,z,steel);
      this.box(22,.17,.12,side*54,20.8,z,steel);
    }
    const lamps = new THREE.MeshBasicMaterial({color:'#e7f1ff',toneMapped:false});
    const glowCanvas=document.createElement('canvas'); glowCanvas.width=glowCanvas.height=128;
    const ctx=glowCanvas.getContext('2d')!; const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(235,248,255,.65)'); gradient.addColorStop(.12,'rgba(174,212,255,.25)'); gradient.addColorStop(.45,'rgba(144,190,255,.05)'); gradient.addColorStop(1,'rgba(144,190,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    const glowMat=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,opacity:.75});
    for(const x of [-43,-28,-14,0,14,28,43]) {
      this.box(3.4,.26,.55,x,20.1,-13.5,lamps);
      for(let i=0;i<4;i++) this.box(.52,.20,.06,x-1.13+i*.75,20.11,-13.17,lamps);
      const glow=new THREE.Sprite(glowMat);glow.position.set(x,20,-12.9);glow.scale.set(10,7,1);this.glows.add(glow);
    }
    for(const side of [-1,1]) for(const z of [1,21,41]) this.box(.7,.22,3.2,side*42.2,20.1,z,lamps);
    this.group.add(this.glows);
    const name=new THREE.Mesh(new THREE.PlaneGeometry(35,1.13),new THREE.MeshBasicMaterial({map:signageTexture('THE FLOODLIGHT ARENA'),toneMapped:false}));
    name.position.set(0,8.6,-24.05);this.group.add(name);
    return crowdGroup;
  }

  private makeGrassBlades() {
    // Thick single-triangle blades in fixed 8 m tiles plus a dense near-field patch.
    // Density falls with distance from the kick, every tile is its own draw call, and the camera
    // frustum culls off-screen tiles. Two times the blades, 1/3 the triangles per blade: denser turf at 2/3 the vertex cost.
    // Wider, single-triangle blades sway in the vertex shader (no CPU work).
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([
      -.009, 0, 0, .009, 0, 0, 0, .048, .002,
    ], 3));
    blade.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#426d42', side: THREE.DoubleSide });
    mat.onBeforeCompile = shader => {
      shader.uniforms.uWind = this.grassWind;
      shader.vertexShader = 'uniform vec4 uWind; attribute vec4 aWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float sway = position.y * (dot(aWind.xy,uWind.xy)*.6 + dot(aWind.zw,uWind.zw)*.25);
  transformed.x += sway * 0.02;
  transformed.z += sway * 0.008;
#endif`);
    };
    const random = seededRandom(767);
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    const TILE = 8;
    const centres: number[] = [];
    for (let x = -20; x <= 20; x += TILE) for (let z = 4; z <= 44; z += TILE) centres.push(x, z);
    centres.push(0, 22); // A dense four-metre near-field patch follows the kick, not the camera.
    this.grassPatches = [];
    this.grassFull = [];
    for (let i = 0; i < centres.length; i += 2) {
      const cx = centres[i], cz = centres[i + 1];
      // Distance from the kick area (0, 22) sets the density: dense near the ball, sparse at the edges.
      const d = Math.hypot(cx, cz - 22);
      const near = i === centres.length - 2;
      const count = near ? 14400 : d < 12 ? 4320 : d < 22 ? 2400 : 1152;
      const tile = near ? 4 : TILE;
      const patch = new THREE.InstancedMesh(blade.clone(), mat, count);
      for (let n = 0; n < count; n++) {
        const angle = near ? random() * Math.PI * 2 : 0;
        const radius = near ? 4 * Math.sqrt(random() * random()) : 0;
        // Radial density fades into the surrounding turf instead of revealing a square patch.
        const x = cx + (near ? Math.cos(angle) * radius : (random() - .5) * tile);
        const z = cz + (near ? Math.sin(angle) * radius : (random() - .5) * tile);
        dummy.position.set(x, 0.002, z);
        dummy.rotation.set((random() - .5) * .5, random() * Math.PI * 2, (random() - .5) * .35);
        dummy.scale.set(.75 + random() * .6, .7 + random() * .9, .75 + random() * .6);
        dummy.updateMatrix();
        patch.setMatrixAt(n, dummy.matrix);
        const tint = .72 + random() * .42;
        colour.setRGB(tint * .85, tint * 1.05, tint * .72);
        patch.setColorAt(n, colour);
      }
      patch.instanceMatrix.needsUpdate = true;
      if (patch.instanceColor) patch.instanceColor.needsUpdate = true;
      patch.computeBoundingSphere();
      patch.frustumCulled = true;
      // Tiles never move, so their matrices are computed once instead of every frame.
      patch.matrixAutoUpdate = false;
      patch.updateMatrix();
      this.group.add(patch);
      if (near) {
        // Store local instance coordinates so moving this patch needs one matrix update, no re-upload.
        for (let n = 0; n < count; n++) {
          patch.getMatrixAt(n, dummy.matrix); dummy.matrix.elements[12] -= cx; dummy.matrix.elements[14] -= cz; patch.setMatrixAt(n, dummy.matrix);
        }
        patch.position.set(cx, 0, cz); patch.updateMatrix(); patch.computeBoundingSphere(); this.nearGrass = patch;
      }
      if(patch.boundingSphere) patch.boundingSphere.radius += .002; // Include shader sway in culling bounds.
      const wind = new Float32Array(count * 4), matrix = patch.instanceMatrix.array;
      for(let n=0;n<count;n++) {
        const x=matrix[n*16+12],z=matrix[n*16+14],a=x*.9+z*.6,b=z*1.3;
        wind.set([Math.sin(a),Math.cos(a),Math.sin(b),Math.cos(b)],n*4);
      }
      patch.geometry.setAttribute('aWind', new THREE.InstancedBufferAttribute(wind,4));
      this.grassPatches.push(patch);
      this.grassFull.push(count);
    }
    blade.dispose();
  }

  private nearGrass: THREE.InstancedMesh | null = null;
  setKickPosition(position: { x: number; z: number }) {
    if (!this.nearGrass) return;
    this.nearGrass.position.set(position.x, 0, position.z); this.nearGrass.updateMatrix();
    // The stadium tree has frozen world transforms: update this one movable patch explicitly.
    this.nearGrass.matrixWorld.multiplyMatrices(this.group.matrixWorld, this.nearGrass.matrix);
  }

  private grassPatches: THREE.InstancedMesh[] = [];
  private readonly grassWind = { value: new THREE.Vector4(1,0,1,0) };
  private grassFull: number[] = [];

  setQuality(quality: Quality) {
    this.quality = quality;
    this.fill.visible = quality === 'high';
    this.grassPatches.forEach((patch, i) => {
      const full = this.grassFull[i];
      patch.count = quality === 'high' ? full : quality === 'balanced' ? Math.floor(full / 2) : 0;
    });
    this.crowdHeads.visible=!this.photoCrowdReady && quality!=='low';
  }

  setAtmosphere(atmosphere: Atmosphere) {
    const night=atmosphere==='night';const sunset=atmosphere==='sunset';
    this.skyMaterial.uniforms.topColor.value.set(night?'#081226':sunset?'#496b91':'#397caa');
    this.skyMaterial.uniforms.bottomColor.value.set(night?'#304058':sunset?'#e5bb8d':'#c2d2dc');
    this.scene.fog=new THREE.Fog(night?'#192c42':sunset?'#a4b4b0':'#b4c7cf',night?65:85,190);
    // Same light count/shadow budget: cooler open-sky fill, warm directional key and turf bounce.
    this.hemisphere.color.set(night?'#b4c9e5':sunset?'#b4c8df':'#c2d6e6');this.hemisphere.groundColor.set(night?'#34433a':'#627255');
    this.hemisphere.intensity=night?1.15:sunset?1.15:1.45;
    this.sun.color.set(night?'#eff4ff':sunset?'#ffe0b5':'#fff3e3');this.sun.intensity=night?2.65:sunset?2.8:2.95;
    this.sun.position.set(night?-24:-32,night?35:sunset?27:47,night?26:-25);
    this.fill.color.set(night?'#a3c8ef':sunset?'#adc9ec':'#d2e1ee');this.fill.intensity=night?.85:sunset?.95:.7;
    this.sunDisc.visible=!night;this.glows.visible=night;
    this.photoCrowdMaterial.color.set(night?'#98afc9':sunset?'#d5c1a6':'#dde6ea');
    this.sun.shadow.needsUpdate=true;
  }

  private makePhotoCrowd() {
    // A baked, generated anonymous crowd gives richer distant detail in one batched mesh
    // instead of drawing thousands of animated spectator meshes on mobile.
    // Animate the existing atlas strips on the GPU. Their lower edge stays in the seats;
    // the upper edge rises in a travelling cheer. No second crowd mesh or per-frame uploads.
    this.photoCrowdMaterial.onBeforeCompile = shader => {
      shader.uniforms.photoMotion = this.photoMotion; shader.uniforms.crowdEnergy = this.crowdEnergy;
      shader.vertexShader = 'uniform vec2 photoMotion; attribute vec2 aPhotoPhase; uniform float crowdEnergy; attribute float crowdAnchor;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float crowdWave = dot(aPhotoPhase,photoMotion);
        transformed.y += crowdAnchor * (0.012 + crowdEnergy * 0.22) * (0.5 + 0.5 * crowdWave);
      `);
    };
    const geometryParts: THREE.BufferGeometry[] = [];
    const addRow = (x1:number,z1:number,x2:number,z2:number,y:number,u:number,repeats:number,row:number) => {
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute([
        x1,y,z1, x2,y,z2, x2,y+.95,z2, x1,y+.95,z1,
      ],3));
      const v=(row%12)/12;
      geometry.setAttribute('crowdAnchor', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute([u,v,u+repeats,v,u+repeats,v+1/12,u,v+1/12],2));
      geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();geometryParts.push(geometry);
    };
    // Upright row strips, rather than stretched people painted onto a sloping wall.
    for(let r=0;r<22;r++) {
      const tier=r>=11?1:0; const y=1.82+r*.59+tier*2.2; const z=-11.75-r*1.03-tier*1.2;
      for(let block=0;block<5;block++) {
        const x=-50+block*20;
        addRow(x,z,x+18.6,z,y,block*.58,.55,r);
      }
      for(const side of [-1,1]) for(let block=0;block<4;block++) {
        const x=side*(39.75+r*1.03+tier*1.2); const z0=-12+block*19.5;
        if(side<0) addRow(x,z0+18,x,z0,y,block*.55,.54,r);
        else addRow(x,z0,x,z0+18,y,block*.55,.54,r);
      }
    }
    this.photoCrowdMaterial.side=THREE.DoubleSide;
    const crowdGeometry = mergeGeometries(geometryParts);
    crowdGeometry.computeBoundingSphere(); crowdGeometry.boundingSphere!.radius += .25;
    const p = crowdGeometry.attributes.position, phase = new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){const a=p.getX(i)*.21+p.getZ(i)*.17;phase[i*2]=Math.sin(a);phase[i*2+1]=Math.cos(a);}
    crowdGeometry.setAttribute('aPhotoPhase',new THREE.Float32BufferAttribute(phase,2));
    this.photoCrowd.add(new THREE.Mesh(crowdGeometry,this.photoCrowdMaterial));
    geometryParts.forEach(geometry=>geometry.dispose());
    this.photoCrowd.visible=false;this.group.add(this.photoCrowd);
    new THREE.TextureLoader().load('./textures/stadium-crowd.webp',texture=>{
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=4;
      this.photoCrowdMaterial.map=texture;this.photoCrowdMaterial.needsUpdate=true;
      this.photoCrowdReady=true;this.photoCrowd.visible=true;
      // Successful photo load makes these fallback meshes permanently unreachable visually.
      // Free their instance buffers, geometries/materials and scene traversal, not just visibility.
      const fallback=new THREE.Group();fallback.add(this.crowd,this.crowdHeads,this.crowdSeats);
      disposeSceneResources(fallback);
      this.crowd.clear();this.crowdHeads.clear();this.crowdSeats.clear();fallback.clear();
      this.setQuality(this.quality);
    },undefined,()=>{ /* Procedural crowd is retained as an offline-safe fallback. */ });
  }

  /** Static stadium pieces sharing a material become one draw call, not one per step/beam. */
  private batchStaticGeometry() {
    // Batches are split into 30 m spatial cells: one draw call per material and cell, so frustum culling
    // can skip whole sections of stand, boards and steel that are behind or beside the camera.
    const batches=new Map<string,THREE.Mesh[]>();
    for(const child of [...this.group.children]) {
      if(!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || Array.isArray(child.material)) continue;
      const cell=`${Math.floor(child.position.x/30)}/${Math.floor(child.position.z/30)}`;
      const key=`${child.material.uuid}/${child.castShadow}/${child.receiveShadow}/${cell}`;
      const list=batches.get(key)||[];list.push(child);batches.set(key,list);
    }
    for(const items of batches.values()) {
      if(items.length<2) continue;
      const geometries=items.map(item=>{item.updateMatrix();return item.geometry.clone().applyMatrix4(item.matrix);});
      const merged=new THREE.Mesh(mergeGeometries(geometries),items[0].material);
      merged.castShadow=items[0].castShadow;merged.receiveShadow=items[0].receiveShadow;
      merged.matrixAutoUpdate=false;this.group.add(merged);
      for(const item of items){this.group.remove(item);item.geometry.dispose();}
      geometries.forEach(geometry=>geometry.dispose());
    }
  }

  private makeBoards() {
    const texts = ['FREE KICK MASTER', 'MAKE IT UNSAVEABLE.', 'YOUR MOMENT. YOUR GAME.', 'FREE KICK MASTER', 'PRACTICE MAKES PERFECT.'];
    texts.forEach((text, i) => {
      const material = new THREE.MeshBasicMaterial({ map: signageTexture(text, i % 3 !== 1), toneMapped: false });
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
    const flagMat = new THREE.MeshStandardMaterial({ color: '#c2f970', side: THREE.DoubleSide, roughness: 0.7 });
    // The flutter runs on the GPU: the vertex shader uses the same formula the CPU used to write per frame.
    flagMat.onBeforeCompile = shader => {
      shader.uniforms.flagTime = this.flagTime;
      shader.vertexShader = 'uniform float flagTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float flagU = (position.x + 0.235) / 0.47;
        // Pole-anchored flutter, stronger at the free edge.
        transformed.z = position.z + sin(flagTime * 5.2 + flagU * 5.5) * 0.045 * flagU;`);
    };
    for (const side of [-1, 1]) {
      const pole = cylinderBetween(new THREE.Vector3(side * 34, 0, 0), new THREE.Vector3(side * 34, 1.65, 0), 0.022, white);
      this.group.add(pole);
      const geometry = new THREE.PlaneGeometry(0.47, 0.3, 10, 4);
      const flag = new THREE.Mesh(geometry, flagMat);
      flag.position.set(side * 34 + 0.23, 1.49, 0);
      flag.rotation.y = 0.5;
      flag.castShadow = false;
      this.group.add(flag);
      this.flags.push({ geometry, base: (geometry.attributes.position.array as Float32Array).slice() });
    }
    const steel = standard('#334453'), concrete = standard('#66717c');
    // Low-cost hospitality glazing, tunnel lintel, seating rails and a distant city silhouette.
    this.box(5.8,.35,1.1,27,3.5,-12,steel);
    this.box(.35,3.2,1.1,24.2,1.6,-12,concrete);this.box(.35,3.2,1.1,29.8,1.6,-12,concrete);
    for(const side of [-1,1]) {
      this.box(.08,.08,22,side*38.4,1.45,28,steel);
      for(let i=0;i<6;i++)this.box(.08,1.2,.08,side*38.4,.85,18+i*4,steel);
      for(let i=0;i<7;i++) {
        const h=10+(i*7%13);this.box(6,h,9,side*(73+i%3*9),h/2,-55-i*9,concrete);
        this.box(6,.4,9,side*(73+i%3*9),h+.2,-55-i*9,steel);
      }
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
    this.netRipple.hit(point, time);
  }

  /** Crowd reaction: a goal sends the stands up and fires confetti; a near miss only gets a louder roar. */
  celebrate(point: THREE.Vector3, time: number, goal: boolean) {
    this.cheerStart = time;
    this.cheerStrength = goal ? 1 : 0.45;
    if (goal) this.confetti.burst(point);
  }

  dispose() { this.disposed = true; }

  update(time: number) {
    this.photoMotion.value.set(Math.cos(time*1.8),Math.sin(time*1.8));
    this.flagTime.value = time;
    this.grassWind.value.set(Math.cos(time*1.7),Math.sin(time*1.7),Math.cos(time*3.1),Math.sin(time*3.1));
    const dt = this.lastUpdate ? Math.min(0.1, Math.max(0, time - this.lastUpdate)) : 1 / 30;
    this.lastUpdate = time;
    const cheer = time - this.cheerStart;
    this.crowdEnergy.value = cheer < 6 ? Math.exp(-cheer / 2.2) * this.cheerStrength : 0;
    const bob = time*(1.6+this.crowdEnergy.value*5);
    this.crowdMotion.value.set(Math.cos(-time*2.1),Math.sin(-time*2.1),Math.cos(bob),Math.sin(bob));
    this.confetti.update(dt, time);
    this.netRipple.update(time);
  }
}
