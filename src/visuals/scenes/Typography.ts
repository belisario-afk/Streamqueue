import * as THREE from "three";
import type { IScene, SceneConfig, SceneConfigSchema } from "../engine";

type Opts = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  quality: () => any;
  accessibility: () => { reducedMotion: boolean; intensityLimiter: number };
  palette: () => string[];
};

export class TypographyScene implements IScene {
  name = "type";
  scene = new THREE.Scene();

  private mesh: THREE.Mesh | null = null;
  private tex: THREE.CanvasTexture | null = null;
  private uniforms: Record<string, THREE.IUniform> = {};
  private cfg: SceneConfig;

  constructor(private opts: Opts) {
    this.cfg = {
      text: "Spotify Visuals",
      fontSize: 64,
      outline: 0.4,
      wave: 0.3,
      speed: 1.0,
      gradient: true
    };
    this.build();
  }

  getConfigSchema(): SceneConfigSchema {
    return {
      text: { label: "Text", type: "select", options: [{value:"track",label:"Track name"},{value:"artist",label:"Artist"},{value:"custom",label:"Custom"}], default: "track" },
      fontSize: { label: "Font size", type: "range", min: 24, max: 140, step: 2, default: 64 },
      outline: { label: "Outline", type: "range", min: 0, max: 1, step: 0.01, default: 0.4 },
      wave: { label: "Warp amount", type: "range", min: 0, max: 0.8, step: 0.01, default: 0.3 },
      speed: { label: "Warp speed", type: "range", min: 0.2, max: 3, step: 0.05, default: 1.0 },
      gradient: { label: "Gradient fill", type: "checkbox", default: true }
    };
  }
  getConfig(): SceneConfig { return { ...this.cfg }; }
  setConfig(partial: Partial<SceneConfig>) {
    this.cfg = { ...this.cfg, ...partial };
    this.drawText();
  }

  private build() {
    this.uniforms = {
      uTime: { value: 0 },
      uAmount: { value: Number(this.cfg.wave) },
      uSpeed: { value: Number(this.cfg.speed) },
      uOutline: { value: Number(this.cfg.outline) },
      uPalette: { value: this.opts.palette().map((c) => new THREE.Color(c)) }
    };

    const geom = new THREE.PlaneGeometry(3.5, 1.5, 64, 32);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        precision mediump float;
        uniform float uTime, uAmount, uSpeed;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 p = position;
          float w = sin((p.x*4.0 + uTime*uSpeed)*1.5) * 0.07 * uAmount;
          p.y += w * (1.0-abs(p.x)/1.8);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uText;
        uniform float uOutline;
        uniform vec3 uPalette[5];
        void main(){
          vec4 s = texture2D(uText, vUv);
          float alpha = s.a;
          float edge = smoothstep(0.45, 0.55, s.r);
          float outline = smoothstep(0.5-uOutline*0.5, 0.5+uOutline*0.5, edge) - edge;
          vec3 fill = mix(uPalette[0], uPalette[1], vUv.x);
          fill = mix(fill, uPalette[2], 0.35 + 0.35*sin(vUv.y*6.283));
          vec3 col = mix(vec3(0.0), fill, alpha);
          col += outline * 1.0;
          gl_FragColor = vec4(col, max(alpha, outline*0.9));
          if (gl_FragColor.a < 0.02) discard;
        }
      `,
      transparent: true
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);

    this.drawText();
  }

  private drawText() {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fs = Number(this.cfg.fontSize) || 64;
    ctx.font = `bold ${fs}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const pal = this.opts.palette();
    if (this.cfg.gradient) {
      const g = ctx.createLinearGradient(canvas.width * 0.2, 0, canvas.width * 0.8, 0);
      g.addColorStop(0, pal[0]);
      g.addColorStop(0.5, pal[1]);
      g.addColorStop(1, pal[2]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = pal[0];
    }
    ctx.shadowColor = pal[2];
    ctx.shadowBlur = 24;

    const text = typeof this.cfg.text === "string" ? this.cfg.text : "Spotify Visuals";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    this.tex?.dispose();
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.anisotropy = 4;
    this.tex.minFilter = THREE.LinearFilter;
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uText = { value: this.tex };
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uPalette.value = pal.map((c) => new THREE.Color(c));
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uOutline.value = Number(this.cfg.outline);
  }

  setQuality(): void {}
  setPalette(colors: string[]): void {
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uPalette.value = colors.map((c) => new THREE.Color(c));
    this.drawText();
  }
  start(): void {}
  stop(): void {}
  update(_dt: number, t: number): void {
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uSpeed.value = Number(this.cfg.speed);
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uOutline.value = Number(this.cfg.outline);
    (this.mesh!.material as THREE.ShaderMaterial).uniforms.uAmount.value = Number(this.cfg.wave);
  }
  onMacro(name: string, value: number): void {
    if (name === "intensity") {
      this.cfg.outline = Math.min(1, 0.2 + value * 0.8);
    }
  }
}