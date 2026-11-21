import {
  BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Vector3,
} from "three";

const sections = 30;
const sides = 6;
const worldUp = new Vector3(0, 1, 0);
const worldRight = new Vector3(1, 0, 0);

export class GrappleCable extends Mesh<BufferGeometry, ShaderMaterial> {
  private readonly path = new Vector3();
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly end = new Vector3();
  private extended = 0;
  private attached = false;

  constructor() {
    const geometry = new BufferGeometry();
    const positions = new Float32Array((sections + 1) * (sides + 1) * 3);
    const uv = new Float32Array((sections + 1) * (sides + 1) * 2);
    const indices: number[] = [];
    for (let row = 0; row <= sections; row++) {
      for (let col = 0; col <= sides; col++) {
        const a = row * (sides + 1) + col;
        uv[a * 2] = row / sections;
        uv[a * 2 + 1] = col / sides;
        if (row < sections && col < sides) {
          const b = a + sides + 1;
          indices.push(a, b, b + 1, a, b + 1, a + 1);
        }
      }
    }
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    super(geometry, new ShaderMaterial({
      uniforms: {
        time: { value: 0 }, lengthM: { value: 0 },
        jacket: { value: new Color(0x235b6c) }, tracer: { value: new Color(0x91ecff) },
      },
      vertexShader: `
        varying vec2 cableUv;
        void main() {
          cableUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float lengthM;
        uniform vec3 jacket;
        uniform vec3 tracer;
        varying vec2 cableUv;
        void main() {
          float meters = cableUv.x * lengthM;
          float braid = sin((meters * 1.3 + cableUv.y) * 6.2831853) * 0.15 + 0.36;
          float pulse = smoothstep(0.72, 1.0, fract(meters * 0.22 + time * 3.0));
          gl_FragColor = vec4(mix(jacket, tracer, braid + pulse * 0.42) * 1.5, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }));
    this.name = "dx5-flight-cable";
    this.frustumCulled = false;
    this.visible = false;
  }

  update(start: Vector3, anchor: { x: number; y: number; z: number } | null, dt: number, t: number) {
    if (anchor) {
      if (!this.attached) this.extended = 0;
      this.end.set(anchor.x, anchor.y, anchor.z);
      this.extended = Math.min(1, this.extended + dt * 8);
    } else {
      this.extended = Math.max(0, this.extended - dt * 11);
    }
    this.attached = !!anchor;
    this.visible = this.extended > 0;
    if (!this.visible) return;

    const distance = this.path.subVectors(this.end, start).length();
    const span = distance * this.extended;
    this.path.normalize();
    this.axisX.crossVectors(this.path, Math.abs(this.path.y) < .95 ? worldUp : worldRight).normalize();
    this.axisY.crossVectors(this.axisX, this.path);
    const sag = Math.min(.32, span * .015) * (1 - Math.abs(this.path.y)) * (anchor ? .5 : 1);
    const position = this.geometry.getAttribute("position");
    for (let row = 0; row <= sections; row++) {
      const u = row / sections;
      const along = span * u;
      const radius = .0045 + .017 * u;
      for (let col = 0; col <= sides; col++) {
        const angle = col * Math.PI * 2 / sides;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        position.setXYZ(row * (sides + 1) + col,
          start.x + this.path.x * along + this.axisX.x * x + this.axisY.x * y,
          start.y + this.path.y * along + this.axisX.y * x + this.axisY.y * y - sag * Math.sin(u * Math.PI),
          start.z + this.path.z * along + this.axisX.z * x + this.axisY.z * y,
        );
      }
    }
    position.needsUpdate = true;
    this.material.uniforms.time.value = t;
    this.material.uniforms.lengthM.value = span;
  }

  dispose() {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
