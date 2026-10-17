import { test, expect } from '@playwright/test';

test('loads CC0 anatomy offline and renders all hair/kit identities through the fused HDR pipeline', async ({ page }, testInfo) => {
  const errors: string[] = [], loaded: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.url().includes('/models/human-head-') && response.ok()) loaded.push(response.url()); });
  await page.addInitScript(() => localStorage.setItem('fkm.settings.v1', JSON.stringify({ quality: 'low', sound: false, music: false })));
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass('is-ready');
  expect(loaded.some(url => url.includes('high.bin'))).toBe(true);
  expect(loaded.some(url => url.includes('low.bin'))).toBe(true);

  const rendered = await page.evaluate(async () => {
    const threePath = '/node_modules/.vite/deps/three.js';
    const playerPath = '/src/game/player.ts', rosterPath = '/src/players.ts', postPath = '/src/game/post.ts';
    const THREE = await import(threePath);
    const { Player } = await import(playerPath), { getPlayer, PLAYERS } = await import(rosterPath), { PostStack } = await import(postPath);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(360, 600); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.id = 'anatomy-preview';
    Object.assign(renderer.domElement.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: '999' });
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#26313a');
    const camera = new THREE.PerspectiveCamera(32, .6, .05, 30);
    camera.position.set(.22, 1.38, -2.6); camera.lookAt(0, 1.18, 0); camera.updateMatrixWorld();
    scene.add(new THREE.HemisphereLight('#dbe9f5', '#5a6051', 2));
    const key = new THREE.DirectionalLight('#fff0dd', 3); key.position.set(-2, 4, -4); scene.add(key);
    const player = new Player('taker'); scene.add(player.group);
    const post = new PostStack(renderer, scene, camera);
    post.configure({ antialias: 'fxaa', bloom: true, dof: true, quality: 'high' }, 360, 600);
    post.focus(2.6);
    const results = [];
    for (const { id } of PLAYERS) {
      player.setProfile(getPlayer(id)); player.idle(.5); player.updateLod(camera);
      post.render();
      const body = player.group.children[0].getObjectByName('body');
      results.push({ id, ...player.group.userData.appearance, build: body.scale.x / body.scale.y });
    }
    const aaModes = [], depthBindings = [];
    for (const antialias of ['off', 'fxaa', 'smaa']) {
      post.configure({ antialias, bloom: false, dof: true, quality: 'high' }, 360, 600);
      for(let i=0;i<2;i++){const source=post.composer.readBuffer.depthTexture;post.render();depthBindings.push(post.grade.uniforms.tDepth.value===source);}
      aaModes.push({ mode: antialias, samples: post.composer.renderTarget1.samples });
    }
    const contacts = [];
    for (const profile of PLAYERS) {
      player.setProfile(profile);
      const foot = profile.foot;
      player.run(1, foot, { x: foot === 'right' ? -.6 : .6, y: 0 });
      player.alignStrike(foot, { x: 0, z: 0 }, 1);
      const ankle = player.group.children[0].getObjectByName(foot === 'right' ? 'rightFoot' : 'leftFoot');
      const point = ankle.localToWorld(new THREE.Vector3(0, -.02, -.12));
      contacts.push({ id: profile.id, foot, x: point.x, z: point.z });
    }
    player.setProfile(getPlayer('yamal')); player.idle(0); player.updateLod(camera); post.render();
    const height = player.group.children[0].userData.height;
    // Keep the final canvas for a visual attachment; release the secondary GPU allocations.
    const image = renderer.domElement.toDataURL('image/png');
    post.focus(.6);post.render();const defocused=renderer.domElement.toDataURL('image/png');
    const dofChangesPixels=image!==defocused;
    const low=player.rigs[1],copy=low.copyPose.bind(low);let copies=0;
    low.copyPose=(source:any)=>{copies++;copy(source);};
    for(let i=0;i<20;i++){player.idle(i/60);player.updateLod(camera);}
    const lodCopies=[copies];camera.position.set(0,1,100);camera.updateMatrixWorld();player.updateLod(camera);lodCopies.push(copies);
    const lowMatches=low.head.quaternion.equals(player.rigs[0].head.quaternion);
    player.idle(1);lodCopies.push(copies);camera.position.set(.22,1.38,-2.6);camera.updateMatrixWorld();player.updateLod(camera);player.idle(2);lodCopies.push(copies);
    post.dispose(); renderer.dispose(); renderer.domElement.remove();
    return { results, image, aaModes, contacts, height, depthBindings, dofChangesPixels, lodCopies, lowMatches };
  });
  expect(rendered.results).toHaveLength(42);
  expect(rendered.contacts).toHaveLength(42);
  expect(rendered.aaModes.map(aa => aa.samples)).toEqual([0, 0, 0]);
  expect(rendered.height).toBe(1.8);
  expect(rendered.depthBindings).toEqual(Array(6).fill(true));
  expect(rendered.dofChangesPixels).toBe(true);
  expect(rendered.lodCopies).toEqual([0,1,2,2]);expect(rendered.lowMatches).toBe(true);
  expect(rendered.results.find(result => result.id === 'ronaldo')!.build).toBeCloseTo(1.04);
  expect(rendered.results.find(result => result.id === 'yamal')!.build).toBeCloseTo(.94);
  for (const point of rendered.contacts) { expect(point.x).toBeCloseTo(0, 5); expect(point.z).toBeCloseTo(.09, 5); }
  expect(new Set(rendered.results.map(result => result.hair)).size).toBe(9);
  expect(rendered.results.find(result => result.id === 'messi')!.kit).toBe('stripes');
  expect(rendered.results.find(result => result.id === 'modric')!.kit).toBe('checks');
  expect(rendered.results.find(result => result.id === 'vinicius-special')!.kit).toBe('sash');
  await testInfo.attach('blonde-yamal-game-model', { body: Buffer.from(rendered.image.split(',')[1], 'base64'), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
