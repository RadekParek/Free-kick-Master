# Offline human anatomy (CC0)

`human-head-high.bin` and `human-head-low.bin` are modified **MakeHuman** anatomy,
not celebrity face scans. No EA/FC game assets or proprietary likenesses are included.
Hair, clothed body geometry, kit artwork, and animation integration are original to this project.

Upstream: https://github.com/makehumancommunity/makehuman
Pinned revision: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`

Inputs at that revision:
- `makehuman/data/3dobjs/base.obj`
- `makehuman/data/targets/macrodetails/caucasian-male-young.target`

Both inputs explicitly state CC0 in their headers. The upstream `LICENSE.md` section C
covers the base mesh, targets and modifiers as CC0 assets, separately from the AGPL
application source. Only graphical asset data is used here, no upstream program code.
The full CC0 text is included in `CC0-1.0.md`.

Original asset credits: MakeHuman contributors; Manuel Bastioni; Data Collection AB;
Joel Palmius; Jonas Hauquier. CC0 does not require attribution; we retain it for provenance.
License declaration: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md

## Modifications / reproduction

Apply the young adult male target, extract only head/upper-neck faces from the body
group, normalize to a 1.83 m reference body, rotate to the game's forward axis,
recenter to the head pivot, and produce a simplified distant LOD. The game adds
vertex colour shading, fitted hairstyles and facial-hair surfaces. These are generic
anatomy, with small per-player proportions, not photoreal likenesses.

With `gh` authenticated or public API access, from the repository root:

```sh
mkdir -p .artifacts
rev=a8bc2d54ff0ac92e78ff71431b1023eda42bf482
gh api "repos/makehumancommunity/makehuman/contents/makehuman/data/3dobjs/base.obj?ref=$rev" -H 'Accept: application/vnd.github.raw+json' > .artifacts/makehuman-base.obj
gh api "repos/makehumancommunity/makehuman/contents/makehuman/data/targets/macrodetails/caucasian-male-young.target?ref=$rev" -H 'Accept: application/vnd.github.raw+json' > .artifacts/makehuman-male.target
node scripts/generate-human-head.mjs .artifacts/makehuman-base.obj .artifacts/makehuman-male.target
```

Binary layout, little-endian: uint32 vertex count, uint32 index count, float32 xyz
positions, uint16 triangle indices. The renderer validates bounds and indices,
creates normals once, and shares geometry among athletes. Both files are bundled
in the APK and loaded locally before arena creation. No internet is needed at runtime.

The kits are nation-inspired original training designs, not licensed replicas of
current national jerseys. Federation crests, manufacturer marks and sponsors are
not copied. Base/special cards share hair identity; special cards keep their turquoise kit.
