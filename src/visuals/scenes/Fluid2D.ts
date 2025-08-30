import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => any;
  accessibility: () => any;
  palette: () => string[];
};

// Lightweight fluid-like dye advection with seeding and persistent fullscreen quads.
export class Fluid2DScene implements IScene {
  name = "fluid";
  scene = new THREE.Scene();

  private screenQuad: THREE.Mesh | null = null;
  private simQuad: THREE.Mesh | null = null;
  private orthoCam: THREE.OrthographicCamera | null = null;
  private simScene: THREE.Scene | null = null;

  private rtA: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget | null = null;

  private seedMat: THREE.ShaderMaterial | null = null;
  private simMat: THREE.ShaderMaterial | null = null;
  private dispMat: THREE.ShaderMaterial | null = null;

  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.cfg = {
      resolution: 512,
      advection: 0.965,
      swirl: 0.65,
      speed: 0.75,
      dye: 0.94,
      inject: 0.035
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      resolution: { label: "Sim resolution", type: "range", min: 256, max: 1024, step: 128, default: 512 },
      advection: { label: "Advection", type: "range", min: 0.85, max: 0.995, step: 0.005, default: 0.965 },
      swirl: { label: "Swirl", type: "range", min: 0.0, max: 1.5, step: 0.05, default: 0.65 },
      speed: { label: "Scroll speed", type: "range", min: 0.2, max: 2.0, step: 0.05, default: 0.75 },
      dye: { label: "Dye fade", type: "range", min: 0.85, max: 0.99, step: 0.005, default: 0.94 },
      inject: { label: "Color injection", type: "range", min: 0.01, max: 0.1, step: 0.005, default: 0.035 }
    };
  }
  getConfig(): SceneConfig { return { ...this.cfg }; }
  setConfig(partial: Partial<SceneConfig>) {
    const beforeRes = Number(this.cfg.resolution);
    this.cfg = { ...this.cfg, ...partial };
    const afterRes = Number(this.cfg.resolution);
    if (beforeRes !== afterRes) {
      this.recreateTargets();
      this.seedInitial();
    }
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
    if (this.dispMat) this.dispMat.uniforms.uTex.value = this.rtA.texture;
  }

  private build() {
    // Fullscreen quads and ortho camera
    const plane = new THREE.PlaneGeometry(2, 2);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.dispMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: null },
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
          float vig = 1.0 - smoothstep(0.6, 1.15, length(uv));
          col *= 0.88 + 0.12*vig;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.screenQuad = new THREE.Mesh(plane, this.dispMat);
    this.scene.add(this.screenQuad);

    // Simulation scene
    this.simScene = new THREE.Scene();
    this.simQuad = new THREE.Mesh(plane.clone(), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.simScene.add(this.simQuad);

    // Materials
    this.seedMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uPalette[5];
        float hash(vec2 p){return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);}
        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i+vec2(1,0));
          float c = hash(i+vec2(0,1));
          float d = hash(i+vec2(1,1));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        void main(){
          vec2 uv = vUv;
          float n = noise(uv*8.0) * 0.6 + noise(uv*16.0)*0.4;
          vec3 g = mix(uPalette[0], uPalette[1], uv.x);
          g = mix(g, uPalette[2], 0.35 + 0.35*sin(uv.y*6.283));
          vec3 col = g * (0.25 + 0.75*n);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: null },
        uTime: { value: 0 },
        uAdvect: { value: Number(this.cfg.advection) },
        uSwirl: { value: Number(this.cfg.swirl) },
        uSpeed: { value: Number(this.cfg.speed) },
        uDye: { value: Number(this.cfg.dye) },
        uInject: { value: Number(this.cfg.inject) },
        uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime,uAdvect,uSwirl,uSpeed,uDye,uInject;
        uniform vec3 uPalette[5];

        vec2 swirl(vec2 uv){
          float a = sin((uv.y+uTime*0.1)*6.283*uSpeed)*0.5 + cos((uv.x-uTime*0.1)*6.283*uSpeed)*0.5;
          float r = uSwirl*0.0028;
          return uv + r*vec2(cos(a), sin(a));
        }

        void main(){
          vec2 uv = swirl(vUv);
          vec3 prev = texture2D(uTex, uv).rgb;
          // advect and gently inject palette color
          vec3 inject = mix(uPalette[0], uPalette[1], 0.5 + 0.5*sin(uTime*0.25));
          vec3 col = mix(prev, inject, uInject);
          col *= uDye;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    // Targets and initial seed
    this.recreateTargets();
    this.seedInitial();
    this.dispMat.uniforms.uTex.value = this.rtA!.texture;
  }

  private seedInitial() {
    if (!this.rtA || !this.rtB || !this.simScene || !this.simQuad || !this.seedMat || !this.orthoCam) return;
    const old = this.opts.renderer.getRenderTarget();
    this.simQuad.material = this.seedMat;
    this.opts.renderer.setRenderTarget(this.rtA);
    this.opts.renderer.render(this.simScene, this.orthoCam);
    this.opts.renderer.setRenderTarget(this.rtB);
    this.opts.renderer.render(this.simScene, this.orthoCam);
    this.opts.renderer.setRenderTarget(old);
    this.simQuad.material = this.simMat!;
  }

  setPalette(colors: string[]) {
    const pal = colors.map((c) => new THREE.Color(c));
    (this.seedMat!.uniforms.uPalette.value as any) = pal;
    (this.simMat!.uniforms.uPalette.value as any) = pal;
    (this.dispMat!.uniforms.uPalette.value as any) = pal;
  }

  start(): void {}
  stop(): void {}

  update(_dt: number, t: number): void {
    if (!this.rtA || !this.rtB || !this.simScene || !this.simQuad || !this.simMat || !this.orthoCam) return;

    // Step simulation: rtA -> rtB
    const simU = this.simMat.uniforms;
    simU.uTex.value = this.rtA.texture;
    simU.uTime.value = t;
    simU.uAdvect.value = Number(this.cfg.advection);
    simU.uSwirl.value = Number(this.cfg.swirl);
    simU.uSpeed.value = Number(this.cfg.speed);
    simU.uDye.value = Number(this.cfg.dye);
    simU.uInject.value = Number(this.cfg.inject);

    const oldTarget = this.opts.renderer.getRenderTarget();
    const oldAutoClear = this.opts.renderer.autoClear;
    this.opts.renderer.autoClear = false;

    this.simQuad.material = this.simMat;
    this.opts.renderer.setRenderTarget(this.rtB);
    this.opts.renderer.render(this.simScene, this.orthoCam);

    // Swap
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;

    // Restore
    this.opts.renderer.setRenderTarget(oldTarget);
    this.opts.renderer.autoClear = oldAutoClear;

    // Update display
    this.dispMat!.uniforms.uTex.value = this.rtA.texture;
  }

  onMacro(name: string, value: number): void {
    if (name === "intensity") {
      this.cfg.swirl = 0.2 + value * 1.0;
      this.cfg.inject = 0.02 + value * 0.05;
    }
  }
}