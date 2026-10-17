#!/usr/bin/env node
// Synthetic CPU workloads, NOT browser FPS or phone/thermal/battery measurements.
// The old modules are extracted from the pinned pre-update commit into ignored scratch storage.
// No checkout, branch switch, dependency edits or network access is required.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "d7896bf4a1fe718a201af7f50fe1c076f203b64a";
const scratch = resolve(root, ".artifacts/performance-benchmark");
const old = resolve(scratch, "baseline");
mkdirSync(old, { recursive: true });
for (const name of [
  "physics",
  "physics-math",
  "body-colliders",
  "deferred-bone",
  "keeper",
  "animation",
  "skeleton-layout",
  "chance",
  "simulation",
  "replay",
]) {
  const source = execFileSync(
    "git",
    ["show", `${baseline}:src/game/${name}.ts`],
    { cwd: root, encoding: "utf8" },
  );
  writeFileSync(
    resolve(old, `${name}.ts`),
    source.replaceAll(
      "'../players'",
      JSON.stringify(resolve(root, "src/players.ts")),
    ),
  );
}
const harness = resolve(scratch, "workloads.test.ts");
const modulePath = (name) => JSON.stringify(resolve(root, `src/${name}.ts`));
const oldPath = (name) => JSON.stringify(resolve(old, `${name}.ts`));
const resultPath = resolve(scratch, "results.json");
writeFileSync(
  harness,
  `
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as next from ${modulePath("game/physics")};
import * as previous from ${oldPath("physics")};
import { estimateConversion as newConversion } from ${modulePath("game/chance")};
import { estimateConversion as oldConversion } from ${oldPath("chance")};
import { BodyColliders as NewBody } from ${modulePath("game/body-colliders")};
import { BodyColliders as OldBody } from ${oldPath("body-colliders")};
import { DeferredBone as NewBone } from ${modulePath("game/deferred-bone")};
import { DeferredBone as OldBone } from ${oldPath("deferred-bone")};
import { ReplayBuffer as NewReplay } from ${modulePath("game/replay")};
import { ReplayBuffer as OldReplay } from ${oldPath("replay")};
import { createKeeper } from ${modulePath("game/keeper")};
import { cloneSettings, DEFAULT_SETTINGS } from ${modulePath("state")};

it('measures warmed interleaved old/new CPU workloads, without a flaky speed assertion', () => {
  const setup = { position: { x:-6, z:24 }, aim: { x:2.7, y:1.8 }, contact: { x:-.43, y:0 }, power:.72, foot:'right', seed:1729 } as const;
  const points = new Float32Array(1536), oldBody = new OldBody(), newBody = new NewBody(), keeper = createKeeper(0);
  const oldBones = Array.from({length:120}, () => new OldBone()), newBones = Array.from({length:120}, () => new NewBone());
  const ball = next.launchBall(setup), orientation = {x:0,y:0,z:0,w:1}, oldReplay = new OldReplay(), newReplay = new NewReplay();
  for (let i=0;i<400;i++) { ball.time=i/60; ball.position.x=i; oldReplay.record(ball,keeper,orientation); newReplay.record(ball,keeper,orientation); }
  const pose = bones => { for(let frame=0;frame<500;frame++) for(let i=0;i<bones.length;i++) { const bone=bones[i]; bone.rotation.set(i%4===0?frame*.001:0,.2,.1); bone.flushRotation(); } };
  const sample = replay => { for(let i=0;i<100000;i++) replay.sampleTime((i%2000)/300,ball,keeper,orientation); };
  const snapshots = [new Array(10000),new Array(10000)]; // Retain all copies to prevent dead-code/escape elimination.
  const mixed = body => {
    const a={x:0,y:0,z:0},b={x:0,y:0,z:0},wall={x:0,z:12,yaw:Math.PI};
    for(let i=0;i<10000;i++) {
      keeper.dive=(i%120)/120;keeper.x=(i%100)/50-1;keeper.glove.y=.5+(i%100)/50;
      const z=i%2?12:.7;
      if(i%2)body.wall(wall,(i%80)/100,i/120);else body.keeper(keeper,i/120);
      a.x=b.x=Math.sin(i*.71)*1.8;a.y=b.y=.2+(i%100)/40;a.z=z+.3;b.z=z-.3;
      body.hits(a,b);
    }
  };
  const workloads = {
    conversion_5x64: [() => { for(let i=0;i<5;i++) oldConversion(setup,[],'amateur'); }, () => { for(let i=0;i<5;i++) newConversion(setup,[],'amateur'); }],
    preview_10000: [() => { for(let i=0;i<10000;i++) previous.previewShotInto(setup,points); }, () => { for(let i=0;i<10000;i++) next.previewShotInto(setup,points); }],
    colliders_10000: [() => { for(let i=0;i<10000;i++) { oldBody.keeper(keeper,i/120); oldBody.hits({x:1.5,y:1.7,z:1},{x:1.5,y:1.7,z:.5}); } }, () => { for(let i=0;i<10000;i++) { newBody.keeper(keeper,i/120); newBody.hits({x:1.5,y:1.7,z:1},{x:1.5,y:1.7,z:.5}); } }],
    mixed_colliders_10000: [() => mixed(oldBody), () => mixed(newBody)],
    poses_60000_75percent_static: [() => pose(oldBones), () => pose(newBones)],
    replay_100000: [() => sample(oldReplay), () => sample(newReplay)],
    settings_10000: [() => { for(let i=0;i<10000;i++) snapshots[0][i]=structuredClone(DEFAULT_SETTINGS); }, () => { for(let i=0;i<10000;i++) snapshots[1][i]=cloneSettings(DEFAULT_SETTINGS); }],
  };
  const result = {};
  for(const [name,work] of Object.entries(workloads)) {
    for(let warm=0;warm<3;warm++) for(const run of work) run();
    const samples = [[],[]];
    for(let iteration=0;iteration<9;iteration++) for(const index of iteration%2?[1,0]:[0,1]) {
      const start=performance.now(); work[index](); samples[index].push(performance.now()-start);
    }
    samples.forEach(values => values.sort((a,b)=>a-b));
    result[name] = { baselineMedianMs:samples[0][4], currentMedianMs:samples[1][4], baselineSamplesMs:samples[0], currentSamplesMs:samples[1] };
  }
  writeFileSync(${JSON.stringify(resultPath)},JSON.stringify(result,null,2)+'\\n');
},60000);
`,
);
const config = resolve(scratch, "vitest.config.mjs");
writeFileSync(
  config,
  `export default { test: { include: [${JSON.stringify(harness)}], environment: 'node' } };\n`,
);
execFileSync(
  process.execPath,
  [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--config", config],
  { cwd: root, stdio: "inherit" },
);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const report = {
  baseline,
  node: process.version,
  cpu: cpus()[0]?.model,
  method:
    "Three warmups per side; nine interleaved alternating-order samples; median wall time. Synthetic Node CPU work only; no browser/device FPS inference.",
  workloads: result,
};
writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n");
console.table(
  Object.fromEntries(
    Object.entries(result).map(([name, r]) => [
      name,
      {
        baselineMs: r.baselineMedianMs.toFixed(3),
        currentMs: r.currentMedianMs.toFixed(3),
        timeReductionPercent: (
          (1 - r.currentMedianMs / r.baselineMedianMs) *
          100
        ).toFixed(1),
      },
    ]),
  ),
);
console.log(`Raw measurements: ${resultPath}`);
