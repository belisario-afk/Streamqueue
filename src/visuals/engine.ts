import * as THREE from "three";
import { ParticlesScene } from "./scenes/Particles";
import { Fluid2DScene } from "./scenes/Fluid2D";
import { TunnelScene } from "./scenes/RaymarchTunnel";
import { TerrainScene } from "./scenes/Terrain";
import { TypographyScene } from "./scenes/Typography";
import { BasicScene } from "./scenes/Basic";

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

let renderer: THREE.WebGLRenderer | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let active: IScene;
let pending: IScene | null = null;
let canvasEl: HTMLCanvasElement | undefined;
let quality: Quality;
let accessibility: Accessibility;
let currentPalette: string[] = ["#59ffa9", "#5aaaff", "#ff59be", "#ffe459", "#ff8a59"];
let frameGovTarget = 60;
let clock = new THREE.Clock();
let safeMode = false;
let renderErrorCount = 0;

const scenes: Record<string, new (opts: SceneOptions) => IScene> = {
  basic: BasicScene as any,
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
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false
  });
  // Color/tone defaults
  (renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace || (renderer as any).outputEncoding;
  if ((renderer as any).outputEncoding !== undefined) {
    (renderer as any).outputEncoding = (THREE as any).sRGBEncoding ?? (renderer as any).outputEncoding;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  renderer.debug.checkShaderErrors = true;
  renderer.autoClear = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const cw = canvas.clientWidth || window.innerWidth || 1280;
  const ch = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(cw, ch, false);
  renderer.setClearColor(0x040406, 1);

  camera = new THREE.PerspectiveCamera(60, cw / ch, 0.1, 2000);
  camera.position.set(0, 0, 5);

  quality = {
    renderScale: 1.0,
    msaa: 0,
    taa: false,
    bloom: 0.0,
    ssao: false,
    motionBlur: false,
    dof: false,
    toneMap: "filmic",
    chromaticAberration: 0.0,
    volumetrics: false,
    raymarchSteps: 384,
    softShadowSamples: 8,
    particleCount: 500_000,
    fluidResolution: 384,
    fluidIterations: 20,
    webgpuPathTrace: false
  };
  accessibility = {
    epilepsySafe: false,
    intensityLimiter: 1.0,
    reducedMotion: false,
    highContrast: false
  };

  // Choose initial scene based on capability
  const initial = isWebGL2Capable() ? "particles" : "basic";
  active = new (scenes[initial])({
    renderer,
    camera,
    quality: () => quality,
    accessibility: () => accessibility,
    palette: () => currentPalette
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

export function isWebGL2Capable(): boolean {
  try {
    const gl2 = (renderer as any)?.getContext?.("webgl2");
    return !!gl2;
  } catch {
    return false;
  }
}

function allowedScenesList(): Array<keyof typeof scenes> {
  if (safeMode || !isWebGL2Capable()) {
    return ["basic", "particles", "type"];
  }
  return ["particles", "fluid", "tunnel", "terrain", "type", "basic"];
}

export function setSafeMode(on: boolean) {
  safeMode = on;
  if (safeMode) {
    setScene("basic");
  }
}

export function getEngineCanvas() {
  return canvasEl!;
}

export function resizeEngine(w: number, h: number, dpr: number) {
  if (!renderer || !camera || !canvasEl) return;
  const width = Math.max(1, w || canvasEl.clientWidth || window.innerWidth || 1);
  const height = Math.max(1, h || canvasEl.clientHeight || window.innerHeight || 1);
  const scale = Math.max(1, Math.min(dpr || window.devicePixelRatio || 1, 1.5)) * (quality?.renderScale || 1);
  renderer.setPixelRatio(scale);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function setQuality(q: Partial<Quality>) {
  quality = { ...quality, ...q };
  if (!renderer || !canvasEl) return;
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
  const allowed = new Set(allowedScenesList());
  const pick = allowed.has(name) ? name : "basic";
  const ctor = scenes[pick];
  if (!ctor || !renderer || !camera) return;
  try { active.stop(); } catch {}
  active = new ctor({
    renderer,
    camera,
    quality: () => quality,
    accessibility: () => accessibility,
    palette: () => currentPalette
  });
  active.setPalette(currentPalette);
  active.start();
}

export function crossfadeToScene(name: keyof typeof scenes, seconds = 1.0) {
  if (safeMode || !isWebGL2Capable()) {
    // Avoid GL blending paths that can fail on some GPUs
    setScene(name);
    return;
  }
  const allowed = new Set(allowedScenesList());
  const pick = allowed.has(name) ? name : "basic";
  const ctor = scenes[pick];
  if (!ctor || !renderer || !camera) return;
  if (pending) { try { pending.stop(); } catch {} pending = null; }

  pending = new ctor({
    renderer,
    camera,
    quality: () => quality,
    accessibility: () => accessibility,
    palette: () => currentPalette
  });
  pending.setPalette(currentPalette);
  pending.start();

  const startT = performance.now();
  const fade = () => {
    if (!renderer || !camera || !pending) return;
    const t = (performance.now() - startT) / 1000;
    const k = Math.min(1, seconds > 0 ? t / seconds : 1);

    // Simple two-pass composite using renderer state blending
    const gl: any = (renderer as any).getContext?.() || null;
    const state: any = (renderer as any).state;

    try {
      // Render A
      renderer.setClearAlpha(1);
      renderer.clear();
      state.setBlending(THREE.NoBlending);
      renderer.render((active as any).scene, camera);

      // Render B on top with alpha
      state.setBlending(THREE.NormalBlending, THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor);
      // simulate alpha via material opacity override if present (best-effort)
      renderer.render((pending as any).scene, camera);
      state.setBlending(THREE.NoBlending);
    } catch {
      setScene(pick);
      return;
    }

    if (k < 1) requestAnimationFrame(fade);
    else {
      try { active.stop(); } catch {}
      active = pending!;
      pending = null;
    }
  };
  fade();
}

export function updatePalette(colors: string[]) {
  currentPalette = colors;
  active.setPalette(colors);
  pending?.setPalette(colors);
}

export function autoPickScene() {
  const order = allowedScenesList();
  const idx = Math.floor((Date.now() / 10000) % order.length);
  setScene(order[idx]);
}

export function startRender() {
  const loop = () => {
    const dt = clock.getDelta();
    const t = performance.now() / 1000;

    if (1 / Math.max(dt, 1e-5) < frameGovTarget - 5) {
      active.onMacro?.("speed", 0.9);
    } else {
      active.onMacro?.("speed", 1.0);
    }

    try {
      active.update(dt, t);
      if (renderer && camera) {
        renderer.render((active as any).scene, camera);
      }
      renderErrorCount = 0;
    } catch {
      renderErrorCount++;
      if (renderErrorCount > 3 && !safeMode) {
        setSafeMode(true);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function setFrameGovernorTarget(fps: number) {
  frameGovTarget = fps;
}