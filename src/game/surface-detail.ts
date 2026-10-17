import * as THREE from "three";

/** Optional artist-authored skin wrap / cloth sheen, not scanned or spectral skin shading.
 * Defines remove all added shader work in existing presets. No new draws or texture allocations.
 */
export function surfaceDetail(
  material: THREE.MeshStandardMaterial,
  enabled: boolean,
) {
  const configurable = material as THREE.MeshStandardMaterial & {
    defines?: Record<string, number>;
  };
  if (!!configurable.defines?.ATHLETE_DETAIL === enabled) return;
  if (!material.userData.detailHook) {
    material.userData.detailHook = true;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      const skin = material.name === "skin",
        hair = material.name === "hair";
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
#ifdef ATHLETE_DETAIL
      float grazing=pow(1.-clamp(dot(normal,geometryViewDir),0.,1.),3.);
      ${skin ? "reflectedLight.indirectDiffuse += diffuseColor.rgb*vec3(.12,.045,.025)*grazing;" : hair ? "reflectedLight.indirectSpecular += vec3(.025)*grazing;" : "reflectedLight.indirectSpecular += diffuseColor.rgb*.045*grazing;"}

#endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
#ifdef ATHLETE_DETAIL
#ifdef USE_MAP
roughnessFactor=clamp(roughnessFactor+sin(vMapUv.x*160.)*sin(vMapUv.y*190.)*.008,.05,1.);
#endif
#endif`,
      );
    };
    material.customProgramCacheKey = () => `athlete-detail/${material.name}`;
  }
  configurable.defines ??= {};
  if (enabled) configurable.defines.ATHLETE_DETAIL = 1;
  else delete configurable.defines.ATHLETE_DETAIL;
  material.needsUpdate = true;
}
