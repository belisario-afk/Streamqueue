import * as THREE from "three";
import { ParticlesScene } from "./scenes/Particles";
import { Fluid2DScene } from "./scenes/Fluid2D";
import { TunnelScene } from "./scenes/RaymarchTunnel";
import { TerrainScene } from "./scenes/Terrain";
import { TypographyScene } from "./scenes/Typography";

type Quality = {
  renderScale: number;
  msaa: number;
  taa: boolean;
  bloom: number;
  ssao: boolean;
  motionBlur: boolean;
  dof: boolean;
  toneMap: "filmic" | "aces" | "reinhard";
  chromaticAberration: number;
  volumetrics: boolean;
  raymarchSteps: number;
  softShadowSamples: number;
  particleCount: number;
  fluidResolution: number;
  fluidIterations: number;
  webgpuPathTrace: boolean;
};

type Accessibility = {
  epilepsySafe: boolean;
  intensityLimiter: number;
  reducedMotion: boolean;
  highContrast: boolean;
};

let renderer: THREE.WebGLRenderer;
let sceneA: THREE.Scene;
let sceneB: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let active: IScene;
let pending: IScene | null = null;
let canvasEl: HTMLCanvasElement;
let quality: Quality;
let accessibility: Accessibility;
let currentPalette: string[] = ["#59ffa9", "#5aaaff", "#ff59be", "#ffe459", "#ff8a59"];
let frameGovTarget = 60;
let clock = new THREE.Clock();

const scenes: Record<string, new (opts: SceneOptions) => IScene> = {
  particles: ParticlesScene,
  fluid: Fluid2DScene,
  tunnel: TunnelScene,
  terrain: TerrainScene,
  type: TypographyScene
};

type SceneOptions = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => Quality;
  accessibility: () => Accessibility;
  palette: () => string[];
};

export interface IScene {
  scene: THREE.Scene;
  name: string;
  start(): void;
  stop(): void;
  update(dt: number, t: number): void;
  setPalette(colors: string[]): void;
  onMacro?(name: string, value: number): void;
  onExplode?(): void;
  setQuality?(q: Quality): void;
}

export async function initEngine(canvas: HTMLCanvasElement) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.autoClear = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x040406);

  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
  camera.position.set(0, 0, 5);

  quality = {
    renderScale: 1.0, msaa: 0, taa: false, bloom: 0.8, ssao: true, motionBlur: false, dof: false,
    toneMap: "filmic", chromaticAberration: 0.12, volumetrics: true, raymarchSteps: 512, softShadowSamples: 16,
    particleCount: 1_000_000, fluidResolution: 512, fluidIterations: 30, webgpuPathTrace: false
  };
  accessibility = {
    epilepsySafe: false, intensityLimiter: 1.0, reducedMotion: false, highContrast: false
  };

  // default scene
  active = new ParticlesScene({
    renderer, camera, quality: () => quality, accessibility: () => accessibility, palette: () => currentPalette
  });
  active.start();

  window.addEventListener("vj-macro", (e: any) => {
    active.onMacro?.(e.detail.name, e.detail.value);
  });
  window.addEventListener("vj-explode", () => {
    active.onExplode?.();
  });
  window.addEventListener("vj-scene", (e: any) => {
    crossfadeToScene(e.detail.scene, 1.2);
  });
}

export function getEngineCanvas() {
  return canvasEl;
}

export function resizeEngine(w: number, h: number, dpr: number) {
  renderer.setPixelRatio(Math.min(dpr, 2) * (quality?.renderScale || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function setQuality(q: Partial<Quality>) {
  quality = { ...quality, ...q };
  resizeEngine(canvasEl.clientWidth, canvasEl.clientHeight, window.devicePixelRatio);
  active.setQuality?.(quality);
  pending?.setQuality?.(quality);
}

export function setAccessibility(a: Partial<Accessibility>) {
  accessibility = { ...accessibility, ...a };
}

export function setMacros(m: { intensity?: number; bloom?: number; glitch?: number; speed?: number }) {
  if (m.intensity !== undefined) active.onMacro?.("intensity", m.intensity);
  if (m.bloom !== undefined) active.onMacro?.("bloom", m.bloom);
  if (m.glitch !== undefined) active.onMacro?.("glitch", m.glitch);
  if (m.speed !== undefined) active.onMacro?.("speed", m.speed);
}

export function setScene(name: keyof typeof scenes) {
  const ctor = scenes[name];
  if (!ctor) return;
  active.stop();
  active = new ctor({ renderer, camera, quality: () => quality, accessibility: () => accessibility, palette: () => currentPalette });
  active.setPalette(currentPalette);
  active.start();
}

export function crossfadeToScene(name: keyof typeof scenes, seconds = 1.0) {
  const ctor = scenes[name];
  if (!ctor) return;
  if (pending) { pending.stop(); pending = null; }
  pending = new ctor({ renderer, camera, quality: () => quality, accessibility: () => accessibility, palette: () => currentPalette });
  pending.setPalette(currentPalette);
  pending.start();
  const startT = performance.now();
  const fade = () => {
    const t = (performance.now() - startT) / 1000;
    const k = Math.min(1, t / seconds);
    // simple crossfade: render pending on top with k alpha
    renderScenes(active, pending!, 1 - k, k);
    if (k < 1) requestAnimationFrame(fade);
    else {
      active.stop();
      active = pending!;
      pending = null;
    }
  };
  fade();
}

function renderScenes(a: IScene, b: IScene, aAlpha: number, bAlpha: number) {
  const dt = clock.getDelta();
  const t = performance.now() / 1000;
  a.update(dt, t);
  b.update(dt, t);
  renderer.autoClear = true;
  renderer.setClearAlpha(1);
  renderer.clear();
  (renderer as any).context.enable((renderer as any).context.BLEND);
  (renderer as any).context.blendFunc((renderer as any).context.SRC_ALPHA, (renderer as any).context.ONE_MINUS_SRC_ALPHA);

  renderer.setClearAlpha(aAlpha);
  renderer.render((a as any).scene, camera);

  renderer.setClearAlpha(bAlpha);
  renderer.render((b as any).scene, camera);

  renderer.setClearAlpha(1);
  (renderer as any).context.disable((renderer as any).context.BLEND);
}

export function updatePalette(colors: string[]) {
  currentPalette = colors;
  active.setPalette(colors);
  pending?.setPalette(colors);
}

export function autoPickScene() {
  // simple heuristic: cycle based on time; could use audio features via director cache.
  const order = ["particles","fluid","tunnel","terrain","type"] as const;
  const idx = Math.floor((Date.now() / 10000) % order.length);
  setScene(order[idx]);
}

export function startRender() {
  const loop = () => {
    const dt = clock.getDelta();
    const t = performance.now() / 1000;

    // Adaptive governor (simple): if dt suggests < target fps, reduce quality iterations for fluid/particles next frame via macro "speed"
    if (1 / dt < frameGovTarget - 5) {
      active.onMacro?.("speed", 0.9);
    } else {
      active.onMacro?.("speed", 1.0);
    }

    active.update(dt, t);
    renderer.render((active as any).scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function setFrameGovernorTarget(fps: number) {
  frameGovTarget = fps;
}