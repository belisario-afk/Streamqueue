import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => any;
  accessibility: () => any;
  palette: () => string[];
};

// Lightweight fluid-like flow (safe and fast).
export class Fluid2DScene implements IScene {
  name = "fluid";
  scene = new THREE.Scene();

  private quad: THREE.Mesh | null = null;
  private rtA: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget | null = null;
  private simMat: THREE.ShaderMaterial | null = null;
  private dispMat: THREE.ShaderMaterial | null = null;
  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.cfg = {
      resolution: 512,
      advection: 0.96,
      swirl: 0.7,
      speed: 0.8,
      dye: 0.9
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      resolution: { label: "Sim resolution", type: "range", min: 256, max: 1024, step: 128, default: 512 },
      advection: { label: "Advection", type: "range", min: 0.85, max: 0.995, step: 0.005, default: 0.96 },
      swirl: { label: "Swirl", type: "range", min: 0.0, max: 1.5, step: 0.05, default: 0.7 },
      speed: { label: "Scroll speed", type: "range", min: 0.2, max: 2.0, step: 0.05, default: 0.8 },
      dye: { label: "Dye fade", type: "range", min: 0.7, max: 1.0, step: 0.01, default: 0.9 }
    };
  }
  getConfig(): SceneConfig { return { ...this.cfg }; }
  setConfig(partial: Partial<SceneConfig>) {
    this.cfg = { ...this.cfg, ...partial };
    this.recreateTargets();
  }

  private createRT(size: number) {
    return new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    });
  }

  private recreateTargets() {
    const size = Number(this.cfg.resolution) || 512;
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtA = this.createRT(size);
    this.rtB = this.createRT(size);
  }

  private build() {
    this.recreateTargets();

    // Simulation material (advect + swirl)
    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: null },
        uTime: { value: 0 },
        uAdvect: { value: Number(this.cfg.advection) },
        uSwirl: { value: Number(this.cfg.swirl) },
        uSpeed: { value: Number(this.cfg.speed) },
        uDye: { value: Number(this.cfg.dye) },
        uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime,uAdvect,uSwirl,uSpeed,uDye;
        uniform vec3 uPalette[5];

        float n(vec2 p){ return fract(sin(dot(p, vec2(113.1,17.77))) * 43758.5453); }
        vec2 swirl(vec2 uv){
          float a = sin(uv.y*6.283 + uTime*uSpeed)*0.5 + cos(uv.x*6.283 - uTime*uSpeed)*0.5;
          float r = uSwirl*0.003;
          return uv + r*vec2(cos(a), sin(a));
        }

        void main(){
          vec2 uv = swirl(vUv);
          vec4 prev = texture2D(uTex, uv);
          vec3 inject = mix(uPalette[0], uPalette[1], 0.5 + 0.5*sin(uTime*0.3));
          vec3 col = mix(prev.rgb, inject, 0.01);
          col *= uDye;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    // Display material
    this.dispMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rtA!.texture },
        uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec3 uPalette[5];
        void main(){
          vec3 col = texture2D(uTex, vUv).rgb;
          vec2 uv = vUv*2.0-1.0;
          float vig = 1.0 - smoothstep(0.6, 1.1, length(uv));
          col *= 0.9 + 0.1*vig;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const quadGeom = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeom, this.dispMat);
    this.scene.add(this.quad);
  }

  setPalette(colors: string[]) {
    (this.simMat!.uniforms.uPalette.value as any) = colors.map((c) => new THREE.Color(c));
    (this.dispMat!.uniforms.uPalette.value as any) = colors.map((c) => new THREE.Color(c));
  }

  start(): void {}
  stop(): void {}

  update(_dt: number, t: number): void {
    // Step simulation: rtA -> rtB
    const simU = this.simMat!.uniforms;
    simU.uTex.value = this.rtA!.texture;
    simU.uTime.value = t;
    simU.uAdvect.value = Number(this.cfg.advection);
    simU.uSwirl.value = Number(this.cfg.swirl);
    simU.uSpeed.value = Number(this.cfg.speed);
    simU.uDye.value = Number(this.cfg.dye);

    const oldTarget = this.opts.renderer.getRenderTarget();
    this.opts.renderer.setRenderTarget(this.rtB);
    this.renderFullScreen(this.simMat!);
    this.opts.renderer.setRenderTarget(oldTarget);

    // Swap
    const tmp = this.rtA!;
    this.rtA = this.rtB!;
    this.rtB = tmp;

    // Show
    this.dispMat!.uniforms.uTex.value = this.rtA!.texture;
  }

  private renderFullScreen(mat: THREE.Material) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const scene = new THREE.Scene();
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.opts.renderer.render(scene, camera);
    quad.geometry.dispose();
    (quad.material as any).dispose?.();
  }

  onMacro(name: string, value: number): void {
    if (name === "intensity") this.cfg.swirl = 0.2 + value * 1.2;
  }
}