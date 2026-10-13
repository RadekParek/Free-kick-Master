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
| Aim | Drag the view, tap the goal plane, or use arrows. A goal-plane coordinate sets a reference launch angle. | Original mapping, not a copy of EA's controller code. |
| Contact | A draggable 2D marker on a ball changes sidespin, topspin/backspin, and elevation. | Original coefficients and touch mapping. |
| Foot | Left/right kicking animation and inside/outside curl naming. | Physical contact direction remains consistent; no licensed player traits. |
| Power | Hold for up to 1.65 s to fill 0–100%; release. Over-holding releases automatically at 2.05 s. | Original timing and 16–37 m/s launch-speed curve. |
| Trajectory | Same integration as live flight, at suggested power when idle and actual power when charging. | Full visual training assist; does not reproduce a particular PlayStyle. |
| Keeper | Deterministic, delayed read of the ball's current velocity with capped movement and arm reach. | Original five-level AI, not FC27 difficulty settings. |
| Wall | 0–5 defenders, 9.15 m centre distance, synchronized jump, swept expanded-box collisions. | Articulated visuals with simplified body collision volumes. |
| Goal/frame | 7.32 m wide, 2.44 m high, ball radius 0.11 m, swept frame tests, full-ball goal-line crossing. | Post impacts are resolved as woodwork; subsequent ricochet goals are not modeled. |
| Replay | Recorded ball and keeper states at 60 samples/s, played at 0.55×. | Visual replay, not a newly simulated second attempt. |

## Flight model

`src/game/physics.ts` uses SI units. A fixed 1/120 s integrator applies gravity (9.81 m/s²), linear drag, a decaying Magnus-style force, and deterministic multi-frequency wake perturbations for a near-central contact above 64% power. Contact affects both launch elevation and in-flight acceleration. Turf bounces lose energy and spin.

A reference elevation is solved for the **suggested power**, with no spin. This only converts the aiming control into a useful launch angle. It does **not** solve the actual powered/spinning shot to land at the target. Changing power or contact can send the ball wide, over, short, into a wall, or into a keeper's reach. The preview uses precisely the same integration as live flight but intentionally does not simulate defensive collisions: the player must read the wall and keeper.

`src/game/simulation.ts` is the shared, tested live-shot stepper: integrate, react keeper, swept wall collision, swept keeper-plane reach test, goal-frame collision, then whole-ball goal crossing. No random success or save probability is used. A 5-second flight limit safely resolves very weak/wide attempts.

## Keeper tuning (original values)

| Level | Reaction delay | Lateral speed | Arm reach | Max tracked height | Spin anticipation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rookie | 430 ms | 1.65 m/s | 0.57 m | 2.05 m | 0.04 |
| Amateur | 320 ms | 2.25 m/s | 0.70 m | 2.24 m | 0.20 |
| Professional | 240 ms | 2.85 m/s | 0.84 m | 2.48 m | 0.42 |
| World class | 170 ms | 3.60 m/s | 1.00 m | 2.62 m | 0.70 |
| Legend | 110 ms | 4.20 m/s | 1.12 m | 2.76 m | 0.90 |

The keeper estimates an intersection after its reaction delay; it does not receive the precomputed trajectory. Saves require the ball to reach a body/arm/glove volume. Higher levels still have finite reach. Shots are reproducible for a given setup and release power.

## Scope and honest limitations

This is a playable stylized 3D training game, not a AAA football engine. It has no full match, licensed players, imported motion capture, multiplayer, wind, teammate runs, free-kick passing, player-attribute selection, or exact FC controller compatibility. The playing area is the attacking training half, outside the penalty area—not unrestricted invalid free-kick positions. Collisions and animations are intentionally simplified for offline mobile performance.

The primary next calibration step is a **user-supplied gameplay capture and concrete control observations** from the desired FC27 mode/platform. That can help tune feel and presentation, but still cannot establish identical proprietary physics from the public guide alone.
