import * as THREE from "three";
/** World-space patina keeps generated metal/ceramic surfaces from looking uniformly new. */
export function weatherMaterials(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (
        !(mat instanceof THREE.MeshStandardMaterial) ||
        mat.userData.weathered ||
        mat.emissiveIntensity > 1 ||
        mat.name.includes("visor")
      )
        continue;
      mat.userData.weathered = true;
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = "varying vec3 vPatina;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvPatina=(modelMatrix*vec4(transformed,1.)).xyz;",
        );
        shader.fragmentShader =
          `varying vec3 vPatina;
float ph(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float pn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(ph(i),ph(i+vec3(1,0,0)),f.x),mix(ph(i+vec3(0,1,0)),ph(i+vec3(1,1,0)),f.x),f.y),mix(mix(ph(i+vec3(0,0,1)),ph(i+vec3(1,0,1)),f.x),mix(ph(i+vec3(0,1,1)),ph(i+vec3(1,1,1)),f.x),f.y),f.z);}
` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float patina=pn(vPatina*3.7)*.6+pn(vPatina*39.)*.4;
float streak=pn(vPatina*vec3(23.,.8,23.));
diffuseColor.rgb*=.72+patina*.42;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.71,.56,.43),smoothstep(.66,.85,streak)*.25);`,
        );
      };
      mat.customProgramCacheKey = () => "echo-patina-1";
    }
  });
}
