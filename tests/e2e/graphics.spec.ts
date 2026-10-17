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
    const { Player } = await import(playerPath), { getPlayer } = await import(rosterPath), { PostStack } = await import(postPath);
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
    post.configure({ msaa: 0, smaa: true, bloom: true, quality: 'high' }, 360, 600);
    const results = [];
    for (const id of ['ronaldo', 'messi', 'mbappe', 'salah', 'haaland', 'modric', 'vinicius-special']) {
      player.setProfile(getPlayer(id)); player.idle(.5); player.updateLod(camera);
      post.render();
      results.push({ id, ...player.group.userData.appearance });
    }
    // Keep the final canvas for a visual attachment; release the secondary GPU allocations.
    const image = renderer.domElement.toDataURL('image/png');
    post.dispose(); renderer.dispose(); renderer.domElement.remove();
    return { results, image };
  });
  expect(new Set(rendered.results.map(result => result.hair)).size).toBe(7);
  expect(rendered.results.find(result => result.id === 'messi')!.kit).toBe('stripes');
  expect(rendered.results.find(result => result.id === 'modric')!.kit).toBe('checks');
  expect(rendered.results.find(result => result.id === 'vinicius-special')!.kit).toBe('sash');
  await testInfo.attach('braided-special-kit', { body: Buffer.from(rendered.image.split(',')[1], 'base64'), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
