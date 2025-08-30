import * as THREE from "three";
import { ParticlesScene } from "./scenes/Particles";
import { Fluid2DScene } from "./scenes/Fluid2D";
import { TunnelScene } from "./scenes/RaymarchTunnel";
import { TerrainScene } from "./scenes/Terrain";
import { TypographyScene } from "./scenes/Typography";
import { BasicScene } from "./scenes/Basic";

export type SceneConfigSchema = Record<
  string,
  {
    label: string;
    type: "range" | "checkbox" | "select" | "color";
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string; label: string }>;
    default: number | boolean | string;
    help?: string;
  }
>;
export type SceneConfig = Record<string, number | boolean | string>;

type Quality = {
  renderScale: number;
  taa: boolean;
  particleBudget: number;
  raymarchSteps: number;
  enablePostFX: boolean;
  chromaticAberration: number;
  bloom: number;
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
let canvasEl: HTMLCanvasElement | undefined;
let quality: Quality;
let accessibility: Accessibility;
let currentPalette: string[] = ["#59ffa9", "#5aaaff", "#ff59be", "#ffe459", "#ff8a59"];
let frameGovTarget = 60;
let clock = new THREE.Clock();

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
  setQuality?(q: Quality): void;
  onMacro?(name: string, value: number): void;

  getConfigSchema?(): SceneConfigSchema;
  getConfig?(): SceneConfig;
  setConfig?(cfg: Partial<SceneConfig>): void;
}

export async function initEngine(canvas: HTMLCanvasElement) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    depth: true,
    stencil: false
  });

  (renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace ?? (renderer as any).outputColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  renderer.debug.checkShaderErrors = true;
  renderer.autoClear = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

  const cw = canvas.clientWidth || window.innerWidth || 1280;
  const ch = canvas.clientHeight || window.innerHeight || 720;
  renderer.setSize(cw, ch, false);
  renderer.setClearColor(0x06070a, 1);

  camera = new THREE.PerspectiveCamera(60, cw / ch, 0.1, 4000);
  camera.position.set(0, 0, 5);

  quality = {
    renderScale: 1.0,
    taa: false,
    particleBudget: 1_000_000,
    raymarchSteps: 512,
    enablePostFX: true,
    chromaticAberration: 0.08,
    bloom: 0.7
  };
  accessibility = {
    epilepsySafe: false,
    intensityLimiter: 1.0,
    reducedMotion: false,
    highContrast: false
  };

  active = new ParticlesScene({
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
}

export function isWebGL2(): boolean {
  try {
    return !!renderer?.capabilities?.isWebGL2;
  } catch {
    return false;
  }
}

export function getEngineCanvas() {
  return canvasEl!;
}

export function resizeEngine(w: number, h: number, dpr: number) {
  if (!renderer || !camera || !canvasEl) return;
  const width = Math.max(1, w || canvasEl.clientWidth || window.innerWidth || 1);
  const height = Math.max(1, h || canvasEl.clientHeight || window.innerHeight || 1);
  const scale = Math.max(1, Math.min(dpr || window.devicePixelRatio || 1, 1.6)) * (quality?.renderScale || 1);
  renderer.setPixelRatio(scale);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function setQuality(q: Partial<Quality>) {
  quality = { ...quality, ...q };
  active.setQuality?.(quality);
}

export function setAccessibility(a: Partial<Accessibility>) {
  accessibility = { ...accessibility, ...a };
}

export function updatePalette(colors: string[]) {
  currentPalette = colors.slice(0, 5);
  active.setPalette(colors);
}

export function setMacros(m: { intensity?: number; bloom?: number; glitch?: number; speed?: number }) {
  if (m.intensity !== undefined) active.onMacro?.("intensity", m.intensity);
  if (m.bloom !== undefined) active.onMacro?.("bloom", m.bloom);
  if (m.glitch !== undefined) active.onMacro?.("glitch", m.glitch);
  if (m.speed !== undefined) active.onMacro?.("speed", m.speed);
}

export function setScene(name: keyof typeof scenes) {
  const ctor = scenes[name] || ParticlesScene;
  if (!renderer || !camera) return;
  try {
    active.stop();
  } catch {}
  active = new ctor({
    renderer,
    camera,
    quality: () => quality,
    accessibility: () => accessibility,
    palette: () => currentPalette
  });
  active.setPalette(currentPalette);
  active.start();
  window.dispatchEvent(new CustomEvent("vj-scene-changed", { detail: { name } }));
}

export function crossfadeToScene(name: keyof typeof scenes, _seconds = 0) {
  setScene(name);
}

export function getActiveSceneName(): string {
  return (active && (active as any).name) || "unknown";
}

export function getSceneConfigSchema(): SceneConfigSchema | null {
  return active.getConfigSchema?.() || null;
}

export function getSceneConfig(): SceneConfig | null {
  return active.getConfig?.() || null;
}

export function setSceneConfig(partial: Partial<SceneConfig>) {
  active.setConfig?.(partial);
}

export function autoPickScene() {
  const order: (keyof typeof scenes)[] = ["particles", "terrain", "tunnel", "fluid", "type"];
  const idx = Math.floor((Date.now() / 12000) % order.length);
  setScene(order[idx]);
}

export function startRender() {
  const loop = () => {
    const dt = clock.getDelta();
    const t = performance.now() / 1000;

    active.onMacro?.("speed", 1.0);
    try {
      active.update(dt, t);
      if (renderer && camera) {
        renderer.render((active as any).scene, camera);
      }
    } catch {
      setScene("basic");
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function setFrameGovernorTarget(fps: number) {
  frameGovTarget = fps;
}