# Free-kick mechanics: research and implementation

Research date: **13 October 2026**. This is a clean-room gameplay interpretation, not a reverse-engineered or exact FC27 implementation.

## Verified interaction model

EA's official **How to take free kicks in EA SPORTS FC** guide describes:

1. Choosing a taker, considering Free Kick Accuracy, Curve, and Shot Power.
2. Aiming toward a part of the goal.
3. Selecting the ball contact point to change spin and trajectory.
4. Building and releasing shot power.
5. Reading a trajectory line and practicing different combinations.

It also describes the Dead Ball PlayStyle as affecting speed, curve, accuracy, and preview length. The page's menu illustrations are identified as FC27 screenshots, but its textual instruction is series-wide. [2](https://help.ea.com/en/articles/ea-sports-fc/free-kicks/)

That official source does **not** disclose exact launch equations, input curves, power-to-speed mapping, spin coefficients, hitboxes, animation timestamps, goalkeeper decisions, or FC27-specific numeric tuning. Third-party search results disagreed on recommended power and other mechanics; their numerical claims were not treated as specifications. No timed-finishing mechanic was added on the basis of unverified claims.

## Our independently implemented equivalents

| Input/system | Free Kick Master implementation | Fidelity limit |
| --- | --- | --- |
| Aim | Drag the view, tap the goal plane, or use arrows. A goal-plane coordinate sets a reference launch angle; the range extends beyond the posts and below ground for low drives. | Original mapping, not a copy of EA's controller code. |
| Contact | A draggable 2D marker on a ball changes sidespin, topspin/backspin, and elevation. | Original coefficients and touch mapping. |
| Foot | Left/right kicking animation and inside/outside curl naming. | Physical contact direction remains consistent. The selected player supplies original training attributes, not official EA traits. |
| Power | Hold for up to 1.65 s to fill 0–100%; release. Over-holding releases automatically at 2.05 s. | Original timing and 16–37 m/s base speed, multiplied by the selected player’s power attribute. |
| Trajectory | Same integration as live flight, at suggested power when idle and actual power when charging; nominal seed zero for knuckles. | Nominal training assist, not an exact predictor of a randomly seeded knuckle wake or a particular PlayStyle. |
| Keeper | Deterministic, delayed read of the ball's current velocity with capped movement and arm reach. | Original five-level AI, not FC27 difficulty settings. |
| Wall | 0–5 defenders, 10.5 m centre distance, synchronized jump, swept expanded-box collisions. | Articulated visuals with simplified body collision volumes. |
| Goal/frame | 7.32 m wide, 2.44 m high, ball radius 0.11 m, swept frame tests, full-ball goal-line crossing. | Swept, dissipative frame contacts can continue into ricochet goals; an attempt is counted once. |
| Replay | Recorded ball and keeper states at 60 samples/s, played at 0.55×. | Visual replay, not a newly simulated second attempt. |

The gameplay camera uses a 24° landscape lens (28° for short landscape, 38° portrait),
with a matching dolly-back to preserve the foreground athlete while enlarging distant subjects.
This is real perspective compression, not scaled-up people or a post-process crop.
In-game left/right controls add a bounded orbit; releasing restores the neutral camera.

## Flight model

`src/game/physics.ts` uses SI units. A fixed 1/120 s integrator applies gravity (9.81 m/s²), speed-dependent quadratic drag, saturated Magnus lift, spin decay, and seeded multi-frequency wake perturbations for a near-central contact above 64% power. Contact affects both launch elevation and in-flight acceleration. The fake extra gravity after the apex is removed. Turf bounces dissipate energy and exchange tangential slip with spin; rolling uses a bounded approximately constant resistance.

A reference elevation is solved for the **suggested power**, with no spin. This only converts the aiming control into a useful launch angle. It does **not** solve the actual powered/spinning shot to land at the target. Changing power or contact can send the ball wide, over, short, into a wall, or into a keeper's reach. The preview uses the same integrator with a stable nominal wake seed; live knuckle attempts have different captured seeds. It intentionally does not simulate defensive collisions: the player must read the wall and keeper.

`src/game/simulation.ts` is the shared, tested live-shot stepper: integrate, react keeper, swept wall collision, swept keeper-plane reach test, goal-frame collision, then whole-ball goal crossing. No random success or save probability is used. A 5-second flight limit safely resolves very weak/wide attempts.

## Version 2 tuning and player attributes

The October 17 model uses a 0.43 kg, 0.11 m radius ball, air density 1.225 kg/m³ and
`F_drag = 0.5 ρ A Cd(v) |v| v`. Cd smoothly decreases from approximately 0.29 to 0.15
through the 18 m/s drag-crisis region. Spin lift saturates at a lift coefficient of 0.28.
These are plausible engineering approximations, not measurements of a particular branded ball.

Central contact within radius 0.17 and power above 64% activates an unsteady wake. Smooth
8.8/15.4 rad/s lateral components (6/2 m/s² reference amplitudes) and a 9.7 rad/s vertical
component (3 m/s²) are modulated by speed, player attribute and the attempt's phase seed.
There is no mandatory downward bias and no steering toward the frame or away from the keeper.
Each live attempt samples one new seed at release; fixed seeds repeat exactly and replay
never resimulates the wake. Identical controls therefore need not produce identical knuckles.
Ordinary curl trajectories are not given random aiming errors.

`src/players.ts` contains **fan-made training ratings**, not current FC27 ratings. They change real flight:

- Speed multiplier: `0.9 + (powerRating - 80) × 0.012`.
- Sidespin multiplier: `0.78 + (curveRating - 80) × 0.028`.
- Wake multiplier: `0.6 + (knuckleRating - 60) × 0.017`, additionally scaled by release power.
- Control reduces a small deterministic upward launch error at excessive power. There is no random accuracy/goal roll.
- The reference elevation also accounts for the player's speed, keeping aim usable rather than silently aiming each player at a different height.

Selecting a player changes preferred foot, initial contact side, shirt number/name, national-colour training kit, approximate body height, and the launch attributes. A shot snapshots the attributes at release; switching is disabled while the attempt is active. Replay retains the recorded shot.

## Keeper tuning (original values)

| Level | Reaction delay | Lateral speed | Arm reach | Max tracked height | Spin anticipation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rookie | 430 ms | 1.65 m/s | 0.57 m | 2.05 m | 0.04 |
| Amateur | 320 ms | 2.25 m/s | 0.70 m | 2.24 m | 0.20 |
| Professional | 240 ms | 2.85 m/s | 0.84 m | 2.48 m | 0.42 |
| World class | 170 ms | 3.60 m/s | 1.00 m | 2.62 m | 0.70 |
| Legend | 110 ms | 4.20 m/s | 1.12 m | 2.76 m | 0.90 |

For ordinary free kicks, these base difficulty profiles remain unchanged. The keeper estimates a goal-line intersection after the profile reaction delay; it does not receive the precomputed trajectory. Saves require the ball to reach a body/arm/glove volume. Higher levels still have finite reach, and shots remain reproducible for a given setup and release power.

Only penalty kicks receive the deliberate difficulty buff: reaction delay is reduced to at most 22% of the selected profile (capped at 75 ms), curve anticipation reaches 1.0, lateral speed and reach increase by 2.0× and 1.5×, and the keeper tracks higher shots. The dive begins earlier and the save volume receives a modest penalty-only expansion. This is an original challenge modifier, not FC27 tuning.

## Scope and honest limitations

This is a playable stylized 3D training game, not a AAA football engine. It has no full match, official EA player/card database, imported motion capture, multiplayer, wind, teammate runs, free-kick passing, or exact FC controller compatibility. Four selectable real players use openly licensed portrait photos and original attributes; their 3D avatars use articulated original bodies and generic CC0 MakeHuman head anatomy, not scanned celebrity faces. Hair and international training-kit patterns vary by player identity. Free-kick placement is limited to the attacking training half, with a separate penalty-spot scenario; it is not unrestricted match play. Collisions and animations are intentionally simplified for offline mobile performance.

The primary next calibration step is a **user-supplied gameplay capture and concrete control observations** from the desired FC27 mode/platform. That can help tune feel and presentation, but still cannot establish identical proprietary physics from the public guide alone.

## Live woodwork rebounds

Posts and the crossbar use swept-sphere contact against round, finite frame members with the
same 6 cm radius as the rendered goal. The first time of contact determines a surface normal;
velocity reflects about that normal with normal restitution 0.68 and tangential retention 0.97.
Spin is damped on impact. These are original, plausible gameplay coefficients, not measured
FC27 values or a full deformable-ball/contact-friction model.

The solver consumes the remaining motion in the tick and checks the goal line again, so an
inside glance, crossbar deflection, multiple frame contacts or a bounce on the grass can still
score. Outside-face/head-on strikes are not steered into the goal. There is no probability roll
or arbitrary minimum speed for a post-and-in. A continuing woodwork event triggers impact sound
without ending/counting the attempt; the eventual result is counted once. The complete ball
must cross the existing goal plane between the posts and below the bar. Clear outward rebounds,
settled balls and a bounded eight-second live-rebound window terminate as woodwork misses.

Tests include mirrored posts, outside misses, slow and fast contacts, contact and goal in the
same tick, crossbar-ground-goal, multiple posts on the line, corner stability and non-increasing
impact kinetic energy. A browser regression verifies the actual score/HUD and replay accounting.

## Procedural animation additions

Athletes now have articulated head and elbow pivots without removing existing geometry.
Preparation adds a weight shift and downward glance; the run-up has elbow drive and a planted
support leg, then blends continuously from the exact contact pose into follow-through.
Goal celebrations, ordinary misses and woodwork misses have separate arm/head reactions.

The goalkeeper adds a pre-contact split-step, velocity-driven lateral footwork, gaze tracking,
low/high reaches, elbow extension, a landing/side-roll and a planted-knee recovery. The footwork
uses the same lateral velocity stored for replay, so the keeper steps while moving instead of
sliding. Wall players brace with forearms and tuck their knees during a jump. Reactions start only
after the final result, not at a still-live post contact. These are authored procedural poses, not
motion capture or full inverse-kinematic glove contacts; ordinary free-kick collision reach is
unchanged, with a separate penalty-only save boost.
