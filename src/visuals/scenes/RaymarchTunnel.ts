import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => { raymarchSteps: number };
  accessibility: () => any;
  palette: () => string[];
};

export class TunnelScene implements IScene {
  name = "tunnel";
  scene = new THREE.Scene();
  private mesh: THREE.Mesh | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};
  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.cfg = {
      steps: 224,
      speed: 0.65,
      twist: 0.9,
      radius: 1.15,
      brightness: 0.9
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      steps: { label: "Ray steps", type: "range", min: 64, max: 640, step: 32, default: 224 },
      speed: { label: "Motion speed", type: "range", min: 0.2, max: 2, step: 0.05, default: 0.65 },
      twist: { label: "Twist", type: "range", min: 0, max: 2.0, step: 0.05, default: 0.9 },
      radius: { label: "Radius", type: "range", min: 0.7, max: 2.0, step: 0.05, default: 1.15 },
      brightness: { label: "Brightness", type: "range", min: 0.4, max: 1.5, step: 0.05, default: 0.9 }
    };
  }
  getConfig(): SceneConfig { return { ...this.cfg }; }
  setConfig(partial: Partial<SceneConfig>) { this.cfg = { ...this.cfg, ...partial }; }

  private build() {
    this.uniforms = {
      uTime: { value: 0 },
      uSteps: { value: Number(this.cfg.steps) },
      uSpeed: { value: Number(this.cfg.speed) },
      uTwist: { value: Number(this.cfg.twist) },
      uRadius: { value: Number(this.cfg.radius) },
      uBright: { value: Number(this.cfg.brightness) },
      uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
    };

    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv*2.0-1.0;
          gl_Position = vec4(position,1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime,uTwist,uRadius,uSpeed,uBright;
        uniform float uSteps;
        uniform vec3 uPalette[5];

        float map(vec3 p){
          float r = uRadius + 0.12*sin(p.z*0.6 + uTime*0.6);
          return length(p.xy) - r;
        }

        vec3 pal(float t){
          vec3 a = uPalette[0];
          vec3 b = uPalette[1];
          vec3 c = uPalette[2];
          return mix(a,b,0.5+0.5*sin(t*0.5)) + 0.15*c;
        }

        void main(){
          vec3 ro = vec3(0.0,0.0, uTime*uSpeed*2.0);
          vec3 rd = normalize(vec3(vUv, 1.2));
          float tw = uTwist*(0.4+0.6*sin(uTime*0.2));
          rd.xy = mat2(cos(tw), -sin(tw), sin(tw), cos(tw))*rd.xy;

          float t = 0.0;
          float glow = 0.0;
          vec3 acc = vec3(0.0);

          for (int i=0;i<640;i++){
            if (float(i) >= uSteps) break;
            vec3 p = ro + rd * t;
            float d = map(p);
            d = max(d, 0.0005);
            t += d*0.65;

            float g = 0.004/(0.006 + d*d*40.0);
            glow += g;
            if (t>28.0) break;
          }

          glow = clamp(glow, 0.0, 2.2);
          vec3 col = pal(t*0.06) * glow * uBright;
          // Cheap tone map to avoid whiteout
          col = col / (1.0 + col);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);
  }

  setPalette(colors: string[]) {
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uPalette.value = colors.map((c) => new THREE.Color(c));
  }
  start(): void {}
  stop(): void {}
  update(_dt: number, t: number): void {
    const u = (this.mesh!.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = t;
    u.uSteps.value = Number(this.cfg.steps);
    u.uTwist.value = Number(this.cfg.twist);
    u.uRadius.value = Number(this.cfg.radius);
    u.uSpeed.value = Number(this.cfg.speed);
    u.uBright.value = Number(this.cfg.brightness);
  }
  onMacro(name: string, value: number): void {
    if (name === "intensity") this.cfg.brightness = 0.7 + value * 0.7;
  }
}