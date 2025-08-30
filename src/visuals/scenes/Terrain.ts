import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => any;
  accessibility: () => any;
  palette: () => string[];
};

export class TerrainScene implements IScene {
  name = "terrain";
  scene = new THREE.Scene();

  private mesh: THREE.Mesh | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};
  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.cfg = {
      scale: 1.0,
      amplitude: 0.6,
      speed: 0.4,
      wireframe: false,
      shading: "lambert"
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      scale: { label: "Noise scale", type: "range", min: 0.2, max: 3, step: 0.05, default: 1.0 },
      amplitude: { label: "Amplitude", type: "range", min: 0.1, max: 1.5, step: 0.05, default: 0.6 },
      speed: { label: "Scroll speed", type: "range", min: 0.1, max: 2, step: 0.05, default: 0.4 },
      wireframe: { label: "Wireframe", type: "checkbox", default: false },
      shading: { label: "Shading", type: "select", options: [{value:"flat",label:"Flat"},{value:"lambert",label:"Lambert"}], default: "lambert" }
    };
  }

  getConfig(): SceneConfig {
    return { ...this.cfg };
  }

  setConfig(partial: Partial<SceneConfig>) {
    this.cfg = { ...this.cfg, ...partial };
    if (this.mesh) (this.mesh.material as THREE.ShaderMaterial).wireframe = !!this.cfg.wireframe;
  }

  private build() {
    this.uniforms = {
      uTime: { value: 0 },
      uScale: { value: Number(this.cfg.scale) },
      uAmp: { value: Number(this.cfg.amplitude) },
      uSpeed: { value: Number(this.cfg.speed) },
      uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
    };

    const geom = new THREE.PlaneGeometry(8, 8, 200, 200);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        precision mediump float;
        uniform float uTime, uScale, uAmp, uSpeed;
        varying float vH;
        float hash(vec2 p){return fract(sin(dot(p, vec2(41.3,289.1))) * 43758.5453);}
        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i+vec2(1,0));
          float c = hash(i+vec2(0,1));
          float d = hash(i+vec2(1,1));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a, b, u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        float fbm(vec2 p){
          float v=0.0;
          float amp=0.5;
          for(int i=0;i<5;i++){
            v += noise(p)*amp;
            p *= 2.0; amp *= 0.5;
          }
          return v;
        }
        void main(){
          vec3 p = position;
          float h = fbm(p.xz*uScale*0.25 + vec2(0.0, uTime*uSpeed)) * uAmp;
          p.y += h*1.5;
          vH = h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying float vH;
        uniform vec3 uPalette[5];
        void main(){
          vec3 low = mix(uPalette[4], uPalette[0], 0.5);
          vec3 hi = mix(uPalette[1], uPalette[2], 0.5);
          float t = clamp(vH*2.0, 0.0, 1.0);
          vec3 col = mix(low, hi, t);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      wireframe: !!this.cfg.wireframe
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);
  }

  setPalette(colors: string[]): void {
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uPalette.value = colors.map((c) => new THREE.Color(c));
  }

  start(): void {}
  stop(): void {}

  update(_dt: number, t: number): void {
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uScale.value = Number(this.cfg.scale);
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uAmp.value = Number(this.cfg.amplitude);
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uSpeed.value = Number(this.cfg.speed);
  }

  onMacro(name: string, value: number): void {
    if (name === "intensity") this.cfg.amplitude = 0.4 + value * 0.9;
  }
}