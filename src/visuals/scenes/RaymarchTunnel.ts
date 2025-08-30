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
      steps: 256,
      speed: 0.7,
      twist: 1.0,
      radius: 1.2,
      brightness: 1.0
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      steps: { label: "Ray steps", type: "range", min: 64, max: 768, step: 32, default: 256 },
      speed: { label: "Motion speed", type: "range", min: 0.2, max: 2, step: 0.05, default: 0.7 },
      twist: { label: "Twist", type: "range", min: 0, max: 2.5, step: 0.05, default: 1.0 },
      radius: { label: "Radius", type: "range", min: 0.6, max: 2.5, step: 0.05, default: 1.2 },
      brightness: { label: "Brightness", type: "range", min: 0.5, max: 2.0, step: 0.05, default: 1.0 }
    };
  }

  getConfig(): SceneConfig {
    return { ...this.cfg };
  }

  setConfig(partial: Partial<SceneConfig>) {
    this.cfg = { ...this.cfg, ...partial };
  }

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
          float r = uRadius + 0.15*sin(p.z*0.7 + uTime*0.7);
          return length(p.xy) - r;
        }

        vec3 pal(float t){
          vec3 a = uPalette[0];
          vec3 b = uPalette[1];
          vec3 c = uPalette[2];
          return mix(a,b,0.5+0.5*sin(t)) + 0.25*c;
        }

        void main(){
          vec3 ro = vec3(0.0,0.0, uTime*uSpeed*2.0);
          vec3 rd = normalize(vec3(vUv, 1.2));
          float twist = uTwist*(0.4+0.6*sin(uTime*0.2));
          rd.xy = mat2(cos(twist), -sin(twist), sin(twist), cos(twist))*rd.xy;

          float t = 0.0;
          float glow = 0.0;
          for (int i=0;i<768;i++){
            if (float(i) >= uSteps) break;
            vec3 p = ro + rd * t;
            float d = map(p);
            if (d < 0.002) { glow += 0.03; d = 0.005; }
            t += d*0.6;
            glow += 0.006/(0.01 + d*d*50.0);
            if (t>30.0) break;
          }
          vec3 col = pal(t*0.05) * glow * uBright;
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
    if (name === "intensity") this.cfg.brightness = 0.8 + value * 0.8;
  }
}