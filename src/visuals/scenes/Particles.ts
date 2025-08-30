import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => {
    renderScale: number;
    particleBudget: number;
    enablePostFX: boolean;
    chromaticAberration: number;
    bloom: number;
  };
  accessibility: () => { epilepsySafe: boolean; intensityLimiter: number; reducedMotion: boolean };
  palette: () => string[];
};

export class ParticlesScene implements IScene {
  name = "particles";
  scene = new THREE.Scene();
  private group = new THREE.Group();
  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private geom: THREE.BufferGeometry | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};
  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.scene.add(this.group);

    this.cfg = {
      particleCount: 500_000,
      size: 2.0,
      colorMode: "palette", // palette|rainbow|mono
      speed: 1.0,
      curl: 0.7,
      depthFade: true,
      glow: 0.45
    };

    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      particleCount: { label: "Particle count", type: "range", min: 100000, max: 1200000, step: 50000, default: 500000, help: "Total points (higher is heavier)" },
      size: { label: "Point size", type: "range", min: 0.5, max: 5, step: 0.1, default: 2.0 },
      colorMode: { label: "Color mode", type: "select", options: [{value:"palette",label:"Palette"},{value:"rainbow",label:"Rainbow"},{value:"mono",label:"Monochrome"}], default: "palette" },
      speed: { label: "Flow speed", type: "range", min: 0.2, max: 3, step: 0.05, default: 1.0 },
      curl: { label: "Curl noise", type: "range", min: 0, max: 2, step: 0.05, default: 0.7 },
      depthFade: { label: "Depth fade", type: "checkbox", default: true },
      glow: { label: "Glow", type: "range", min: 0, max: 1.2, step: 0.05, default: 0.45 }
    };
  }
  getConfig(): SceneConfig { return { ...this.cfg }; }
  setConfig(partial: Partial<SceneConfig>) {
    this.cfg = { ...this.cfg, ...partial };
    this.rebuildIfNeeded();
    this.updateUniforms();
  }

  private build() {
    const count = Math.min(Number(this.cfg.particleCount) || 500_000, this.opts.quality().particleBudget);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    const rng = Math.random;
    for (let i = 0; i < count; i++) {
      const r = Math.pow(rng(), 0.75) * 10.0;
      const a = rng() * Math.PI * 2;
      const y = (rng() - 0.5) * 6.0;
      positions[i * 3 + 0] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i * 4 + 0] = rng() * 1000;
      seeds[i * 4 + 1] = rng() * 1000;
      seeds[i * 4 + 2] = rng() * 1000;
      seeds[i * 4 + 3] = rng();
    }

    this.geom?.dispose();
    this.geom = new THREE.BufferGeometry();
    this.geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geom.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 4));

    const palette = this.opts.palette().map((c) => new THREE.Color(c));
    this.uniforms = {
      uTime: { value: 0 },
      uSpeed: { value: Number(this.cfg.speed) },
      uCurl: { value: Number(this.cfg.curl) },
      uSize: { value: Number(this.cfg.size) },
      uGlow: { value: Number(this.cfg.glow) },
      uPalette: { value: palette },
      uDepthFade: { value: !!this.cfg.depthFade },
      uIntensity: { value: this.opts.accessibility().intensityLimiter }
    };

    this.material?.dispose();
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        precision mediump float;
        attribute vec4 seed;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uCurl;
        uniform float uSize;
        varying float vGlow;
        varying vec3 vPos;

        float s(float x){return fract(sin(x)*43758.5453123);}
        vec3 curl(vec3 p){
          float n1 = s(p.y+uTime*0.13)+s(p.z*1.37);
          float n2 = s(p.z+uTime*0.11)+s(p.x*1.19);
          float n3 = s(p.x+uTime*0.09)+s(p.y*1.73);
          return normalize(vec3(n1,n2,n3)*2.0-1.0);
        }
        void main(){
          vec3 p = position;
          vec3 v = curl(p*0.12 + seed.xyz*0.03) * uCurl + normalize(vec3(-p.z*0.15, -p.y*0.04, p.x*0.15))*0.28;
          p += v * (uSpeed*0.6);
          vGlow = clamp(length(v)*0.75, 0.0, 1.0);
          vPos = p;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          float depth = max(1.0, -mv.z);
          float sizePx = uSize * (110.0 / depth);
          gl_PointSize = clamp(sizePx, 0.5, 50.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uGlow;
        uniform vec3 uPalette[5];
        uniform bool uDepthFade;
        uniform float uIntensity;
        varying float vGlow;
        varying vec3 vPos;

        vec3 paletteColor(vec3 p){
          float t = 0.5 + 0.5*sin(p.x*0.06 + p.z*0.045);
          vec3 c = mix(uPalette[0], uPalette[1], t);
          c = mix(c, uPalette[2], 0.35 + 0.35*sin(p.y*0.18));
          return c;
        }
        void main(){
          vec2 uv = gl_PointCoord*2.0-1.0;
          float r2 = dot(uv,uv);
          if (r2>1.0) discard;
          float mask = exp(-3.5*r2); // soft falloff
          vec3 col = paletteColor(vPos);
          col *= 0.6; // base dim to avoid whiteout
          col += vGlow * uGlow * 0.5;
          if(uDepthFade){
            float df = clamp(1.0 - (abs(vPos.z)*0.035), 0.0, 1.0);
            col *= df*df;
          }
          col *= uIntensity;
          float alpha = mask * 0.7;
          gl_FragColor = vec4(col, alpha);
          if (gl_FragColor.a < 0.02) discard;
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points?.geometry.dispose();
    (this.points as any)?.material?.dispose();
    this.points = new THREE.Points(this.geom, this.material);
    this.group.clear();
    this.group.add(this.points);
    this.updateUniforms();
  }

  private rebuildIfNeeded() {
    const target = Math.min(Number(this.cfg.particleCount) || 500_000, this.opts.quality().particleBudget);
    const current = (this.geom?.getAttribute("position") as THREE.BufferAttribute | undefined)?.count || 0;
    if (Math.abs(current - target) > 10_000) {
      this.build();
    }
  }

  private updateUniforms() {
    if (!this.material) return;
    this.uniforms.uSize.value = Number(this.cfg.size);
    this.uniforms.uSpeed.value = Number(this.cfg.speed);
    this.uniforms.uCurl.value = Number(this.cfg.curl);
    this.uniforms.uGlow.value = Number(this.cfg.glow);
    const pal = this.opts.palette().map((c) => new THREE.Color(c));
    (this.uniforms.uPalette.value as any) = pal;
  }

  setPalette(colors: string[]): void {
    const pal = colors.map((c) => new THREE.Color(c));
    if (this.uniforms.uPalette) this.uniforms.uPalette.value = pal as any;
  }

  setQuality(q: any): void {
    const max = q?.particleBudget ?? 1_000_000;
    if (Number(this.cfg.particleCount) > max) {
      this.cfg.particleCount = max;
      this.rebuildIfNeeded();
    }
  }

  start(): void {}
  stop(): void {}

  update(_dt: number, t: number): void {
    if (this.uniforms.uTime) this.uniforms.uTime.value = t;
  }

  onMacro(name: string, value: number): void {
    if (name === "intensity") {
      this.uniforms.uGlow.value = 0.25 + 0.8 * value;
    }
  }
}