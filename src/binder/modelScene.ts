import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ModelAngle, ModelUp } from "./content";
import type { ModelMesh } from "./modelData";

export { loadModel } from "./modelData";

/*
 * Draws one 3D model on a page with three.js, for people to turn and zoom.
 * Loaded only when a page has a model on it (ModelView.tsx), so pages
 * without one never fetch three.js.
 *
 * Drag turns it, a right drag or two fingers move it, and pinching or the
 * wheel zooms. The wheel only zooms once the person has clicked into the
 * model, so scrolling down the page past it still scrolls. On a phone a
 * swipe up or down still scrolls the page; a sideways one turns the model.
 *
 * It draws only while something is moving and the model is on screen.
 */

export type SceneSettings = {
  up: ModelUp;
  /** #rrggbb */
  color: string;
  /** Where it's seen from at first */
  view: ModelAngle;
  spin: boolean;
  /** Turning and zooming with the pointer: off while it's being arranged in
   *  the editor */
  interactive: boolean;
};

export type SceneEvents = {
  /** The person turned or zoomed it for the first time */
  onTouch: () => void;
  /** The browser took the drawing away (too many at once) */
  onLost: () => void;
};

const UP: Record<ModelUp, [number, number, number]> = {
  z: [0, 0, 1],
  y: [0, 1, 0],
  x: [1, 0, 0],
  "-z": [0, 0, -1],
  "-y": [0, -1, 0],
  "-x": [-1, 0, 0],
};

const FOV = 30;
/** Seconds a whole turn takes when it spins */
const SPIN_SECONDS = 40;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

const round = (value: number) => Math.round(value * 100) / 100;

function sameAngle(a: ModelAngle, b: ModelAngle) {
  return a.yaw === b.yaw && a.pitch === b.pitch && a.zoom === b.zoom;
}

export class ModelScene {
  private readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  private readonly controls: OrbitControls;
  private readonly geometry = new BufferGeometry();
  private readonly material: MeshStandardMaterial;
  private readonly mesh: Mesh;
  private settings: SceneSettings;
  /** Half the model's size across, once it's stood up */
  private radius = 1;
  /** How far the camera is when the model just fits */
  private fit = 1;
  private frame = 0;
  private last = 0;
  private visible = true;
  private touched = false;
  /** Clicked into, so the wheel zooms it */
  private engaged = false;
  private fullscreen = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly container: HTMLElement;
  private readonly events: SceneEvents;

  constructor(container: HTMLElement, model: ModelMesh, settings: SceneSettings, events: SceneEvents) {
    this.container = container;
    this.events = events;
    this.settings = settings;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    // Lit from the camera, so the side people look at is always lit
    this.scene.add(this.camera);
    this.scene.add(new HemisphereLight(0xffffff, 0x5a5f66, 1.6));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(1.2, 1.6, 1);
    this.camera.add(key);
    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-1.6, -0.5, 0.4);
    this.camera.add(fill);

    this.geometry.setAttribute("position", new BufferAttribute(model.positions, 3));
    this.geometry.setAttribute("normal", new BufferAttribute(model.normals, 3));
    this.geometry.computeBoundingBox();
    // Both sides: some CAD files have triangles facing in
    this.material = new MeshStandardMaterial({
      color: settings.color,
      metalness: 0.2,
      roughness: 0.55,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.autoRotateSpeed = 60 / SPIN_SECONDS;
    this.setTouchScroll();
    this.controls.addEventListener("change", this.kick);
    this.controls.addEventListener("start", this.onStart);

    this.listen(container, "wheel", this.onWheel as EventListener, { capture: true, passive: true });
    this.listen(container, "pointerdown", () => (this.engaged = true), { capture: true });
    this.listen(container, "pointerleave", () => (this.engaged = false));
    this.listen(this.canvas, "webglcontextlost", (event) => {
      event.preventDefault();
      this.events.onLost();
    });
    this.listen(window, "resize", this.resize);
    const sized = new ResizeObserver(this.resize);
    sized.observe(container);
    this.cleanups.push(() => sized.disconnect());
    const seen = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      this.kick();
    });
    seen.observe(container);
    this.cleanups.push(() => seen.disconnect());

    this.standUp();
    this.size();
    this.setAngle(settings.view);
    this.apply();
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  /* ---------------- Drawing ---------------- */

  private tick = (time: number) => {
    const seconds = Math.min(0.1, (time - this.last) / 1000);
    this.last = time;
    const moving = this.controls.update(seconds);
    this.renderer.render(this.scene, this.camera);
    this.frame =
      this.visible && (moving || this.controls.autoRotate) ? requestAnimationFrame(this.tick) : 0;
  };

  /** Draws on the next frame, and keeps going while anything moves */
  private kick = () => {
    if (this.frame || !this.visible) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  };

  /* ---------------- Size and place ---------------- */

  /** Turns the model so its up points up, and puts its middle in the middle */
  private standUp() {
    const [x, y, z] = UP[this.settings.up];
    const turn = new Quaternion().setFromUnitVectors(new Vector3(x, y, z), new Vector3(0, 1, 0));
    this.mesh.quaternion.copy(turn);
    const box = new Box3().copy(this.geometry.boundingBox!).applyMatrix4(new Matrix4().makeRotationFromQuaternion(turn));
    this.mesh.position.copy(box.getCenter(new Vector3())).negate();
    this.radius = box.getSize(new Vector3()).length() / 2 || 1;
  }

  /** The camera's reach for the box's shape: far enough that the model fits
   *  both ways */
  private refit() {
    const half = MathUtils.degToRad(FOV / 2);
    const across = Math.atan(Math.tan(half) * this.camera.aspect);
    this.fit = (this.radius / Math.sin(Math.min(half, across))) * 1.02;
    this.controls.minDistance = this.fit / MAX_ZOOM;
    this.controls.maxDistance = this.fit / MIN_ZOOM;
    this.camera.near = this.radius / 100;
    this.camera.far = this.fit / MIN_ZOOM + this.radius * 2;
    this.camera.updateProjectionMatrix();
  }

  private size() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return false;
    // On screen it can be scaled (the page's canvas is), so draw for that
    const scale = this.container.getBoundingClientRect().width / width || 1;
    const ratio = Math.min(2, window.devicePixelRatio || 1) * scale;
    this.renderer.setPixelRatio(Math.min(ratio, 4096 / Math.max(width, height)));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.refit();
    return true;
  }

  private resize = () => {
    const before = this.fit;
    const distance = this.camera.position.distanceTo(this.controls.target);
    if (!this.size()) return;
    // Keep it as zoomed in as it was
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength((distance * this.fit) / before);
    this.camera.position.copy(this.controls.target).add(offset);
    this.kick();
  };

  private setAngle(angle: ModelAngle) {
    // Ends any drift left from a drag, so it stays where it's put
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.camera.position.setFromSpherical(
      new Spherical(this.fit / angle.zoom, MathUtils.degToRad(angle.pitch), MathUtils.degToRad(angle.yaw)),
    );
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    this.kick();
  }

  /* ---------------- People ---------------- */

  private onStart = () => {
    if (this.touched) return;
    this.touched = true;
    this.controls.autoRotate = false;
    this.events.onTouch();
  };

  private onWheel = (event: WheelEvent) => {
    // Scrolling past it scrolls the page. A pinch on a trackpad comes as a
    // wheel with Ctrl held, and always zooms
    if (this.engaged || this.fullscreen || event.ctrlKey) return;
    event.stopPropagation();
  };

  /** Phones scroll the page with an up or down swipe, unless it's full screen */
  private setTouchScroll() {
    this.canvas.style.touchAction = this.fullscreen ? "none" : "pan-y";
  }

  private apply() {
    this.controls.enabled = this.settings.interactive;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.controls.autoRotate = this.settings.spin && !this.touched && !still;
    this.kick();
  }

  /* ---------------- For ModelView ---------------- */

  update(settings: SceneSettings) {
    const before = this.settings;
    this.settings = settings;
    if (settings.up !== before.up) {
      this.standUp();
      this.refit();
      this.setAngle(settings.view);
    } else if (!sameAngle(settings.view, before.view)) {
      this.setAngle(settings.view);
    }
    if (settings.color !== before.color) this.material.color.set(settings.color);
    // Spin just turned on in the editor: show it, even if it was turned by hand
    if (settings.spin && !before.spin) this.touched = false;
    if (
      settings.up !== before.up ||
      settings.color !== before.color ||
      settings.spin !== before.spin ||
      settings.interactive !== before.interactive
    ) {
      this.apply();
    }
  }

  /** Where it's seen from now (any move sideways left out) */
  currentAngle(): ModelAngle {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const around = new Spherical().setFromVector3(offset);
    return {
      yaw: round(MathUtils.radToDeg(around.theta)),
      pitch: round(MathUtils.clamp(MathUtils.radToDeg(around.phi), 1, 179)),
      zoom: round(MathUtils.clamp(this.fit / around.radius, MIN_ZOOM, MAX_ZOOM)),
    };
  }

  /** Back to where it starts */
  reset() {
    this.setAngle(this.settings.view);
  }

  zoom(closer: boolean) {
    this.onStart();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = offset.length() / (closer ? 1.25 : 0.8);
    offset.setLength(MathUtils.clamp(distance, this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.kick();
  }

  setFullscreen(on: boolean) {
    this.fullscreen = on;
    this.setTouchScroll();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const cleanup of this.cleanups) cleanup();
    this.controls.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    // Browsers keep only a few drawings going: let go of this one now
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

/** A model drawn in `container`, or null when the browser can't draw 3D */
export function createScene(
  container: HTMLElement,
  model: ModelMesh,
  settings: SceneSettings,
  events: SceneEvents,
): ModelScene | null {
  try {
    return new ModelScene(container, model, settings, events);
  } catch {
    return null;
  }
}
