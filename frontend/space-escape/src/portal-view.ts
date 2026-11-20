import {
  Color, Frustum, Matrix4, Mesh, PerspectiveCamera, Plane, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget,
} from "three";
import {
  PORTAL_COLORS, PORTAL_RADIUS_X, PORTAL_RADIUS_Y, portalFrame, portalRotation,
  type Portal, type PortalColor, type PortalPair,
} from "../shared/portals";

const vertexShader = `
varying vec2 aperture;
varying vec4 screen;
void main() {
  aperture = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  screen = gl_Position;
}
`;

const fragmentShader = `
uniform vec3 tint;
uniform float time;
uniform bool linked;
uniform bool preview;
uniform sampler2D destination;
varying vec2 aperture;
varying vec4 screen;

void main() {
  float radius = length(aperture);
  if (radius > 1.0) discard;
  float ring = smoothstep(0.86, 0.96, radius);
  float edge = smoothstep(0.96, 1.0, radius);
  float wave = 0.5 + 0.5 * sin(atan(aperture.y, aperture.x) * 13.0 - time * 2.0);
  vec3 interior = tint * ((linked ? 0.21 : 0.065) + 0.045 * wave);
  if (preview) interior = texture2D(destination, screen.xy / screen.w * 0.5 + 0.5).rgb;
  gl_FragColor = vec4(mix(interior, tint * (1.3 + 1.7 * wave), ring) * (1.0 - 0.55 * edge), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makePortal(scene: Scene, color: PortalColor) {
  const target = new WebGLRenderTarget(1, 1);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tint: { value: new Color(color === "blue" ? 0x38bdf8 : 0xff9b43) },
      time: { value: 0 },
      linked: { value: false },
      preview: { value: false },
      destination: { value: target.texture },
    },
  });
  const mesh = new Mesh(new PlaneGeometry(PORTAL_RADIUS_X * 2, PORTAL_RADIUS_Y * 2), material);
  mesh.name = "manual-portal-" + color;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, target, uniforms: material.uniforms };
}

export class PortalView {
  private portals;
  private camera = new PerspectiveCamera();
  private skyCamera = new PerspectiveCamera();
  private size = new Vector2();
  private frustum = new Frustum();
  private clip = new Plane();

  constructor(private scene: Scene, private sky: Scene, private renderer: WebGLRenderer) {
    this.portals = {
      blue: makePortal(scene, "blue"),
      orange: makePortal(scene, "orange"),
    };
  }

  update(pair: PortalPair | undefined, viewer: PerspectiveCamera, skyViewer: PerspectiveCamera, time: number) {
    PORTAL_COLORS.forEach(color => {
      const { mesh, uniforms } = this.portals[color];
      const portal = pair?.[color];
      mesh.visible = !!portal;
      uniforms.time.value = time;
      uniforms.linked.value = !!(pair?.blue && pair.orange);
      uniforms.preview.value = false;
      if (portal) {
        mesh.position.copy(portal.center).addScaledVector(portal.normal, 0.035);
        mesh.quaternion.copy(portalFrame(portal.normal));
        mesh.updateMatrixWorld();
      }
    });
    if (!pair?.blue || !pair.orange) return;

    viewer.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(viewer.projectionMatrix, viewer.matrixWorldInverse));
    for (const color of PORTAL_COLORS) {
      const entry = pair[color]!;
      const exit = color === "blue" ? pair.orange : pair.blue;
      const fromPortal = new Vector3().copy(viewer.position).sub(entry.center);
      if (fromPortal.lengthSq() > 32 ** 2 || fromPortal.dot(entry.normal) < 0.10 ||
          !this.frustum.intersectsObject(this.portals[color].mesh)) continue;
      this.renderDestination(color, entry, exit, viewer, skyViewer);
    }
  }

  private renderDestination(
    color: PortalColor, entry: Portal, exit: Portal, viewer: PerspectiveCamera, skyViewer: PerspectiveCamera,
  ) {
    const { target, uniforms } = this.portals[color];
    const rotation = portalRotation(entry, exit);
    const camera = this.camera;
    camera.position.copy(viewer.position).sub(entry.center).applyQuaternion(rotation).add(exit.center);
    camera.quaternion.copy(rotation).multiply(viewer.quaternion);
    camera.projectionMatrix.copy(viewer.projectionMatrix);
    camera.updateMatrixWorld();

    // Move the virtual camera's near plane to the exit face so the solid backing
    // wall does not occlude the view through the aperture.
    this.clip.setFromNormalAndCoplanarPoint(
      new Vector3().copy(exit.normal), new Vector3().copy(exit.center).addScaledVector(exit.normal, 0.02),
    ).applyMatrix4(camera.matrixWorldInverse);
    const plane = new Vector4(this.clip.normal.x, this.clip.normal.y, this.clip.normal.z, this.clip.constant);
    const projection = camera.projectionMatrix.elements;
    const corner = new Vector4(
      (Math.sign(plane.x) + projection[8]) / projection[0],
      (Math.sign(plane.y) + projection[9]) / projection[5],
      -1,
      (1 + projection[10]) / projection[14],
    );
    const dot = plane.dot(corner);
    if (Math.abs(dot) < 0.0001) return;
    plane.multiplyScalar(2 / dot);
    projection[2] = plane.x;
    projection[6] = plane.y;
    projection[10] = plane.z + 1;
    projection[14] = plane.w;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    this.renderer.getSize(this.size);
    const width = Math.min(640, Math.round(this.size.x * 0.5));
    const height = Math.max(1, Math.round(width * this.size.y / Math.max(1, this.size.x)));
    target.setSize(Math.max(1, width), height);
    const previousTarget = this.renderer.getRenderTarget();
    const previousShadows = this.renderer.shadowMap.autoUpdate;
    const previousAutoClear = this.renderer.autoClear;
    this.skyCamera.position.copy(camera.position);
    this.skyCamera.quaternion.copy(camera.quaternion);
    this.skyCamera.projectionMatrix.copy(skyViewer.projectionMatrix);
    this.skyCamera.projectionMatrixInverse.copy(skyViewer.projectionMatrixInverse);
    this.skyCamera.updateMatrixWorld();
    this.portalVisibility(false);
    try {
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      this.renderer.render(this.sky, this.skyCamera);
      this.renderer.clearDepth();
      this.renderer.render(this.scene, camera);
      uniforms.preview.value = true;
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.shadowMap.autoUpdate = previousShadows;
      this.renderer.autoClear = previousAutoClear;
      this.portalVisibility(true);
    }
  }

  private portalVisibility(visible: boolean) {
    for (const color of PORTAL_COLORS) this.portals[color].mesh.visible = visible;
  }
}
